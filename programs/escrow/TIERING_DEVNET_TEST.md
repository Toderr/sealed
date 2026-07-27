# Tiering — devnet verification before the live upgrade

Issue #49, Phases 1–3. The code is built and unit-verified, but one property
**cannot** be checked by inspection and MUST pass on devnet before the live
program is upgraded:

> An existing `Deal` account — funded under the OLD layout, holding real
> escrowed USDC — must remain decodable and spendable after the upgrade.

The new `Deal` fields (`creator`, `buyer_fee_bps`, `seller_fee_bps`,
`asymmetric_fees`) were **appended**, so in principle old accounts are
untouched and Anchor zero-fills the missing tail on read. This test confirms
"in principle" holds in practice. If it fails, escrowed funds on the live
program could become unreadable — hence: throwaway program first, live never
until this is green.

## Setup

Deploy the new program under YOUR key to a fresh program id (same procedure as
PR #21's fee test), so nothing here touches the live program.

```bash
# in WSL, ~/sealed
solana config set --url devnet
anchor build
solana program deploy target/deploy/escrow.so   # note the NEW program id
# point the app at it via NEXT_PUBLIC_ESCROW_PROGRAM_ID for the test session
```

## Test 1 — the layout-safety case (the blocking one)

The goal is a `Deal` written by the OLD code, then read/spent by the NEW code.
Since both are the same deployment here, simulate it:

1. **Before** wiring any tier, create + fund a normal deal (no tier assigned to
   the creator). It snapshots `asymmetric_fees = false`.
2. Confirm it charged the **1% symmetric** fee at funding (buyer paid 0.5%).
3. Release a milestone. Confirm the seller's 0.5% came out and the payout math
   equals a pre-tier deal to the lamport.
4. Confirm `fetchDealRefundState` still decodes it (open the deal page; the
   refund panel must render without the "could not decode" warning).

✅ Pass = a deal with the new fields at their zero values behaves byte-identically
to a pre-tier deal.

## Test 2 — tier assignment + asymmetric pricing

1. `init_config` (if not already), `set_treasury`, and `set_tiers` with:
   ```
   [{ id: 0, creator_fee_bps: 0,  counterparty_fee_bps: 50 },   // SSS  (Reading A)
    { id: 1, creator_fee_bps: 20, counterparty_fee_bps: 50 },   // SS
    { id: 2, creator_fee_bps: 50, counterparty_fee_bps: 50 }]   // S
   ```
2. `set_user_tier(walletA, 0)` — make wallet A an SSS creator.
3. **Buyer-created** deal by wallet A, $1000:
   - Buyer (creator) fee at funding = **$0**
   - Seller (counterparty) fee at release = **$5** total across milestones
4. **Seller-created** deal by wallet A (A is the seller/creator), $1000:
   - Seller (creator) fee = **$0**
   - Buyer (counterparty) fee = **$5**
   - This is the role-swap path — confirm the discount followed the CREATOR, not a fixed side.
5. A deal where wallet A is the **counterparty** (someone else created it):
   - A gets **no discount** — standard 0.5% each side. Tier is a creator-only property.

## Test 3 — the abuse cases (should all fail closed)

1. Create a deal naming a `creator_wallet` that is **neither** party → `InvalidCreator`.
2. Pass a `creator_tier` account whose seed is a **different** wallet than
   `creator_wallet` → Anchor seed constraint rejects (PDA mismatch).
3. `set_tiers` with a duplicate id → `DuplicateTierId`.
4. `set_user_tier` with a `tier_id` not in the config → `UnknownTierId`.
5. Any tier setter called by a **non-authority** wallet → `UnauthorizedAuthority`.

## Test 4 — the has_fee 0-side trap

With the SSS tier (creator 0%), create a buyer-created deal and fund it:
- The buyer pays $0 — but the deal must STILL be fee-bearing, so the seller's
  0.5% is charged at release. If the whole deal came out free, `has_fee`
  regressed.

## Only after all four pass

Upgrade the live program with the lead authority key (the PR #21 / #43
procedure). Then, on the live program: `set_treasury` is already set;
`set_tiers` with the agreed table; `set_user_tier` for each whitelisted wallet.

## Still blocked on a product decision

The `set_tiers` values above use **Reading A** (SSS counterparty pays 0.5%).
If the thread resolves to **Reading B** (counterparty absorbs the full 1%),
only the `counterparty_fee_bps` values change — no code, no redeploy. The
contract supports either; the numbers are the last open question (#49 Q1).

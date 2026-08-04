# Sealed Escrow — Audit Brief

Prepared for the smart-contract audit. This tells the auditor the scope, the
threat model, what to prioritize, what is intentionally out of scope, and the
known sharp edges we already found — so they spend time on real risk, not on
re-discovering things we can just tell them.

---

## 1. What the program is

A milestone-based escrow for B2B deals, settled in USDC on Solana. A buyer funds
an escrow vault; funds release per-milestone to the seller; a platform fee is
taken on each side. Refund paths exist for mutual agreement, buyer cancellation
before funding, and a buyer-only reclaim after a seller goes inactive.

- **Framework:** Anchor `0.31.1` (feature `init-if-needed` enabled)
- **Program:** single program, `programs/escrow/`, ~1,660 lines Rust
- **Live program id (devnet):** `3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ`
- **Token:** USDC (6 decimals), SPL Token program
- **Release profile:** `overflow-checks = true` (arithmetic overflow panics, not wraps)

**Mainnet has not been deployed.** The audit target is the source at the audited
commit; mainnet will be a fresh deploy of that exact code.

---

## 2. Instruction inventory (17)

Escrow core:
- `create_deal` — creates the Deal PDA + escrow vault; snapshots fee/tier
- `fund_escrow` — buyer deposits contract + buyer-side fee
- `release_milestone` — buyer releases one milestone to seller (minus seller fee)
- `refund` — legacy single-tx mutual refund (both sign at once) — **superseded**, kept for in-flight deals
- `approve_refund` — two-step mutual refund (each party approves in their own tx)
- `cancel_deal` — buyer cancels a not-yet-funded deal
- `buyer_timeout_refund` — buyer reclaims after a 30-day inactivity window
- `close_deal` — reclaim rent on a completed/refunded deal

Platform config (authority-gated):
- `init_config` / `set_fee` / `set_treasury` / `set_authority`
- `set_tiers` — replace the pricing tier table
- `set_user_tier` / `clear_user_tier` — per-wallet tier assignment

Migrations (permissionless, idempotent — see §6):
- `migrate_deal` / `migrate_config` — grow pre-tier accounts to the new layout

---

## 3. Accounts / PDAs

| Account | Seeds | Holds |
|---|---|---|
| `Deal` | `["deal", deal_id]` | parties, amounts, status, milestones, fee snapshot, refund approvals, creator, tier rates |
| escrow vault | `["escrow-vault", deal_id]` | the USDC in escrow (PDA-owned token account) |
| `Config` | `["config"]` | authority, treasury, global fee_bps, tier table |
| `UserTier` | `["tier", wallet]` | a wallet's assigned tier id |

`deal_id` is a caller-supplied string (max 32 bytes). The escrow vault is a
PDA-owned token account; the Deal PDA is its authority and signs releases.

---

## 4. Threat model — what we care about most

Ranked. **The top three are where fund loss lives — spend the budget here.**

### 4.1 Fund custody & release correctness (CRITICAL)
- Can anyone but the buyer move escrowed funds? All fund-moving ix require the
  buyer as `Signer` with `has_one = buyer`; verify there's no bypass.
- `release_milestone` pays `deal.milestones[index].amount` **by position**. Verify:
  index bounds, no double-release of the same milestone, `released_amount` can't
  exceed `funded_amount`, and a milestone can't be released twice via status.
- Can total releases + fees ever exceed what was funded? Check the arithmetic in
  `fund_escrow` (buyer fee) and `release_milestone` (seller fee + payout).
- Escrow vault authority: confirm only the Deal PDA can sign transfers out, and
  the signer seeds are correct.

### 4.2 Refund paths — no drain, no double-spend (CRITICAL)
Three refund routes, plus close. Verify each returns AT MOST the unreleased
balance and can't be replayed:
- `approve_refund` (two-step): both `buyer_refund_ok` and `seller_refund_ok` must
  be true before funds move; verify a single party can't trigger it, and that the
  approvals are reset appropriately (they are reset on fund/release — confirm that
  logic can't be gamed to refund already-released money).
- `buyer_timeout_refund`: gated on `now >= funded_at + 30 days`. Verify the clock
  source (Clock sysvar) can't be manipulated, and the window can't be bypassed.
- `refund` (legacy) and `cancel_deal`: confirm status gates prevent refunding a
  funded/in-progress deal through the wrong path.
- `close_deal`: rent reclaim only; confirm it can't run on a deal still holding funds.

### 4.3 Fee & tier logic (HIGH — this is the newest code)
The tier system is the most recent addition and the least battle-tested.
- Fees are **asymmetric per side** and **snapshotted at create_deal**. Verify a
  later `set_tiers`/`set_fee` cannot change an in-flight deal's charge.
- `create_deal` takes `creator_wallet` as an **argument** (the buyer always signs,
  so the creator can't be inferred). It's checked to be a party (`InvalidCreator`),
  and the `UserTier` account is seed-bound to `creator_wallet`. **Verify a caller
  cannot claim a cheaper tier than they're entitled to** — e.g. by naming a
  different wallet, or passing a mismatched tier account. (We believe the
  creator's discount always lands on the creator's OWN fee side, so the worst a
  caller can do is pick a WORSE rate for themselves — please confirm.)
- `has_fee()` gates fee collection. Under a 0%-creator tier ONE side is legitimately
  0; verify that doesn't accidentally zero the OTHER side's fee (we hit and fixed
  this — confirm the fix holds).
- Rounding: fees truncate (favor payee). Confirm no path rounds UP or lets fee
  exceed the configured bps.

### 4.4 Authorization on admin ix (HIGH)
- `set_fee/set_treasury/set_authority/set_tiers/set_user_tier/clear_user_tier` are
  all `has_one = authority`. Confirm none can be called by a non-authority, and
  that `set_authority` can't brick the config (e.g. set to an unusable key — this
  may be acceptable, flag if it's a footgun).
- `set_fee` caps at `MAX_FEE_BPS = 500` (5%). `set_tiers` caps each rate the same.
  Confirm the caps actually bind and there's no overflow path around them.

### 4.5 `init-if-needed` re-initialization (MEDIUM)
`set_user_tier` uses `init_if_needed`. This is a known Anchor footgun class.
Confirm a `UserTier` PDA can't be re-initialized by an attacker to smuggle stale
state, and that only the authority reaches the init path. (We believe the
`has_one = authority` on the config gates it — please verify.)

### 4.6 Account validation / type confusion (MEDIUM)
- Confirm every token account is validated for the right mint and owner (we check
  `owner ==` and mint on treasury/buyer/seller token accounts — verify completeness).
- The migration ix (`migrate_deal`/`migrate_config`) deliberately take **raw
  `UncheckedAccount`** (not `Account<T>`) because the old account is too short to
  deserialize. They validate PDA seeds + program ownership + discriminator by hand.
  **Please scrutinize these two** — hand-rolled account validation is exactly where
  mistakes hide. See §6.

---

## 5. What is OUT of scope (don't spend time here)

- **The off-chain app** (Next.js frontend, Supabase mirror, the AI negotiation
  agent). None of it is trusted for fund movement — the chain is the source of
  truth. The Supabase `sealed_deals` mirror is descriptive only; if it disagrees
  with the chain, the chain wins. Do not audit the LLM, the API routes, or the DB.
- **The `x-wallet` header auth in the app** — it's an off-chain UX gate, unsigned,
  explicitly NOT a security boundary. On-chain instructions enforce their own
  signer checks; that's what matters.
- **`declare_id` / deploy keys** — operational, not contract logic. (For context:
  the program upgrade authority and the config authority are different keys; that's
  intentional.)
- **Tier VALUES** (0% / 0.2% / 0.5%) — a business decision, set via `set_tiers`,
  not a code property. Audit the tier *mechanism*, not the numbers.
- **Front-running / MEV on release** — releases require the buyer's signature, so
  there's no open race to exploit; note if you disagree.
- **Griefing via rent** — creating many deals costs the creator rent; not a
  contract vuln.

---

## 6. Known issues we already found and fixed (verify the fixes, don't re-hunt)

Being upfront so you can confirm rather than rediscover:

1. **Account-layout growth freezes old accounts.** Adding tier fields lengthened
   `Deal` and `Config`. Borsh rejects a short buffer, so after an in-place upgrade
   an old account fails to deserialize (`AccountDidNotDeserialize`) and its escrow
   would be frozen. Fixed by appending fields (never inserting) + `migrate_deal` /
   `migrate_config` to grow old accounts and zero-fill the tail (zero = "untiered",
   the correct legacy meaning). **On a fresh mainnet deploy these migrations never
   fire** — `init_config`/`create_deal` create accounts at full size. But please
   verify: (a) the append-only ordering is actually safe, (b) the two migration
   handlers can't be abused (they only ever grow + zero-fill, permissionless by
   design), (c) `Config` specifically has `tiers` AFTER `bump` — an earlier version
   had it before, which broke deserialization.

2. **`has_fee` zero-side bug.** A 0%-creator tier made one side's fee 0; the
   original gate `fee_bps > 0` would then skip the OTHER side too, making the whole
   deal free. Fixed to check per-side rates when `asymmetric_fees` is set.

3. **Creator is an unauthenticated argument.** `create_deal`'s `creator_wallet` is
   asserted by the (buyer) signer, not signer-proven — the named creator doesn't
   sign. We believe this is safe because the discount lands on the creator's own
   side (a buyer can only give away a discount or pick a worse rate, never gain
   one). **Please confirm this cannot be turned into a cheaper-fee or fund-loss
   exploit.** If `creator` ever gains meaning beyond fee-side selection, it must
   become signer-proven.

---

## 7. Testing status (so you know what's NOT covered by our tests)

- One integration test exists: `tests/platform-fee.ts` (~107 lines), covering the
  original symmetric platform fee.
- **The tier system, the two-step refund, timeout refund, and the migrations have
  NO automated tests.** They were verified manually on devnet and by logic tracing.
  Treat these as unverified by CI — they warrant the closest reading.

---

## 8. Practical pointers for the auditor

- Start at `programs/escrow/src/state.rs` (all account layouts + fee math in one
  file) and `lib.rs` (the 17 entrypoints), then read instruction-by-instruction.
- Fee math lives in `state.rs`: `half_fee` (legacy symmetric), `buyer_fee` /
  `seller_fee` (per-side), `has_fee`, `side_fee`. `create_deal.rs` snapshots it.
- The highest-value files by risk: `create_deal.rs` (190 lines, most complex),
  `release_milestone.rs`, the three refund files, and the two `migrate_*.rs`.
- All PDA seeds are listed in §3; there are only four PDA types.
- Ask us for: the deploy/upgrade history on devnet, the exact audited commit hash,
  and read access to the repo.

# Low-Level Smart Contract Audit — `programs/escrow/`

Read all source under `programs/escrow/src/` (17 instructions, `state.rs`, `error.rs`, `lib.rs`, `Cargo.toml`), plus `tests/platform-fee.ts` and `TIERING_DEVNET_TEST.md`.

---

## Executive summary (mainnet-ready? top 3 low-level risks)

**Mainnet-ready for greenfield deals:** mostly yes — PDA signing, fee snapshotting, mutual-refund clearing, and CPI usage are coherent.

**Mainnet-ready for an in-place program upgrade:** **no** until `migrate_deal` / `migrate_config` are run on every legacy account and Test 1 in `TIERING_DEVNET_TEST.md` passes. Pre-tier accounts fail `AccountDidNotDeserialize` on any instruction that loads `Account<Deal>` or `Account<Config>`.

**Top 3 low-level risks:**

1. **Unchecked u64 arithmetic** in `create_deal` (milestone sum), `fund_escrow` (`funded_amount +=`), `release_milestone` (`released_amount +=`), and `refund` (plain `-`) — wrapping could corrupt balances or bypass `OverFunding`.
2. **Escrow vault token account under-constrained** — all fund/release/refund paths only check `address = deal.escrow_token_account`, not `mint == deal.mint` or `owner/authority == deal` PDA. Safe when deal data is honest; weak defense-in-depth if account bytes were ever wrong.
3. **Vault balance vs. `funded_amount` not reconciled** — direct SPL transfers into the vault (donations) leave residual balance; `close_deal` / `close_account` then fail permanently until dust is burned externally. Griefing / rent-reclaim DoS, not fund theft.

---

## Finding list

### HIGH

**H-1 — Unchecked milestone sum can wrap at deal creation**  
- **File:line:** `create_deal.rs:87-91`  
- **Issue:** `milestones.iter().map(|m| m.amount).sum()` uses unchecked `u64` addition.  
- **Mechanism:** Attacker (buyer) supplies milestone amounts that wrap to equal `total_amount` while individual milestones are huge; later releases transfer real tokens beyond what was funded.  
- **Fix:**

```rust
let milestone_sum: u64 = milestones
    .iter()
    .try_fold(0u64, |acc, m| acc.checked_add(m.amount))
    .ok_or(EscrowError::MathOverflow)?;
require!(milestone_sum == total_amount, EscrowError::MilestoneAmountMismatch);
```

---

### MEDIUM

**M-1 — Unchecked `funded_amount += amount` in fund path**  
- **File:line:** `fund_escrow.rs:43-46, 89`  
- **Issue:** `deal.funded_amount + amount` in `require!` and `deal.funded_amount += amount` are unchecked.  
- **Mechanism:** Overflow could satisfy `<= total_amount` incorrectly or wrap `funded_amount`.  
- **Fix:** Use `checked_add` for both the guard and the update.

**M-2 — Unchecked `released_amount += amount` in release path**  
- **File:line:** `release_milestone.rs:103`  
- **Issue:** `deal.released_amount += amount` can wrap.  
- **Mechanism:** Corrupt `released_amount` → wrong `refund_amount` on mutual refund / timeout.  
- **Fix:** `deal.released_amount = deal.released_amount.checked_add(amount).ok_or(EscrowError::MathOverflow)?;`

**M-3 — Legacy `refund` uses unchecked subtraction**  
- **File:line:** `refund.rs:43-44`  
- **Issue:** `deal.funded_amount - deal.released_amount` (no `checked_sub`).  
- **Mechanism:** If `released_amount > funded_amount` due to any bug/corruption, wraps to huge refund. `approve_refund` correctly uses `checked_sub` at `approve_refund.rs:76-79`.  
- **Fix:** Match `approve_refund` pattern.

**M-4 — Escrow vault missing mint/authority constraints**  
- **File:line:** All instructions using `escrow_token_account` (e.g. `fund_escrow.rs:19-23`, `release_milestone.rs:19-23`)  
- **Issue:** Only `address = deal.escrow_token_account`; no `constraint = escrow_token_account.mint == deal.mint` or authority == deal PDA.  
- **Mechanism:** If `deal.escrow_token_account` were ever wrong in account data, CPI could target wrong mint/account. Currently set only at `create_deal` init — defense-in-depth gap.  
- **Fix:**

```rust
#[account(
    mut,
    address = deal.escrow_token_account,
    constraint = escrow_token_account.mint == deal.mint,
    constraint = escrow_token_account.owner == deal.key(), // SPL "owner" = authority
)]
pub escrow_token_account: Account<'info, TokenAccount>,
```

**M-5 — Post-upgrade freeze without migration (operational, confirmed in code)**  
- **File:line:** `state.rs:56-64`, `migrate_deal.rs:38-46`, `lib.rs:71-77`  
- **Issue:** Appended Borsh fields lengthen `Deal`; old accounts cannot deserialize through `Account<Deal>`.  
- **Mechanism:** All funded legacy deals frozen until permissionless `migrate_deal` runs. Documented correctly; still a deployment blocker.  
- **Fix:** Enforce migration in client before any deal ix; automate Test 1 from `TIERING_DEVNET_TEST.md`.

**M-6 — Vault donation griefing blocks rent reclaim**  
- **File:line:** `close_deal.rs:37-47`, `approve_refund.rs:87-96`  
- **Issue:** No on-chain check that vault balance == 0 (or == expected remainder) before `close_account`. SPL requires zero balance.  
- **Mechanism:** Third party transfers USDC into vault PDA → refund drains `funded - released` → dust remains → `close_deal` reverts forever.  
- **Fix:** Assert `escrow_token_account.amount == 0` before close, or add adminless `sweep_dust` to treasury/buyer after terminal state.

---

### LOW

**L-1 — Wrong error code on migrate owner check**  
- **File:line:** `migrate_deal.rs:57`, `migrate_config.rs:48`  
- **Issue:** `require!(info.owner == ctx.program_id, EscrowError::InvalidCreator)` — semantically wrong (`InvalidCreator` = creator_wallet not a party).  
- **Fix:** Add `InvalidAccountOwner` or reuse `AccountDidNotDeserialize`.

**L-2 — `approve_refund` returns `UnauthorizedBuyer` for non-parties (including would-be sellers)**  
- **File:line:** `approve_refund.rs:57-63`  
- **Issue:** Third party and seller both get `UnauthorizedBuyer` (line 62).  
- **Fix:** `UnauthorizedParty` or branch seller → `UnauthorizedSeller`.

**L-3 — `approve_refund` allows terminal-adjacent states without minimum funding**  
- **File:line:** `approve_refund.rs:27-31, 66-80`  
- **Issue:** Only blocks `Completed` / `Refunded`. On `Created` with zero funding, both parties can approve then hit `InsufficientFunds` — stale dual-approval flags until next fund/release clears them.  
- **Mechanism:** Griefing/noise, not theft.  
- **Fix:** Require `deal.funded_amount > deal.released_amount` before recording approvals, or restrict to `Funded | InProgress`.

**L-4 — `DealStatus::Disputed` and `MilestoneStatus::Completed` are dead variants**  
- **File:line:** `state.rs:155-168`  
- **Issue:** No instruction sets `Disputed` or `Completed`; release goes `Pending → Released` directly (`release_milestone.rs:100`).  
- **Mechanism:** Off-chain/docs may assume dispute flow exists on-chain — it does not.  
- **Fix:** Remove unused variants or add enforcing instructions.

**L-5 — `Reputation` struct unused**  
- **File:line:** `state.rs:177-190`  
- **Issue:** Defined but never referenced in program logic.  
- **Fix:** Remove or implement.

**L-6 — `clear_user_tier` doesn't assert `user_tier.wallet == wallet` arg**  
- **File:line:** `tier.rs:85-96`  
- **Issue:** PDA seeds bind `wallet` arg; stored `wallet` field not cross-checked.  
- **Mechanism:** Low risk — PDA derivation is the real guard.

**L-7 — Buyer platform fee non-refundable by design**  
- **File:line:** `fund_escrow.rs:59-86`; all refund paths  
- **Issue:** `buyer_fee(total_amount)` taken once from buyer wallet; refund paths only return `funded - released` from vault.  
- **Mechanism:** Not exploitable — buyer loses fee on cancel/refund. Product invariant, not enforced in docs on-chain.

**L-8 — `init_config` doesn't explicitly init `tiers`**  
- **File:line:** `config.rs:29-37`  
- **Issue:** Relies on Anchor `init` zero-fill for `tiers: Vec<Tier>`. Correct in practice; worth an explicit `config.tiers = vec![]` for clarity.

**L-9 — `create_deal` allows `buyer == seller`**  
- **File:line:** `create_deal.rs:82-85`  
- **Issue:** No `buyer != seller` constraint.  
- **Mechanism:** Self-deal farce, not cross-party theft.

---

## Per-instruction low-level notes (all 17)

| # | Instruction | Notes |
|---|-------------|-------|
| 1 | `init_config` | `fee_bps` capped at 500 (`config.rs:30`). `tiers` implicit empty. One-shot via `init` PDA. |
| 2 | `set_fee` | Authority `has_one` + cap. No effect on snapshotted deals. |
| 3 | `set_treasury` | No validation treasury is a real wallet/ATA owner. Centralization trust. |
| 4 | `set_authority` | Instant transfer; no timelock/multisig on-chain. |
| 5 | `set_tiers` | Duplicate-id rejection (`config.rs:103-108`), per-side cap 500 bps. Wholesale replace. Requires migrated `Config`. |
| 6 | `set_user_tier` | `init_if_needed` (`tier.rs:38`); validates tier exists. Wallet bound via PDA seeds. |
| 7 | `clear_user_tier` | `close = authority` returns rent to authority. |
| 8 | `create_deal` | Snapshots fee/tier at creation. **H-1** milestone sum. Optional `config`/`creator_tier` — omitting tier only hurts creator. `creator_wallet` buyer-asserted (documented trust boundary, `create_deal.rs:74-81`). |
| 9 | `fund_escrow` | Partial fund OK in `Created`. Clears refund flags (`fund_escrow.rs:96-97`). Buyer fee once on `total_amount`. **M-1** arithmetic. |
| 10 | `migrate_deal` | Raw `UncheckedAccount`; discriminator + owner check. Idempotent grow-only. **L-1** error code. |
| 11 | `migrate_config` | Same pattern as migrate_deal. Must run before `set_tiers` on legacy config. |
| 12 | `release_milestone` | Buyer-only; `Pending` only. PDA seeds `[b"deal", deal_id, bump]` consistent. Clears refund flags. Seller fee from vault. **M-2** `released_amount`. No milestone ordering enforced. |
| 13 | `refund` | Dual-signer same tx (legacy). **M-3** unchecked sub. No vault/deal close. Blocks `Completed`/`Refunded` only. |
| 14 | `approve_refund` | Two-step mutual refund; `checked_sub` on execute. Clears flags on fund/release elsewhere. **L-2**, **L-3**. Doesn't close accounts. |
| 15 | `cancel_deal` | `Created` only; `close = buyer` on deal. Refunds partial via `saturating_sub`. Closes vault. |
| 16 | `buyer_timeout_refund` | 30-day from `funded_at` (full fund moment). `Funded \| InProgress`. Closes deal + vault. `saturating_sub` + `checked` path on transfer amount guard. |
| 17 | `close_deal` | `Completed \| Refunded`; closes vault then deal. **No balance assertion** — **M-6**. Buyer-only rent reclaim. |

---

## Invariants that SHOULD hold but aren't enforced on-chain

| Invariant | Status |
|-----------|--------|
| `sum(milestone.amount) == total_amount` | Enforced at create (**but sum can wrap — H-1**) |
| `funded_amount <= total_amount` | Enforced at fund (overflow weak — M-1) |
| `released_amount <= funded_amount` | **Not enforced**; implied by status + milestones |
| `released_amount == sum(released milestone amounts)` | **Not enforced**; trust sequential `+=` |
| `escrow vault balance == funded_amount - released_amount` (modulo fees) | **Not enforced**; donations break it |
| `escrow vault mint == deal.mint` | **Not constrained** on CPI accounts (M-4) |
| `escrow vault authority == deal PDA` | Set at init only; **not re-validated** on spend (M-4) |
| `buyer_fee_paid` implies fee taken or rate was 0 | Enforced in handler order |
| Mutual refund flags imply consent to current `funded - released` | Cleared on fund/release ✓ |
| `Disputed` blocks release/refund | **N/A — variant unreachable** |
| Milestone lifecycle `Pending → Completed → Released` | **Skipped** — goes straight to `Released` |
| `buyer != seller` | **Not enforced** |
| Post-refund vault balance == 0 | **Not checked** before close |
| Legacy deals decodable after upgrade | Requires **`migrate_deal`** — not automatic |

---

## Recommended Anchor tests (specific malicious account setups)

1. **Milestone sum overflow:** 10 milestones each `u64::MAX/9`; `total_amount = wrapped sum`; expect `MathOverflow` / mismatch after fix.
2. **Fund overflow:** Deal with `total_amount = u64::MAX`, `funded_amount` near max; fund `1` → expect reject after checked fix.
3. **Release `released_amount` wrap:** Corrupt or multi-release scenario driving `released_amount` near `u64::MAX`; mutual refund should not pay wrapped amount.
4. **Wrong vault mint:** Pass token account with correct address but patch mock with wrong mint in test harness → should fail after M-4 fix.
5. **Wrong vault authority:** Substitute ATA owned by non-deal PDA → CPI should fail.
6. **Vault donation grief:** Fund deal, approve_refund to completion, transfer 1 lamport-unit of USDC into vault, call `close_deal` → expect failure; document recovery.
7. **Migration blocking:** Deploy old layout deal + fund; upgrade program; `release_milestone` without migrate → `AccountDidNotDeserialize`; then `migrate_deal` → release succeeds with symmetric 0.5% fee (Test 1 from `TIERING_DEVNET_TEST.md`).
8. **Migration idempotency:** Double `migrate_deal` / `migrate_config` → second is no-op.
9. **Tier seed mismatch:** `create_deal` with `creator_wallet=A` but pass `creator_tier` PDA for wallet B → Anchor seed constraint failure.
10. **InvalidCreator:** `creator_wallet` = third party → `InvalidCreator`.
11. **SSS zero-side fee trap (Test 4):** Tier `{creator:0, counterparty:50}`; buyer-created deal; assert `has_fee()` true, buyer fee 0, seller fee charged at release.
12. **Stale mutual refund:** Party A approves; partial fund; party B approves → should NOT execute until re-approval after fund clears flags.
13. **approve_refund unauthorized:** Random signer → wrong error code today; should fail closed.
14. **buyer_timeout_refund early:** `funded_at + 29 days` → `TimeoutNotReached`.
15. **cancel_deal on Funded status:** Should fail `InvalidDealStatus`.
16. **Partial fund cancel:** Fund 50% in `Created`, `cancel_deal` → 50% returned, vault closed, buyer fee already taken (document behavior).
17. **Treasury substitution:** `fund_escrow` with treasury ATA owned by wrong pubkey → `TreasuryAccountRequired`.
18. **set_tiers duplicate id / over-cap bps / non-authority** — from Test 3 in tier doc.

---

## Tests gap analysis

**`tests/platform-fee.ts`:** Mostly scaffold. Only `init_config` and `set_fee` authority test are wired; remaining cases are comments (`platform-fee.ts:72-106`). No executable coverage of release, refund, migration, tiering, timeout, or cancel.

**`TIERING_DEVNET_TEST.md`:** Manual devnet checklist — defines the **blocking** migration test and tier abuse cases, but **not automated** in `anchor test`.

**Missing entirely (no test file):**
- `migrate_deal` / `migrate_config`
- `approve_refund` two-step flow + flag clearing on fund/release
- `buyer_timeout_refund` / `cancel_deal` / `close_deal` account lifecycle
- Arithmetic edge cases (overflow, rounding)
- CPI signer seed mismatch regression
- Vault donation / close failure
- All tier assignment paths

---

## Arithmetic deep-dive (fee paths)

| Op | Location | Checked? | Notes |
|----|----------|----------|-------|
| `half_fee` | `state.rs:103-106` | ✓ u128 | Truncates toward payee |
| `side_fee` | `state.rs:112-115` | ✓ u128 | Truncates |
| `seller_net` | `release_milestone.rs:56` | ✓ `checked_sub` | Fails if fee > milestone |
| `refund_amount` | `approve_refund.rs:76-79` | ✓ | |
| `refund_amount` | `refund.rs:43` | ✗ | **M-3** |
| `refund_amount` | `cancel/buyer_timeout` | `saturating_sub` | Safe but hides corruption |
| `funded_amount +=` | `fund_escrow.rs:89` | ✗ | **M-1** |
| `released_amount +=` | `release_milestone.rs:103` | ✗ | **M-2** |
| milestone `.sum()` | `create_deal.rs:87` | ✗ | **H-1** |

**Fee rounding:** Symmetric path uses `/ 20_000` (half of `/ 10_000`). Asymmetric uses `/ 10_000` per side. Dust favors payees; platform may collect `< 1 bps` less than nominal — acceptable, should be documented for treasury reconciliation.

---

## CPI & token program

- All token ops use `anchor_spl::token::{transfer, close_account}` with `Program<'info, Token>` — **no raw `invoke`** ✓
- PDA signing consistently uses `[b"deal", deal_id.as_bytes(), &[deal.bump]]` with `deal` as token authority ✓
- Buyer-initiated transfers use buyer signer; vault outflows use `new_with_signer` ✓
- `close_account` destination is buyer (or authority for tier close) ✓
- **Gap:** no pre-close vault balance validation (**M-6**)

---

## Bottom line

The escrow program's **happy-path logic is carefully reasoned** (fee snapshotting, asymmetric tier mapping, mutual-refund flag hygiene, migration design). For **new deployments at the current layout**, it is close to mainnet-ready after fixing **H-1** and the **M-1/M-2/M-3** arithmetic issues.

For **upgrading the live program**, treat **`migrate_deal` / `migrate_config` as mandatory preconditions** and do not ship until `TIERING_DEVNET_TEST.md` Test 1 is green with real serialized legacy accounts — not just code review.

[REDACTED]
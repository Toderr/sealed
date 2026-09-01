# Remediation — Post-Fix Audit Review (issue #65)

Response to Daemon's post-fix review of PR #64. All five findings are accepted as
correct — we reproduced the CRITICAL account histogram independently — and each is
addressed below. **The earlier `POST_FIX_VERIFICATION.md` (on the `security_audit`
branch) is SUPERSEDED by this document; its C-1 "proof" was void, exactly as
finding 2 states.**

| # | Sev | Status |
|---|---|---|
| 1 | CRITICAL | On-chain bump-validation + UI fund-gate stop new money entering dead vaults; canonical struct prevents recurrence; devnet loss accepted + documented |
| 2 | HIGH | CTF harness ABI fixed; tests are now valid green-when-fixed regression guards |
| 3 | MEDIUM | Allowlist populated by the setup script; empty=fail-open documented |
| 4 | MEDIUM | Rust tests committed; IDL regenerated (11→18 ix); doc scope corrected |
| 5 | MEDIUM | `version` + `_reserved` added to `Deal` and `Config` — the structural fix |

---

## Finding 1 (CRITICAL) — frozen devnet Deal accounts

**Reproduced.** `getProgramAccounts` returns `{2048:8, 2056:5, 2091:4, 2093:4,
2130:1, 419:1, 42:1}` — five Deal generations, byte-identical to the report. Root
cause confirmed at source: fields were **inserted ahead of `bump`** across
releases, shifting `bump` for accounts already on chain, and `migrate_deal`
(append-only resize) cannot re-insert middle bytes.

**Fixes:**

1. **On-chain (permanent, for the fresh mainnet program):** `fund_escrow` now
   re-derives the deal PDA from its stored bump —
   `seeds = [b"deal", deal.deal_id.as_bytes()], bump = deal.bump`
   (`fund_escrow.rs`). A bump-corrupted deal no longer derives to its own address,
   so it is **rejected** — money can never be funded into a vault that can't sign
   a payout. This is strictly stronger than a client gate.
2. **UI gate (stops the bleeding on current devnet, today):**
   `assertDealFundable` (`escrow-client.ts`) refuses to fund a deal whose on-chain
   account is smaller than `MIN_FUNDABLE_DEAL_SIZE`; wired into the DealDetail
   fund path. No-op for a fresh create+fund (account doesn't exist yet).
3. **Recurrence prevented:** the canonical struct (finding 5) makes future field
   additions in-place, so `bump` never shifts again.

**The 17 frozen devnet accounts:** they are test data and their loss (2.50 test
USDC) is **accepted and documented** here — we are not shipping an authority
account-rewrite instruction for throwaway devnet state. The fresh mainnet deploy
starts from the canonical struct and has none of these generations. `migrate_deal`
remains for the one recoverable (2093) generation but is moot once the UI gate and
on-chain check are live.

## Finding 2 (HIGH) — the C-1 proof was void

**Accepted in full.** The prior single-run "proof" failed identically on patched
and unpatched builds because `create_deal_ix` omitted the `Option` account slots;
Anchor 0.31.1 signals `None` with the **program-id sentinel**, never by omission,
so the accounts shifted and the test died at setup on both binaries.

**Fix:** `ctf-tests/src/escrow_ix.rs` now pushes the sentinel (program id) for both
optional slots (`config`, `creator_tier`). With the ABI correct, the tests are
rewritten as **green-when-fixed regression guards** and both pass against the
patched program:

- `fee_free`: omit-config `create_deal` is **rejected** (`Custom(3007)` on
  `config`) and the control (WITH config) still succeeds → C-1 stays closed.
- `wrong_vault`: now reaches its real assertion (`treasury_token_account`
  rejection) instead of dying at setup → the vault control is intact.

The definitive pre/post A/B (both `.so` hashes, pre-fix SUCCEEDS, post-fix
REJECTED) is the one Daemon published; our corrected harness reproduces the
post-fix row exactly (`Custom(3007)` on `config`). We are not re-publishing a
single run as proof.

## Finding 3 (MEDIUM) — H-1 fails open

**Accepted.** The allowlist is enforced by live state, and nothing populated it.

**Fix:** `scripts/setup-fee.ts` now calls `set_allowed_mints` as part of the
standard bootstrap (defaulting to the cluster's USDC, override with
`ALLOWED_MINTS` for USDC,USDT,USDG on mainnet). Empty = accept-any is retained for
un-migrated back-compat and is documented at the call site as a deliberate,
must-be-set operator choice — so a fresh deployment configures the allowlist by
the same script that initialises the config.

## Finding 4 (MEDIUM) — verification-evidence gaps

- **"logic tested" now has a committed artifact:** `#[cfg(test)] mod tests` in
  `state.rs` — 8 tests over the fee math (`buyer_fee`/`seller_fee`/`half_fee`/
  `side_fee`/`has_fee`), the checked milestone sum, and the mint allowlist. Runs
  under `cargo test -p escrow --lib`, no validator, all green.
- **IDL regenerated:** `app/src/lib/idl/escrow.json` was 11 instructions; now 18,
  including `set_allowed_mints`, and `UnsupportedMint` is in the error list.
- **Scope corrected:** this document and the fixed tests replace the overstated
  claims ("only critical", "IDL shows the instruction", the flawed single-run
  proof). The OPS-CRITICAL (migrate wiring) and the P0 denominator are tracked in
  `REMEDIATION_PLAN.md`; this remediation does not restate them as closed.

## Finding 5 (MEDIUM) — no version, no reserved padding (the root cause)

**Fixed.** `Deal` and `Config` now carry `pub version: u8` as the **first** field
(`DEAL_VERSION` / `CONFIG_VERSION`, set at creation) and `pub _reserved: [u8; 64]`
as the **last**. Future scalar fields are carved out of `_reserved` in place, so no
addition can ever shift `bump` again — the exact mistake behind finding 1. Set on
`create_deal` and `init_config`.

**Sequencing (important):** this is itself a layout change. It is the **canonical
struct for the fresh mainnet program** and is **NOT** deployed in-place onto the
current devnet program (that would break even the healthy accounts). The current
devnet is retired via the UI gate + accepted loss; mainnet deploys this struct
fresh.

---

## What is deployed vs. in-repo

- **In this PR (code):** all five fixes.
- **Deployed to the current devnet program:** nothing from this PR yet — the struct
  change requires a fresh deploy, not an in-place upgrade. The UI fund-gate ships
  with the app and protects the current devnet immediately.
- **Mainnet:** fresh deploy of this canonical struct + `scripts/setup-fee.ts`
  (which now sets the allowlist). No migration needed on a fresh deploy.

## Verification in this PR

- `anchor build` clean · `cargo test -p escrow --lib` → 8/8 green
- CTF `fee_free` + `wrong_vault` → green regression guards against the patched `.so`
- App `tsc` clean · IDL current (18 ix)
- Finding 1 histogram reproduced live via `getProgramAccounts`

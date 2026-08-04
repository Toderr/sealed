# Sealed Escrow — Audit Remediation Plan

Response to the Daemon audit (branch `security_audit`, baseline `20547e5`).
Each finding below is mapped to its fix, the exact file/line, and a verification
step. Findings are grouped by whether they block mainnet.

**Cross-check done independently:** `cargo audit` (0 CVEs), `cargo geiger`
(escrow crate 0/0 unsafe), `cargo tarpaulin` (0.25% unit-test coverage — matches
the audit's "insufficient tests"). All three confirm the audit is accurate.

---

## MUST FIX — blocks mainnet (4 items)

### C-1 (CRITICAL) — optional `config` enables permanent fee bypass
**Where:** `create_deal.rs:41-42` (account) + `:112-120` (snapshot)
**Problem:** `config: Option<Account<Config>>`. A caller who builds their own tx
can omit the config account even when a live fee-active config exists on-chain;
the handler then snapshots `fee_bps = 0` / `treasury = default()` permanently, and
the deal funds with **zero platform fee**. Proven by Daemon's PoC
(`poc_create_deal_without_config_fee_bypass`, passes today).

**Why it's `Option` in the first place:** so deals can be created before
`init_config` exists (legitimately fee-free). The fix must preserve that while
closing the bypass.

**Fix:** keep `config` optional, but when it IS provided require it to be the
real PDA (already seed-checked), AND reject `None` when a live config exists.
Since the account is seed-derived, the honest path always can pass it; the only
reason to omit it is to dodge the fee. Cleanest: add an `init_if_needed`-free
existence check — pass the config PDA as a required `UncheckedAccount` sibling
and, if that account exists and is fee-active, require the typed `config` to be
`Some`. Simpler alternative recommended by the audit: **make `config` required
outright** and document that `init_config` must run before any deal. Given the
program is already deployed with a live config, required-config has no downside.

- Change `config: Option<Account<Config>>` → `config: Account<Config>` (required).
- Drop the `None` arm in the snapshot; always snapshot from the real config.
- Update `buildCreateDealIx` in `escrow-client.ts` to always pass the config PDA
  (it already does on the live path — remove the PROGRAM_ID/None sentinel branch).

**Verify:** Daemon's PoC test must flip from **pass → fail** (the omit-config tx
now rejected). Re-run `poc-tests` + `ctf-tests/fee_free.rs`.

### H-1 (HIGH) — mint unconstrained (any SPL token accepted)
**Where:** `create_deal.rs:26` — `pub mint: Account<'info, Mint>` with no address check.
**Problem:** a deal can be created with any SPL token, not just USDC. A milestone
"amount" then denominates a worthless token.
**Fix:** constrain the mint to the USDC address, cluster-aware. Add a
`address = USDC_MINT` constraint. Since devnet and mainnet USDC differ, gate it —
either a `const` chosen at compile time via a feature, or accept the mainnet mint
only (mainnet is the deploy that matters). Add the constant to the program.
**Verify:** a create_deal with a non-USDC mint must fail. Add a PoC.

### H-2 (HIGH) — milestone sum can overflow-panic
**Where:** `create_deal.rs:87` — `milestones.iter().map(|m| m.amount).sum()`.
**Problem:** `u64::sum()` panics on overflow (mitigated by `overflow-checks=true`,
but a panic is still a DoS on that tx and relies on a profile setting).
**Fix:** `try_fold` with `checked_add`, returning `MilestoneAmountMismatch` (or a
new `MathOverflow`) on overflow instead of panicking.
**Verify:** craft milestones summing > u64::MAX → clean error, not panic.

### OPS-CRITICAL — `migrate_deal` not wired into the client
**Where:** `escrow-client.ts` — `buildMigrateDealIx` exists but nothing calls it.
**Problem:** if the program is upgraded while deals exist, old-layout deals freeze
until migrated. Only relevant on an in-place **upgrade**, not a fresh deploy.
**Fix (frontend, not contract):** before any fund/release/refund on a deal that
might predate an upgrade, prepend `buildMigrateDealIx` (idempotent — no-op if
already migrated). Or run a one-shot migration pass after any upgrade.
**Note:** a fresh mainnet deploy never needs this. It only matters if mainnet is
ever upgraded with live deals. Wire it defensively regardless.

---

## SHOULD FIX — not blockers (2 items)

### M-3 (MEDIUM) — unchecked `funded_amount` / `released_amount`
**Where:** `fund_escrow.rs:89` (`+= amount`), `release_milestone.rs:103` (`+= amount`).
**Problem:** unchecked `+=` on running totals. Guarded upstream (fund checks
`funded + amount <= total`), but defense-in-depth wants `checked_add`.
**Fix:** `deal.funded_amount = deal.funded_amount.checked_add(amount).ok_or(MathOverflow)?;`
same for released. Small, mechanical.

### M-2 (MEDIUM) — legacy `refund` leaves accounts open
**Where:** `refund.rs:40-68`. The superseded single-tx refund doesn't close the
vault/deal. Low impact — the path is deprecated in favor of `approve_refund`.
**Fix (optional):** either close accounts on the legacy path too, or remove the
legacy `refund` instruction entirely if no in-flight deals use it. Recommend
**removing** it if the mainnet deploy is fresh (no legacy deals to support).

---

## ACCEPT / SKIP — with rationale (don't spend audit budget here)

- **M-1 — `creator_wallet` asserted, not signer-proven.** Daemon confirmed NOT
  exploitable: the creator discount lands on the creator's own fee side, so a
  caller can only give away a discount or pick a worse rate, never gain one. We
  flagged this ourselves. **Accept**; the code comment already documents it. If
  `creator` ever gains meaning beyond fee-side selection, revisit.
- **L-1 — `buyer == seller` self-deal.** Policy, not a bug. Decide if you want to
  forbid it (one `require!`), otherwise accept.
- **L-2 — vault dust blocks `close_deal` rent reclaim.** Griefing that costs the
  attacker money for no gain. Low priority; can add a "force close ignoring dust"
  later.
- **Dead `Disputed` / `Reputation` types** — remove for hygiene, no security impact.
- **Off-chain findings** (x-wallet header auth, LLM prompt injection, API auth) —
  real app-hardening items, but SEPARATE from the contract sign-off. Track them on
  the app side; they don't block the contract audit.
- **0.25% test coverage** — not a code fix, it's the absence of tests. Daemon
  supplied PoC / CTF / Trident suites; **adopt them into CI** as the coverage
  story and gate future changes on them.

---

## Suggested sequencing

1. **C-1 + H-1 + H-2 + M-3** in one contract PR (all in `create_deal.rs` /
   `fund_escrow.rs` / `release_milestone.rs`, a few lines each).
2. Update `escrow-client.ts` for required-config (C-1) and wire `migrate_deal`.
3. Re-run Daemon's `poc-tests` — **confirm the fee-bypass test flips to fail.**
4. Adopt PoC/CTF/Trident into CI.
5. Decide deploy timing: interim devnet upgrade + Daemon re-verify, OR batch into
   the fresh mainnet deploy. (Open question.)

**None of the contract fixes is a redesign.** The custody model passed the audit
(no theft, no unsafe, no CVEs). What's being closed is a fee-bypass hole plus
arithmetic and input hardening.

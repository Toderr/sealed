# Consolidated Priority Roadmap

Synthesized from all audits in `AUDIT/` including report 11 (baseline commit `20547e5`, branch `security_audit`).

> **Verified by fp-check (12):** 6 TRUE POSITIVE · 2 FALSE POSITIVE · 6 PARTIAL — see [12-false-positive-check.md](./12-false-positive-check.md). Fund-substitution drain confirmed **false positive**; no item removed, severity notes added where applicable.

---

## P0 — Block mainnet / program upgrade

| # | Action | Source reports | Key location |
|---|--------|----------------|--------------|
| 1 | **Require `config` on `create_deal`** when Config PDA exists and fee-active — eliminate fee bypass | 01, 02, 04, 05 | `create_deal.rs:38-42, 128-186` |
| 2 | **Run `TIERING_DEVNET_TEST.md` Tests 1–4** on throwaway program ID before any live upgrade | 01, 03, 05, 06 | `TIERING_DEVNET_TEST.md` |
| 3 | **Wire `migrate_deal`** in app before fund/release/refund on every deal tx | 05, 06, 09 | `escrow-client.ts` (builder exists, not called) |
| 4 | **Add `buildMigrateConfigIx`** + run once post-upgrade before tier ops | 05 | `lib.rs:85-87` |
| 5 | **Signed-message API auth** — replace spoofable `x-wallet` on LLM routes (`/api/agent`, `/api/verify-milestone`, `/api/negotiate/*`) | 01, 05, 07 | `app/src/lib/auth.ts` |
| 6 | **Checked arithmetic** on milestone sum, funded/released amounts, refund sub | 01, 03, 05 | `create_deal.rs:87`, `fund_escrow.rs:89`, `release_milestone.rs:103`, `refund.rs:43` |
| 7 | **Add `prompt-guard.ts`** (regex + heuristic) — hook in `dispatchLlm()` before every server-side LLM call | 07 | `app/src/lib/llm-dispatch.ts:207` |
| 8 | **Strict block** on verifier inputs (`sellerNote`, text `proofData`, `milestoneDescription`) when injection score ≥ 0.5 | 07 | `app/src/app/api/verify-milestone/route.ts:15-40` |
| 9 | **Zod-validate** negotiator + verifier JSON outputs (confidence 0–1, enum actions, numeric bounds) | 07 | `app/src/lib/extract-json.ts`, negotiate + verify routes |
| 10 | **Redact `/api/agent/context`** — stop returning full system prompt + memory; proxy BYO-key LLM server-side | 07 | `app/src/app/api/agent/context/route.ts:7-10` |

---

## P1 — Before mainnet launch

| # | Action | Source | Key location |
|---|--------|--------|--------------|
| 11 | Reject `buyer == seller` on `create_deal` | 01, 02, 04, 05 | `create_deal.rs:95-96` |
| 12 | Constrain mint to canonical USDC (cluster-gated) | 01, 04, 05 | `create_deal.rs:26` |
| 13 | Add vault `mint` + PDA authority constraints on all token paths *(defense-in-depth — fp-check: NOT exploitable drain)* | 02, 03, 04, 12 | `fund_escrow.rs`, `release_milestone.rs`, etc. |
| 14 | Fix client treasury: use **snapshotted** `deal.treasury`, not live Config | 05 | `deals/[id]/page.tsx:380-384`, `app/page.tsx:882-886` |
| 15 | Fix `buildCreateDealIx` optional Config wiring (PDA vs program ID) | 05 | `escrow-client.ts:301-326` |
| 16 | Implement **`tests/sea-level-attacks.ts`** (P1 negative tests from report 04) | 04, 09 | `tests/` — tarpaulin ~0.22% confirms handlers untested via `cargo test` |
| 16b | Run **`trident fuzz run fuzz_0`** after WSL `anchor build` (scaffold: `trident-tests/`, docs: `programs/escrow/TRIDENT.md`) | 04 | sea-level negatives partially covered in `flow_account_substitution_attacks` |
| 16c | **`poc-tests/` + `ctf-tests/`** partially address sea-level matrix in Rust (5 Neodyme PoCs + 3 CTF challenges) — TS suite in #16 still needed for CI gate | 04, 11 | `poc-tests/tests/security_pocs.rs`, `ctf-tests/tests/` |
| 17 | Complete **`tests/platform-fee.ts`** + CI gate on `anchor test` | 01, 03, 05, 09 | `tests/platform-fee.ts` — only path to meaningful on-chain coverage |
| 18 | Close vault in `approve_refund` or enforce `close_deal` in SDK | 01, 03 | `approve_refund.rs:96-102` |
| 19 | Consolidate refund UX on `approve_refund` only (retire `DealDetail` partial-sign) | 05, 06 | `DealDetail.tsx`, `deals/[id]/page.tsx` |
| 20 | Add `/api/health` (Supabase + RPC ping) before chaos experiments | 06 | new route |
| 21 | **Structured LLM output** — replace brittle `extractJson` slice with schema/tool use | 07 | `extract-json.ts`, negotiate + verify routes |
| 22 | **Rate-limit** LLM routes per wallet; scan `renegotiationRequest` / `redLines` | 07 | `negotiation/engine.ts`, `negotiator.ts` |
| 36 | Gate treasury on **`deal.has_fee()`** + snapshotted `deal.treasury`, not live `fee.active` | 11 | `deals/[id]/page.tsx:380-383` |
| 37 | **`DealDetail.tsx`** fund/release must pass treasury on fee deals (see also #19) | 11 | `DealDetail.tsx:195-196` |

---

## P2 — Hardening

| # | Action | Source |
|---|--------|--------|
| 23 | Signer-prove `creator_wallet` when reputation ships | 01, 05 |
| 24 | Implement or remove `Disputed` / wire `Reputation` PDA | 01, 05 |
| 25 | Deprecate legacy `refund` instruction | 01, 03 |
| 26 | Add Anchor events for indexers | 01 |
| 27 | Generate TS client from IDL (replace hand Borsh decoders) | 05 |
| 28 | **Canary token** in system prompts; alert if echoed in LLM responses | 07 |
| 29 | Optional DeBERTa sidecar for verifier path; batch-scan `sealed_messages` in CI | 07 |
| 30 | Update `STATUS.md` to reflect 17 instructions + migration reqs | 05 |
| 38 | Out-of-order milestone release: enforce sequential ordering or document buyer discretion (`release_milestone.rs:40-48`) | 11 |
| 39 | Vault dust donation blocks `close_deal` — assert zero balance or add sweep (`close_deal.rs:37-47`; see also #32) | 11, 03 |
| 40 | Supabase mirror desync: seller delivers against fake "Released" off-chain state (`deals/[id]/page.tsx:402-406`) | 11 |
| 42 | Re-add `seeds + bump` on `deal` in all post-create instructions (complements P1 #13 vault constraints) | 10 | `fund_escrow.rs`, `release_milestone.rs`, etc. |
| 43 | Promote treasury ATA to `#[account(...)]` constraints | 10 | `fund_escrow.rs:34-35`, `release_milestone.rs` |
| 44 | Add `constraint` for `approve_refund` signer party (buyer \| seller) | 10 | `approve_refund.rs:27` |
| 45 | Gate `approve_refund` on `Funded \| InProgress` (block unfunded Created) | 10 | `approve_refund.rs:29-30` |
| 46 | Add `InvalidAccountOwner` for migrate wrong-owner | 10 | `migrate_deal.rs:57` |

_N5 (explicit `vault.amount == 0` before `close_deal`) — already covered by #39._

## P3 — Nice to have

| # | Action |
|---|--------|
| 31 | Seller rent reclamation on `close_deal` |
| 32 | Dust sweep for fee rounding residue |
| 33 | `cargo audit` + `cargo geiger` (escrow manifest) + Semgrep in CI; `anchor test` for coverage — not tarpaulin % on program crate (see 09) |
| 34 | QEDGen `.qedspec` + formal properties |
| 35 | Milestone description length validation in handler |
| 41 | Reject zero-milestone / zero-amount deals (rent spam) — `create_deal.rs:68` (report 11) |

---

## Test priority (from sea-level + adversarial audits)

**Implement first:**
1. `wrong_vault_ata_for_deal` — also in `trident-tests/fuzz_0` (`flow_account_substitution_attacks`)
2. `treasury_ata_wrong_owner_when_fees_active` — Trident flow above
3. `wrong_mint_on_buyer_token_account` — Trident flow above
4. `release_milestone_seller_ata_not_owned_by_deal_seller`
5. `non_party_calls_approve_refund`
6. `set_user_tier_by_non_authority`
7. `wrong_token_program_pubkey`

**Document current vs desired:**
8. `create_deal_without_config_fee_bypass`
9. `buyer_equals_seller_self_deal`

**From adversarial audit (11) — add after P1 block above:**
10. `unmigrated_deal_fails_after_upgrade` / `migrate_deal_unfreezes_legacy_deal`
11. `milestone_sum_overflow_wraps_to_total`
12. `fund_escrow_missing_treasury_on_fee_deal`
13. `release_with_stale_treasury_ata_fails`
14. `vault_dust_blocks_close_deal`
15. `release_milestone_out_of_order_succeeds` (document current behavior)
16. `approve_refund_stale_after_release` / `approve_refund_zero_funded_dual_approval`
17. `create_deal_zero_amount_zero_milestones`
18. `buyer_timeout_after_partial_release` (document seller exposure)

Full matrix: [11-adversarial-attack-audit.md](./11-adversarial-attack-audit.md#poc-test-matrix) · baseline P0/P1 list: [04-sea-level-attack-audit.md](./04-sea-level-attack-audit.md)

---

## Chaos experiments — run first (after `/api/health`)

1. Exp 15 — Vercel cold start on `/api/negotiate/stream`
2. Exp 8 — LLM 429 rate limit
3. Exp 14A — Notification queue with email unconfigured

Defer until migrations wired: Exp 10 (refund race), Exp 11 (`migrate_deal`).

---

## Sign-off gates

- [ ] All P0 items addressed or explicitly accepted
- [ ] `anchor test` green including sea-level negatives
- [ ] `TIERING_DEVNET_TEST.md` Test 1 green on throwaway program
- [ ] External audit complete
- [ ] Bytecode + IDL tagged at audit baseline commit

# Sealed — Audit Reports

Consolidated security, reliability, and engineering review artifacts for the **escrow** Anchor program and related integration layer.

| Field | Value |
|-------|-------|
| **Program ID (devnet)** | `3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ` |
| **Anchor version** | 0.31.1 |
| **Branch** | `security_audit` |
| **Baseline commit** | `20547e5e42554ba334b5db8d7e0f0b1766f1e4e9` |
| **Report date** | 2026-08-03 |
| **Author** | rade nugroho |

---

## Primary deliverable — client audit report

**Start here:** [**SEALED-ESCROW-AUDIT-REPORT.md**](./SEALED-ESCROW-AUDIT-REPORT.md) — consolidated security audit report for client delivery.

| Section | Contents |
|---------|----------|
| Cover & executive verdict | NOT mainnet ready; fund safety verified; P0 blockers |
| §1–§11 | Prep, signers, low-level, sea-level, engineering, chaos, prompt injection, roadmap, supply chain, Anchor safety, adversarial |
| Appendix | Security testing tooling pointer |

Individual files `01`–`13` remain as **source annexes** for drill-down; substantive findings are deduplicated in the master report.

---

## Source annexes (detail references)

| # | File | Scope |
|---|------|-------|
| 01 | [01-security-audit-prep-package.md](./01-security-audit-prep-package.md) | Full prep: 6-pattern scan, findings, QEDGen path, checklist |
| 02 | [02-signer-checker-audit.md](./02-signer-checker-audit.md) | Per-instruction signer & account constraint matrix |
| 03 | [03-low-level-code-audit.md](./03-low-level-code-audit.md) | Borsh, arithmetic, CPI, state machine, close/rent |
| 04 | [04-sea-level-attack-audit.md](./04-sea-level-attack-audit.md) | Account-model attacks + `tests/sea-level-attacks.ts` plan |
| 05 | [05-structured-engineering-review.md](./05-structured-engineering-review.md) | Blockers / Should Fix / Nice to Have |
| 06 | [06-chaos-engineering-experiments.md](./06-chaos-engineering-experiments.md) | 15 chaos experiments + guardrails |
| 07 | [07-prompt-injection-audit.md](./07-prompt-injection-audit.md) | OWASP LLM01: attack surfaces, defenses, P0–P2 |
| 08 | [08-priority-roadmap.md](./08-priority-roadmap.md) | **Action tracker** — P0–P3 across all reports |
| 09 | [09-rust-supply-chain-scan.md](./09-rust-supply-chain-scan.md) | cargo-audit, cargo-geiger; 0 CVEs |
| 10 | [10-anchor-safety-audit.md](./10-anchor-safety-audit.md) | Anchor account safety categories |
| 11 | [11-adversarial-attack-audit.md](./11-adversarial-attack-audit.md) | Red-team personas, exploit chains, PoC matrix |
| 12 | [12-false-positive-check.md](./12-false-positive-check.md) | Internal verification pass (not in client report) |
| 13 | [13-pda-seed-collision-audit.md](./13-pda-seed-collision-audit.md) | PDA seed analysis — verdict **NOT VULNERABLE** |

**PoC runner:** [../POC_TESTS.md](../POC_TESTS.md) — Neodyme `solana-poc-framework` tests in `poc-tests/`.

---

All 17 escrow instructions use typed accounts only — no trailing-account (`remaining_accounts`) handlers.

## Executive verdict (summary)

**Mainnet readiness: NOT READY** — see [SEALED-ESCROW-AUDIT-REPORT.md](./SEALED-ESCROW-AUDIT-REPORT.md) for full synthesis.

| Area | Verdict |
|------|---------|
| Fund safety (vault substitution, CPI) | **Verified secure** — no direct USDC theft via account substitution |
| Platform fee integrity | **Broken** — optional `config` allows permanent fee bypass |
| Program upgrade (tier layout) | **Blocked** — `migrate_deal` not wired in app; manual test required |
| Client integration | **Gaps** — treasury uses live Config not deal snapshot; migrate not called |
| Test coverage | **Insufficient** — stubs only |
| API auth | **Spoofable** — `x-wallet` header only |

---

## Top 5 actions (P0)

1. Require `config` on `create_deal` when fee-active → `create_deal.rs:38-42`
2. Wire `migrate_deal` in `escrow-client.ts` before every deal instruction
3. Run `TIERING_DEVNET_TEST.md` Test 1 on throwaway program ID
4. Signed-message auth for API routes
5. Checked `u64` arithmetic on fund/release/refund paths

Full list: [08-priority-roadmap.md](./08-priority-roadmap.md) · consolidated in [SEALED-ESCROW-AUDIT-REPORT.md §8](./SEALED-ESCROW-AUDIT-REPORT.md#8-priority-roadmap)

---

## 6-pattern Solana scan (summary)

| Pattern | Result |
|---------|--------|
| Arbitrary CPI | ✅ Pass |
| Improper PDA | ✅ Pass |
| Missing ownership | ✅ Pass |
| Missing signer | ✅ Pass |
| Sysvar spoofing | ✅ Pass |
| Instruction introspection | ✅ Pass (N/A) |

Business-logic bypass via optional `config` is **not** a classic pattern failure but is the highest economic risk.

---

## Out of scope

- Full Next.js frontend audit (partial: `escrow-client.ts`, deal pages)
- External third-party audit engagement
- Pitch / deck assets

---

## Security test tooling

See **[SECURITY_TESTING.md](../SECURITY_TESTING.md)** for the unified runbook:

| Framework | Path | Purpose |
|-----------|------|---------|
| Trident fuzz | `trident-tests/` | Automated invariant / flow fuzzing |
| Otter CTF | `ctf-tests/` | Regression challenges (fee bypass, vault/treasury defenses) |
| Neodyme PoC | `poc-tests/` | Minimal exploit reproducers |
| Anchor tests | `tests/` | Integration regression |

---

## Next steps for external auditors

1. Read [SEALED-ESCROW-AUDIT-REPORT.md](./SEALED-ESCROW-AUDIT-REPORT.md) (master) and [08-priority-roadmap.md](./08-priority-roadmap.md) (action tracker)
2. Verify frozen commit `20547e5` bytecode SHA256
3. Confirm upgrade authority pubkey + multisig policy
4. Request green `TIERING_DEVNET_TEST.md` evidence before reviewing upgrade path
5. Run CTF challenges after `anchor build`: `cd ctf-tests && cargo test -- --ignored`

---

*Author: rade nugroho*

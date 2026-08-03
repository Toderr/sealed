# Sealed Escrow — Comprehensive Security Audit Report

| Field | Value |
|-------|-------|
| **Title** | Sealed Escrow — Comprehensive Security Audit Report |
| **Author** | rade nugroho |
| **Date** | 2026-08-03 |
| **Program ID (devnet)** | `3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ` |
| **Anchor version** | 0.31.1 |
| **Branch** | `security_audit` |
| **Baseline commit** | `20547e5e42554ba334b5db8d7e0f0b1766f1e4e9` |
| **Instructions audited** | 17 |
| **Source annexes** | `AUDIT/01`–`AUDIT/13` (retained as detail references) |

---

## Executive Verdict

**Mainnet readiness: NOT READY**

This report consolidates independent audit passes over the Sealed escrow Anchor program, client integration layer, LLM surfaces, supply chain, and operational readiness. The on-chain fund-safety model is sound for deals created through the normal `create_deal` flow: vault substitution, CPI redirection, and arbitrary recipient attacks are blocked by Anchor constraints and PDA signing. Account substitution on fund-moving paths does **not** enable direct USDC theft.

Remaining blockers are economic integrity (optional config fee bypass), operational migration wiring, client↔chain desync, insufficient automated tests, and off-chain authentication gaps — not classic vault-drain exploits.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [§1 Security Audit Prep Package](#1-security-audit-prep-package)
3. [§2 Signer & Checker Audit](#2-signer--checker-audit)
4. [§3 Low-Level Code Audit](#3-low-level-code-audit)
5. [§4 Sea-Level Attack Audit](#4-sea-level-attack-audit)
6. [§5 Structured Engineering Review](#5-structured-engineering-review)
7. [§6 Chaos Engineering Experiments](#6-chaos-engineering-experiments)
8. [§7 Prompt Injection Audit](#7-prompt-injection-audit)
9. [§8 Priority Roadmap](#8-priority-roadmap)
10. [§9 Rust Supply Chain Scan](#9-rust-supply-chain-scan)
11. [§10 Anchor Safety Audit](#10-anchor-safety-audit)
12. [§11 Adversarial Attack Audit](#11-adversarial-attack-audit)
13. [Appendix: Security Testing Tooling](#appendix-security-testing-tooling)

---

## Executive Summary

### Fund Safety Verdict

| Area | Verdict | Reference |
|------|---------|-----------|
| Vault / treasury / ATA substitution | **Verified secure** — no direct USDC theft via account substitution | §2, §4, §11 |
| Arbitrary CPI / fake token program | **Pass** | §1, §4 |
| PDA seed collision (cross-type) | **Verified secure** — not vulnerable | §1, §10 |
| Platform fee integrity | **Broken** — optional `config` allows permanent fee bypass | §1 C-1 |
| Program upgrade (tier layout) | **Blocked** — `migrate_deal` not wired in app | §5 |
| Client integration | **Gaps** — treasury uses live Config not deal snapshot | §5, §11 |
| Test coverage | **Insufficient** — stubs only | §3, §9 |
| API auth | **Spoofable** — `x-wallet` header only | §7 |

All 17 escrow instructions use typed accounts only — no trailing-account (`remaining_accounts`) handlers.

### Top P0 Blockers

1. Require `config` on `create_deal` when fee-active → `create_deal.rs:38-42`
2. Wire `migrate_deal` in `escrow-client.ts` before every deal instruction
3. Run `TIERING_DEVNET_TEST.md` Test 1 on throwaway program ID
4. Signed-message auth for API routes (`/api/agent`, `/api/verify-milestone`, `/api/negotiate/*`)
5. Checked `u64` arithmetic on fund/release/refund paths
6. `prompt-guard.ts` + Zod validation on LLM routes (§7)

Full tracker: [§8 Priority Roadmap](#8-priority-roadmap).

### Controls Verified

| Control | Evidence |
|---------|----------|
| 6-pattern Solana scan (arbitrary CPI, improper PDA, missing ownership/signer, sysvar spoofing, instruction introspection) — all pass | §1 |
| Fund-moving signer gates (buyer release, dual refund, authority config) | §2 |
| Vault address pinning on all 7 token paths | §2, §4 |
| Party ATA owner + mint constraints | §2, §4 |
| Treasury handler validation (`owner == deal.treasury && mint == deal.mint`) | §2, §4 |
| PDA CPI signing with stored `deal.bump` | §3 |
| PDA seed collision — cross-type collision impossible (distinct prefixes: `deal`, `escrow-vault`, `tier`, `config`) | §1, §10 |
| Fee snapshot at deal creation (tier repricing prevented retroactively) | §1 |
| Mutual refund flag clearing on fund/release | §3 |
| Migration design (permissionless, grow-only, idempotent) | §3, §5 |
| Supply chain: 0 CVEs in `cargo audit` | §9 |
| First-party escrow crate: 100% safe (no `unsafe`) | §9 |

### Severity Summary (On-Chain Findings)

| Severity | Count | Representative |
|----------|-------|----------------|
| CRITICAL | 1 | Optional config fee bypass (C-1) |
| HIGH | 2 | Unconstrained mint; unchecked milestone sum / accounting |
| MEDIUM | 3+ | Client treasury desync; vault lifecycle gaps; arithmetic on fund/release |
| LOW | 3+ | Self-deal policy; vault dust griefing; error-code hygiene |
| Operational CRITICAL | 1 | Post-upgrade freeze without `migrate_deal` wiring |

---

## 1. Security Audit Prep Package

*Source: [01-security-audit-prep-package.md](./01-security-audit-prep-package.md)*

### 1.1 Scope & Baseline

- **Program:** Anchor 0.31.1 escrow at `programs/escrow/`
- **17 instructions** confirmed in `lib.rs`
- **Frozen baseline:** commit `20547e5` on branch `security_audit`
- **Out of scope:** Full Next.js frontend, Supabase schema, AI agent routes, off-chain reputation aggregation

### 1.2 Six-Pattern Solana Scanner

| Pattern | Result | Evidence |
|---------|--------|----------|
| Arbitrary CPI | ✅ PASS | All CPIs via `anchor_spl::token` or `system_program::transfer` |
| Improper PDA | ✅ PASS | Canonical seeds; migrate handlers validate discriminator + owner |
| Missing ownership | ✅ PASS | Token accounts constrained; migrate checks `info.owner == program_id` |
| Missing signer | ✅ PASS | Buyer/seller/authority gates present |
| Sysvar spoofing | ✅ PASS | Typed `Sysvar<Rent>`; `Clock::get()` syscall |
| Instruction introspection | ✅ PASS (N/A) | No stack-height / instruction-index checks |

Business-logic bypass via optional `config` is **not** a classic pattern failure but is the highest economic risk (see §1.3 C-1).

### 1.3 Security Findings

#### CRITICAL — C-1: Optional config enables platform fee bypass

**Location:** `programs/escrow/src/instructions/create_deal.rs:38-42, 128-186`

```38:42:programs/escrow/src/instructions/create_deal.rs
    /// Global platform config, if it exists — the deal snapshots its fee_bps +
    /// treasury. Optional so deals can still be created before init_config
    /// (they're then fee-free). Seeds-validated when provided.
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Option<Account<'info, Config>>,
```

When `config` is omitted after `init_config`, handler snapshots `fee_bps = 0`, `treasury = default()` permanently.

**Recommendation:** Make `config` required once initialized, or reject `None` when live config is fee-active. Cross-ref: §2, §4 F-03, §8 P0 #1.

#### HIGH

| ID | Finding | Location | Fix |
|----|---------|----------|-----|
| H-1 | Mint unconstrained — any SPL token | `create_deal.rs:25-26` | Cluster-gated USDC constraint |
| H-2 | Milestone sum unchecked `u64` `.sum()` | `create_deal.rs:87-91` | `try_fold` + `checked_add` |

#### MEDIUM

| ID | Finding | Location |
|----|---------|----------|
| M-1 | `creator_wallet` asserted not signer-proven | `create_deal.rs:74-85` |
| M-2 | Legacy `refund` leaves accounts open | `refund.rs:40-68` |
| M-3 | Unchecked `funded_amount` / `released_amount` | `fund_escrow.rs:89`, `release_milestone.rs:103` |

#### LOW / INFO

| ID | Finding | Location |
|----|---------|----------|
| L-1 | `buyer == seller` self-deal allowed (policy) | `create_deal.rs:95-96` |
| L-2 | Vault dust donation can block `close_deal` rent reclaim | `close_deal.rs:37-47` |

Dead `Disputed`/`Reputation` types; misleading migrate error codes; fee rounding dust; buyer-only rent reclamation on `close_deal`. Tier snapshot at creation is good design (`create_deal.rs:137-139`).

### 1.4 QEDGen Brownfield Path

Classification: **BROWNFIELD** — existing deployed program, no `.qedspec`. Recommended: install QEDGen CLI, author machine-checkable invariants for C-1, H-1–H-2, M-3.

### 1.5 Audit Prep Checklist

- [ ] Freeze commit and tag audit RC
- [ ] Export IDL + `.so` SHA256
- [ ] Document upgrade authority + multisig policy
- [ ] Fix P0 findings (§8)
- [ ] Complete integration tests for all 17 instructions
- [ ] Run `cargo audit` + clippy
- [ ] Execute `TIERING_DEVNET_TEST.md` on throwaway program ID

---

## 2. Signer & Checker Audit

*Source: [02-signer-checker-audit.md](./02-signer-checker-audit.md)*

### 2.1 Summary

| Severity | Count | Theme |
|----------|-------|-------|
| CRITICAL | 0 | No direct fund-theft path in normal lifecycle |
| HIGH | 1 | Fee evasion via optional `config` |
| MEDIUM | 3 | Client integration; griefing |
| LOW | 6 | Policy gaps; error-code hygiene |

Fund-moving instructions correctly pin vault address, buyer/seller token owners, and mint. CPI PDA signing forces `deal` key to match `PDA(["deal", deal_id], bump)`.

### 2.2 Per-Instruction Matrix (Abbreviated)

| Instruction | Signers | Key gaps |
|-------------|---------|----------|
| `init_config` | Deployer | MEDIUM: first-caller-wins authority |
| `set_*` / tier admin | Config authority | None material |
| `create_deal` | Buyer only | **HIGH:** optional config; seller `UncheckedAccount` |
| `fund_escrow` / `release_milestone` | Buyer | None material — vault address pinned |
| `approve_refund` | Buyer or seller (handler) | LOW: wrong error for non-party |
| `refund` (legacy) | Both parties | MEDIUM: vault constraints thin |
| `migrate_*` | Any payer | LOW: wrong error variant |

Full matrix: [02-signer-checker-audit.md](./02-signer-checker-audit.md).

### 2.3 Targeted Hunt Results

1. **Missing signers on privileged ops:** None found.
2. **`UncheckedAccount` (seller, migrate):** Justified and hand-validated.
3. **`approve_refund` handler auth:** Sufficient — runs before transfer; destination pinned to `deal.buyer`.
4. **Optional config/tier:** Config omission = fee evasion; tier omission = self-harm only.
5. **Token substitution:** Blocked on all outflow paths. Vault is initialized with correct mint and PDA authority at deal creation; substitution at the stored address is not reachable.

### 2.4 Recommended Fixes

See §10 snippets for Anchor constraint promotions. Priority: require config when fee-active (§8 P0 #1), deal PDA seed re-validation (§8 P2).

---

## 3. Low-Level Code Audit

*Source: [03-low-level-code-audit.md](./03-low-level-code-audit.md)*

### 3.1 Mainnet Readiness

- **Greenfield deals at current layout:** Close after H-1 and M-3 arithmetic fixes.
- **In-place program upgrade:** **NOT READY** until `migrate_deal` / `migrate_config` run on every legacy account and `TIERING_DEVNET_TEST.md` Test 1 passes.

### 3.2 Top Low-Level Risks

1. **Unchecked u64 arithmetic** — `create_deal` sum, `fund_escrow` +=, `release_milestone` +=, `refund` plain `-` (DoS / accounting corruption, not theft)
2. **Vault balance vs `funded_amount` not reconciled** — donations break `close_deal` (§11 vault dust)

### 3.3 Invariants Not Enforced On-Chain

| Invariant | Status |
|-----------|--------|
| `released_amount <= funded_amount` | Not enforced |
| `escrow vault balance == funded - released` | Not enforced |
| `buyer != seller` | Not enforced (policy) |
| Post-refund vault balance == 0 | Not checked before close |
| Legacy deals decodable after upgrade | Requires `migrate_deal` |

### 3.4 Arithmetic Deep-Dive

| Op | Location | Checked? |
|----|----------|----------|
| `half_fee` / `side_fee` | `state.rs:103-115` | ✅ u128 |
| `seller_net` | `release_milestone.rs:56` | ✅ |
| `refund_amount` | `approve_refund.rs:76-79` | ✅ |
| `refund_amount` | `refund.rs:43` | ❌ |
| `funded_amount +=` | `fund_escrow.rs:89` | ❌ |
| milestone `.sum()` | `create_deal.rs:87` | ❌ |

### 3.5 Test Gap Analysis

`tests/platform-fee.ts` is mostly scaffold. No automated coverage for migration, approve_refund two-step flow, timeout, cancel, arithmetic edge cases, or vault donation griefing. Recommended malicious setups: 18 specific test cases documented in source annex §3.

---

## 4. Sea-Level Attack Audit

*Source: [04-sea-level-attack-audit.md](./04-sea-level-attack-audit.md)*

### 4.1 Threat Model

In Solana's sea-level model, the attacker controls every account passed to an instruction. Defenses: PDA seeds, `has_one`, `address = deal.escrow_token_account`, mint/owner checks, treasury validation, `Program<Token>`.

**No CRITICAL exploitable fund-theft vectors** assuming normal `create_deal` flow.

### 4.2 Findings Table

| ID | Severity | Vector | Status |
|----|----------|--------|--------|
| F-03 | **HIGH** | Optional config omission → fee bypass | Open (by design) |
| F-04 | LOW | `buyer == seller` self-deal (policy) | Open |
| F-08 | MEDIUM | `approve_refund` cross-tx TOCTOU | Mitigated by flag clears |
| F-01, F-05, F-09, F-10 | LOW | Init race, creator trust, error codes | UX/deploy |

**Controls verified:** vault substitution, fake token program, wrong party ATAs, treasury mismatch, tier PDA cosplay, non-authority config/tier mutation.

### 4.3 Test Plan — `tests/sea-level-attacks.ts`

**P1 — implement first (must FAIL on-chain):**

1. `wrong_vault_ata_for_deal` — ConstraintAddress
2. `treasury_ata_wrong_owner_when_fees_active` — TreasuryAccountRequired (6018)
3. `wrong_mint_on_buyer_token_account`
4. `release_milestone_seller_ata_not_owned_by_deal_seller`
5. `non_party_calls_approve_refund` — UnauthorizedBuyer (6007)
6. `set_user_tier_by_non_authority` — UnauthorizedAuthority (6011)
7. `wrong_token_program_pubkey`

**P2 — document current vs desired:**

8. `create_deal_without_config_fee_bypass` — succeeds today
9. `buyer_equals_seller_self_deal` — succeeds today (policy)

Full test outlines with TypeScript snippets: [04-sea-level-attack-audit.md](./04-sea-level-attack-audit.md) Part 2.

---

## 5. Structured Engineering Review

*Source: [05-structured-engineering-review.md](./05-structured-engineering-review.md)*

### 5.1 Critical Blockers

**Legacy deals frozen after tier upgrade without migration**

- Appended Borsh fields → `AccountDidNotDeserialize` on all deal-touching instructions
- `buildMigrateDealIx` exists in `escrow-client.ts:807-824` but **never invoked**
- Fix: prepend `migrate_deal` to every deal tx; add `buildMigrateConfigIx`; run Test 1 from `TIERING_DEVNET_TEST.md`

**Tier-upgrade devnet verification not evidenced**

- Manual two-deployment test is blocking; not automated

### 5.2 Should Fix

| Issue | Location |
|-------|----------|
| Unchecked u64 arithmetic | `create_deal.rs:87`, `fund_escrow.rs:89`, `release_milestone.rs:103`, `refund.rs:43` |
| Client passes live Config treasury | `deals/[id]/page.tsx:380-384`, `app/page.tsx:882-886` |
| `buildCreateDealIx` always passes config PDA | `escrow-client.ts:301-326` |
| Test suite non-functional | `tests/platform-fee.ts:72-106` |
| Milestone description length not validated | `state.rs:142` |
| Mint not constrained to USDC | `create_deal.rs:26` |

### 5.3 What Passed Review

Access control, fee snapshot model, refund safety, migration design, PDA binding, primary UI paths (`deals/[id]/page.tsx` two-step approve_refund).

---

## 6. Chaos Engineering Experiments

*Source: [06-chaos-engineering-experiments.md](./06-chaos-engineering-experiments.md)*  
**Mode:** Design-only — no faults injected.

### 6.1 System Context

Sealed spans Next.js frontend, Vercel API routes, Supabase mirror, LLM providers (6), and Anchor escrow on devnet. **Default environment:** devnet + Vercel preview — not production mainnet.

### 6.2 Critical User Journeys

| Journey | On-chain authority |
|---------|-------------------|
| J3 — Fund escrow | Deal PDA + vault |
| J4 — Release milestone | Escrow vault balance |
| J5 — Mutual refund | `buyer_refund_ok` + `seller_refund_ok` flags |

### 6.3 Experiment Suite (15 total)

| # | Target | Hypothesis |
|---|--------|------------|
| 1–3 | Solana RPC latency/errors/stale blockhash | Graceful degradation; no false `funded` mirror |
| 4–6 | Supabase outage/slow queries/auth failure | Chain tx independent of mirror |
| 7–9 | LLM timeout/429/malformed JSON | Fail loud; no bad on-chain args |
| 10 | `approve_refund` two-step race | Exactly one refund transfer |
| 11 | `migrate_deal` + partial funding | Legacy deals operable after migrate |
| 12–13 | Wallet disconnect / tab close | No false success UI |
| 14 | Notification queue backlog | Telegram not starved by email |
| 15 | Vercel cold start on SSE negotiate | TTFB ≤3s; no duplicate negotiations |

**Run first (lowest risk):** cold-start (15), LLM 429 (8), notification queue (14).

**Defer until migrations wired:** refund race (10), `migrate_deal` (11).

### 6.4 Pre-Chaos Observability Gaps

No `/api/health`, no structured request IDs, no tx funnel analytics, no on-chain vs mirror reconciler. Build P0 observability before fund-touching chaos.

---

## 7. Prompt Injection Audit

*Source: [07-prompt-injection-audit.md](./07-prompt-injection-audit.md)*  
**Framework:** OWASP LLM01:2025

### 7.1 Overall Risk: MEDIUM-HIGH (staging context)

Six LLM pipelines; **no pre-LLM injection detection or output schema validation.** Financial impact partially bounded: buyer must sign release; prompt injection cannot unilaterally move funds. Risk: fraudulent verifier recommendations, distorted terms, system prompt exfiltration, LLM quota burn via spoofed `x-wallet`.

### 7.2 Attack Surfaces

| Surface | Untrusted input | Impact |
|---------|-----------------|--------|
| `POST /api/agent` | Full chat history | Malformed deal JSON, prompt leak |
| `POST /api/negotiate/*` | `renegotiationRequest`, messages | Biased terms |
| `POST /api/verify-milestone` | `proofData`, `sellerNote` — **no wallet auth** | False approve recommendation |
| Indirect | Agent memory, milestone descriptions, deliverable text | RAG-style poison |

Client BYO-key path bypasses server guards entirely (`ChatInterface` + `/api/agent/context`).

### 7.3 Current Defenses

Static system prompts, `validateTurn()` integrity checks, buyer on-chain signing, verifier advisory-only design. **Not present:** input sanitization, JSON schema validation, signed-message auth, rate limits.

### 7.4 Priority Actions

**P0:** `prompt-guard.ts` in `dispatchLlm()`; strict block on verifier inputs; Zod-validate outputs; signed wallet auth; redact `/api/agent/context`.

**P1:** Structured LLM output; sanitize `redLines`; rate-limit per wallet; canary tokens in system prompts.

Key hardening locations: `llm-dispatch.ts:207`, `verify-milestone/route.ts`, `extract-json.ts`, `agent/context/route.ts`.

---

## 8. Priority Roadmap

*Source: [08-priority-roadmap.md](./08-priority-roadmap.md)* — **Actionable tracker; start fixes here.**

### P0 — Block mainnet / program upgrade

| # | Action | Key location |
|---|--------|--------------|
| 1 | Require `config` on `create_deal` when fee-active | `create_deal.rs:38-42` |
| 2 | Run `TIERING_DEVNET_TEST.md` Tests 1–4 on throwaway program ID | `TIERING_DEVNET_TEST.md` |
| 3 | Wire `migrate_deal` in app before every deal tx | `escrow-client.ts` |
| 4 | Add `buildMigrateConfigIx` + run post-upgrade | `lib.rs:85-87` |
| 5 | Signed-message API auth (replace `x-wallet`) | `auth.ts` |
| 6 | Checked arithmetic (4 sites) | `create_deal.rs:87`, etc. |
| 7 | `prompt-guard.ts` in `dispatchLlm()` | `llm-dispatch.ts:207` |
| 8 | Strict block verifier LLM inputs (score ≥ 0.5) | `verify-milestone/route.ts` |
| 9 | Zod-validate negotiator + verifier JSON | `extract-json.ts` |
| 10 | Redact `/api/agent/context` | `agent/context/route.ts` |

### P1 — Before mainnet launch

| # | Action |
|---|--------|
| 11 | Reject `buyer == seller` (policy) |
| 12 | Canonical USDC mint constraint |
| 14–15 | Treasury from deal snapshot; fix `buildCreateDealIx` config wiring |
| 16–17 | `tests/sea-level-attacks.ts` + complete `platform-fee.ts`; CI gate on `anchor test` |
| 16b | Trident fuzz: `trident fuzz run fuzz_0` |
| 18–20 | Consolidate refund UX; `/api/health` |
| 21–22 | Structured LLM output; rate-limit LLM routes |
| 36–37 | Gate treasury on `deal.has_fee()`; fix `DealDetail.tsx` |

### P2 / P3

Reputation/dispute wiring, Anchor events, IDL-generated client, canary tokens, dust sweep, `#![forbid(unsafe_code)]`, QEDGen spec. Optional hardening: deal PDA seeds re-validation, treasury constraints, migrate error codes, vault close on terminal refund.

### Sign-Off Gates

- [ ] All P0 addressed or explicitly accepted
- [ ] `anchor test` green including sea-level negatives
- [ ] `TIERING_DEVNET_TEST.md` Test 1 green
- [ ] External audit complete
- [ ] Bytecode + IDL tagged at baseline commit

---

## 9. Rust Supply Chain Scan

*Source: [09-rust-supply-chain-scan.md](./09-rust-supply-chain-scan.md)*

### 9.1 Verdict

| Tool | Result |
|------|--------|
| cargo-audit | **Pass** — 0 CVEs; 4 informational advisories |
| cargo-geiger | **Pass** — escrow 100% safe (no `unsafe`); tree ~94% safe |
| cargo-tarpaulin | **~0.22%** — expected; use `anchor test` for meaningful coverage |

**Mainnet supply-chain blockers:** none from this scan.

### 9.2 Informational Advisories

| ID | Crate | Action |
|----|-------|--------|
| RUSTSEC-2025-0141 | bincode 1.3.3 | Transitive; track Anchor bumps |
| RUSTSEC-2025-0161 | libsecp256k1 0.6.0 | Transitive |
| RUSTSEC-2026-0190 | anyhow 1.0.102 | Bump to ≥ 1.0.103 |
| RUSTSEC-2026-0097 | rand 0.7.3 | Transitive |

### 9.3 Recommendations

Add `#![forbid(unsafe_code)]` to `lib.rs`. Gate CI on `cargo audit` + `anchor test` — not tarpaulin percentage on program crate alone.

---

## 10. Anchor Safety Audit

*Source: [10-anchor-safety-audit.md](./10-anchor-safety-audit.md)*

### 10.1 Category Scores

| Category | Score |
|----------|-------|
| Account confusion | **OK** |
| Account types | **PARTIAL** |
| Account addresses | **OK** |
| Account liveness | **PARTIAL** |
| Ownership | **OK** |
| Missing constraints | **GAP** (economic policy only) |

Fund-safety bottom line: no wrong-type drain; exploitable economic gap is optional `config` omission.

### 10.2 Anchor Done Right (8 examples)

1. Vault init with full SPL constraints (`create_deal.rs:28-35`)
2. `Program<Token>` on every CPI
3. Vault address pinning on 7 instructions
4. Party ATA binding on release/refund
5. Admin `has_one = authority`
6. PDA CPI signing with stored bump
7. Migration with manual discriminator when deserialize fails
8. Fee math u128 checked in `state.rs`

### 10.3 Recommended Constraint Snippets

```rust
// A — deal PDA re-validation
seeds = [b"deal", deal.deal_id.as_bytes()], bump = deal.bump,

// B — config when fee-active
pub config: Account<'info, Config>,  // non-optional after init
```

New items (deal seeds, treasury constraints, approve_refund party constraint, zero-balance pre-close) mapped to §8 P2 optional hardening.

---

## 11. Adversarial Attack Audit

*Source: [11-adversarial-attack-audit.md](./11-adversarial-attack-audit.md)*

### 11.1 Can an Attacker Steal Escrowed USDC?

**No** — via on-chain account substitution on normal `create_deal` path. Indirect surfaces: worthless-token escrow (counterparty diligence), buyer unilateral release (by design), UI deception (on-chain constraints block wrong payouts).

### 11.2 Can an Attacker Permanently Freeze Funds?

**Yes** — realistic paths:

| Path | Mechanism |
|------|-----------|
| Upgrade without `migrate_deal` | `AccountDidNotDeserialize` |
| Treasury rotation + live Config client | `TreasuryAccountRequired` |
| Vault dust donation | SPL `close_account` requires zero balance |
| Milestone sum overflow | Release CPI fails |

### 11.3 Top Highest-ROI Issues

1. Fee bypass (omit config)
2. Post-upgrade freeze (no migrate wiring)
3. Treasury rotation freeze (client bug)
4. Self-deal + fee evasion (policy / volume abuse)
5. Vault dust griefing (rent lock)

### 11.4 Exploit Chains

- **Chain 1:** Fee evasion + self-deal wash → zero fees, inflated volume
- **Chain 2:** Upgrade freeze → funds locked until permissionless migrate
- **Chain 3:** Treasury rotation + live-config client → bilateral freeze
- **Chain 4:** Vault dust + completed refund → rent locked
- **Chain 5 (off-chain):** Supabase mirror desync → seller delivers against stale mirror state; on-chain state remains authoritative

### 11.5 PoC Test Matrix

18 named tests with expected errors documented in source annex. Priority alignment with §4 and §8 test priority list.

---

## Appendix: Security Testing Tooling

Unified runbook: **[SECURITY_TESTING.md](../SECURITY_TESTING.md)**

| Framework | Path | Purpose |
|-----------|------|---------|
| **Trident fuzz** | `trident-tests/` | Automated invariant / flow fuzzing (`trident fuzz run fuzz_0`) |
| **Neodyme PoC** | `poc-tests/` | Minimal exploit reproducers |
| **Otter CTF** | `ctf-tests/` | Regression challenges (fee bypass, vault/treasury defense confirmations) |
| **Anchor tests** | `tests/` | Integration regression (`anchor test` in WSL) |

**Prerequisite:** `anchor build` in WSL Ubuntu → produces `target/deploy/escrow.so`.

**Recommended flow:** Trident discovers suspicious paths → PoC/CTF confirms deterministically → Anchor TS tests lock regression.

Additional references: [POC_TESTS.md](../POC_TESTS.md), [programs/escrow/TRIDENT.md](../programs/escrow/TRIDENT.md).

---

## Out of Scope

- Full Next.js frontend audit (partial: `escrow-client.ts`, deal pages)
- External third-party audit engagement
- Pitch / deck assets

## Next Steps for External Auditors

1. Read [§8 Priority Roadmap](#8-priority-roadmap) and §1 audit prep checklist
2. Verify frozen commit `20547e5` bytecode SHA256
3. Confirm upgrade authority pubkey + multisig policy
4. Request green `TIERING_DEVNET_TEST.md` evidence before reviewing upgrade path
5. Run CTF challenges after `anchor build`: `cd ctf-tests && cargo test -- --ignored`

---

*Report consolidated from AUDIT/01–13. Individual annex files retained at `AUDIT/01-security-audit-prep-package.md` through `AUDIT/13-pda-seed-collision-audit.md` for drill-down detail.*

**Author: rade nugroho** · **Date: 2026-08-03** · **Baseline: `20547e5` / `security_audit`**

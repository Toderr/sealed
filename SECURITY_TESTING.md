# Sealed — Security Testing

Unified guide for on-chain security test tooling around the **escrow** Anchor program (`3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ`).

Audit context: [AUDIT/README.md](./AUDIT/README.md) · PoC matrix: [AUDIT/04](./AUDIT/04-sea-level-attack-audit.md) · Verified findings: [AUDIT/12](./AUDIT/12-false-positive-check.md) · Roadmap: [AUDIT/08](./AUDIT/08-priority-roadmap.md)

---

## Prerequisites

| Step | Command | Notes |
|------|---------|-------|
| Build program | `anchor build` | **Run in WSL Ubuntu** on Windows (see root `CLAUDE.md`) |
| base64ct pin (if SBF build fails) | `cargo update --precise 1.6.0 -p base64ct@1.8.0` | Otter Sec sol-ctf-framework note |
| Node (Anchor TS tests) | `npm install` at repo root if needed | For `tests/*.ts` |

All Rust security crates expect `target/deploy/escrow.so` after `anchor build`.

---

## Tooling matrix

Three complementary frameworks — each targets a different layer of security validation:

| Framework | Location | What it finds | Run |
|-----------|----------|---------------|-----|
| **Trident** (Ackee) | `trident-tests/` | Fuzz/invariant breaks via random instruction flows | `cd trident-tests && trident fuzz run fuzz_0` |
| **Neodyme PoC** | `poc-tests/` | Targeted exploit reproduction (5 audit-matrix PoCs) | `cd poc-tests && cargo test -- --nocapture` |
| **Otter CTF** | `ctf-tests/` | Human-readable audit challenges (3 exploit + defense demos) | `cd ctf-tests && cargo test -- --ignored --nocapture` |

### How they complement each other

- **Trident** — broad, automated exploration. Good for finding unexpected state combinations and deserialization edge cases. Wired in `trident-tests/fuzz_0/` with helpers mirroring current instruction layout.
- **Neodyme PoC** — minimal, shareable exploit scripts for auditors. Five deterministic reproducers in `poc-tests/tests/security_pocs.rs` using [`solana-poc-framework`](https://github.com/neodyme-labs/solana-poc-framework) (`branch = "2.2"`). See [POC_TESTS.md](./POC_TESTS.md).
- **Otter CTF** — turns audit TRUE POSITIVES into runnable challenges for devs and reviewers. Three challenges in `ctf-tests/tests/`. Uses [sol-ctf-framework](https://github.com/otter-sec/sol-ctf-framework) locally (no TCP server required).

Recommended flow: Trident discovers suspicious paths → PoC/CTF confirms with a deterministic narrative → Anchor TS tests lock regression.

---

## 1. Trident fuzz (`trident-tests/`)

Full setup, CLI options, and macOS/WSL notes: **[programs/escrow/TRIDENT.md](./programs/escrow/TRIDENT.md)**

**Prerequisite:** `anchor build` in **WSL Ubuntu** (produces `target/deploy/escrow.so`). Fuzz execution fails without the built artifact.

```bash
anchor build   # WSL — required before fuzz run
cd trident-tests
trident fuzz run fuzz_0
# Refresh types after IDL change (WSL):
# anchor build && trident fuzz refresh fuzz_0
```

**Target `fuzz_0` — four flows** (`fuzz_0/test_fuzz.rs`):

| Flow | Scenario |
|------|----------|
| `flow_fund_and_release` | init_config → create_deal → fund_escrow → release_milestone |
| `flow_cancel_unfunded` | create_deal → cancel_deal (unfunded) |
| `flow_mutual_refund` | create → fund → approve_refund (buyer + seller) |
| `flow_account_substitution_attacks` | Wrong vault / mint / treasury on fund (expect revert) |

Roadmap: [AUDIT/08](./AUDIT/08-priority-roadmap.md) item **16b** — run `trident fuzz run fuzz_0` after WSL build.

- **Do not** modify `trident-tests/` layout when adding other frameworks — it is an isolated workspace

---

## 2. Neodyme PoC (`poc-tests/`)

Five integration tests using Neodyme's `solana-poc-framework` against a local bank with the compiled escrow BPF.

```bash
anchor build   # WSL — produces target/deploy/escrow.so
cd poc-tests
cargo test -- --nocapture
```

| Test | Audit ref | Expected |
|------|-----------|----------|
| `poc_create_deal_without_config_fee_bypass` | AUDIT/04 §4, 12 #1 | **SUCCESS** (TRUE POSITIVE — fee bypass) |
| `poc_wrong_vault_ata_for_deal` | AUDIT/04 §1 | **FAIL** (`ConstraintAddress`) |
| `poc_wrong_token_program_pubkey` | AUDIT/04 §2 | **FAIL** (`InvalidProgramId` / `ConstraintOwner`) |
| `poc_non_party_calls_approve_refund` | AUDIT/04 §3 | **FAIL** (`UnauthorizedBuyer` 6007) |
| `poc_treasury_ata_wrong_owner_when_fees_active` | AUDIT/04 §7 | **FAIL** (`TreasuryAccountRequired` 6018) |

Full runbook: [POC_TESTS.md](./POC_TESTS.md) · crate README: [poc-tests/README.md](./poc-tests/README.md)

Dependency (in `poc-tests/Cargo.toml`):

```toml
poc-framework = { git = "https://github.com/neodyme-labs/solana-poc-framework.git", branch = "2.2" }
```

---

## 3. Otter CTF challenges (`ctf-tests/`)

Local adapter for Otter Sec's sol-ctf-framework — runs as `cargo test`, not a CTF server.

```bash
anchor build   # WSL — produces target/deploy/escrow.so
cd ctf-tests
cargo test -- --ignored --nocapture
```

| Challenge | Audit ref | Expected outcome |
|-----------|-----------|------------------|
| **Fee Free** | AUDIT/12 #1, P0-1 | Exploit succeeds — omit `config` → permanent `fee_bps=0` |
| **Wrong Vault** | AUDIT/04, AUDIT/11 | Defense holds — `ConstraintAddress` on vault substitute |
| **Treasury Trap** | AUDIT/04, AUDIT/11 | Defense holds — `TreasuryAccountRequired` (6018) |

See [ctf-tests/README.md](./ctf-tests/README.md). Related minimal reproducers: [poc-tests/](./poc-tests/) · [POC_TESTS.md](./POC_TESTS.md).

Dependency (in `ctf-tests/Cargo.toml`):

```toml
sol-ctf-framework = { git = "https://github.com/otter-sec/sol-ctf-framework.git" }
```

---

## 4. Anchor integration tests (`tests/`)

Standard Anchor/TypeScript tests — must keep passing:

```bash
anchor test   # WSL
```

- `tests/platform-fee.ts` — fee behavior stubs (extend per AUDIT/04 sea-level plan)
- Does **not** conflict with `trident-tests/`, `poc-tests/`, or `ctf-tests/` (separate workspaces / runner)

---

## Compile status & known blockers

| Crate | Compiles without `anchor build` | Blocker |
|-------|----------------------------------|---------|
| `programs/escrow` | Yes (in WSL with Anchor toolchain) | Windows native `anchor build` unsupported |
| `trident-tests` | Yes (`cargo check` in `trident-tests/`) | Fuzz run needs built `.so` |
| `poc-tests` | Yes (`cargo check` in `poc-tests/`) | `cargo test` needs `target/deploy/escrow.so` |
| `ctf-tests` | Yes (`cargo check` in `ctf-tests/`) | `cargo test` needs `target/deploy/escrow.so` |

**Version note:** `sol-ctf-framework` pins Solana **3.0**; `poc-framework` uses Solana **2.2** (`branch = "2.2"`). Anchor 0.31.1 builds against Solana **2.x**. Both harnesses load the BPF artifact via `ProgramTest` / `LocalEnvironment` — this is the supported integration path. If `.so` load fails after toolchain upgrades, rebuild with `anchor build` and re-run.

---

## Adding a new CTF challenge

1. Add a row to the challenge table in `ctf-tests/README.md`
2. Create `ctf-tests/tests/<name>.rs` using `LocalChallenge` + `escrow_ix` helpers
3. Map to an AUDIT/04 or AUDIT/12 finding ID in the module doc comment
4. Mark `#[ignore = "requires anchor build"]` until CI has a built artifact

---

## CI recommendation (future)

```yaml
# Pseudocode — run in WSL job after anchor build
- run: anchor build
- run: cd trident-tests && trident fuzz run fuzz_0 --limit 1000
- run: cd poc-tests && cargo test -- --nocapture
- run: cd ctf-tests && cargo test -- --ignored
- run: anchor test
```

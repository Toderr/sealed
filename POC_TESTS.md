# Sealed Escrow — Security PoC Tests

Rust integration tests using [Neodyme's solana-poc-framework](https://github.com/neodyme-labs/solana-poc-framework) (`branch = "2.2"`). They run against a **local bank** (`LocalEnvironment`) with the compiled escrow BPF loaded from `target/deploy/escrow.so`.

These PoCs complement (do not replace):

| Tool | Location | Purpose |
|------|----------|---------|
| **Anchor TS tests** | `tests/` | Happy-path + platform fee flows via `anchor test` |
| **Trident fuzz** | `trident-tests/` | Fuzz/account mutation scaffold (separate crate) |
| **Neodyme PoCs** | `poc-tests/` | Adversarial account substitution from audit matrix |

---

## Prerequisites

1. **Build the escrow program** (produces `target/deploy/escrow.so` + IDL):

   ```bash
   # From repo root — prefer WSL Ubuntu if macOS anchor build fails
   anchor build
   ```

   **macOS note:** Anchor 0.31.1 ships with Cargo 1.75, which may fail on newer crates.io packages (`edition2024`). If `anchor build` errors, use WSL:

   ```bash
   # Inside WSL Ubuntu
   cd /path/to/sealed-nine
   anchor build
   ```

2. **Rust toolchain** — system `cargo` 1.76+ for the PoC crate (independent of Anchor's bundled cargo):

   ```bash
   rustc --version   # 1.76+ recommended
   ```

---

## Run PoCs

```bash
cd poc-tests
cargo test -- --nocapture
```

Run a single test:

```bash
cargo test poc_wrong_vault_ata_for_deal -- --nocapture
cargo test poc_create_deal_without_config_fee_bypass -- --nocapture
```

Enable debug logs from the framework:

```bash
RUST_LOG=debug cargo test poc_non_party_calls_approve_refund -- --nocapture
```

---

## Implemented tests (audit matrix)

| Test | Audit ref | Expected |
|------|-----------|----------|
| `poc_create_deal_without_config_fee_bypass` | 04 §4, 08 #8, 11, 12 Claim 1 | **SUCCESS** (TRUE POSITIVE — documents fee bypass) |
| `poc_wrong_vault_ata_for_deal` | 04 §1, 08 #1 | **FAIL** (`ConstraintAddress` ~2004) |
| `poc_wrong_token_program_pubkey` | 04 §2, 08 #7 | **FAIL** (`InvalidProgramId` / `ConstraintOwner`) |
| `poc_non_party_calls_approve_refund` | 04 §3, 08 #5 | **FAIL** (`UnauthorizedBuyer` 6007) |
| `poc_treasury_ata_wrong_owner_when_fees_active` | 04 §7, 08 #2 | **FAIL** (`TreasuryAccountRequired` 6018) |

Full matrix: [AUDIT/08-priority-roadmap.md](./AUDIT/08-priority-roadmap.md) · [AUDIT/11-adversarial-attack-audit.md](./AUDIT/11-adversarial-attack-audit.md)

---

## Layout

```
poc-tests/
├── Cargo.toml              # poc-framework git dep (Solana 2.2 branch)
├── src/
│   ├── lib.rs
│   ├── escrow_ix.rs        # Manual instruction builders (malicious account wiring)
│   └── harness.rs          # LocalEnvironment bootstrap + helpers
└── tests/
    └── security_pocs.rs    # Integration tests
```

**Program ID:** `3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ`

**Keypairs:** Framework `keypair(n)` — buyer=`keypair(1)`, seller=`keypair(2)`, stranger=`keypair(3)`, etc. (see [poc-framework README](https://github.com/neodyme-labs/solana-poc-framework)).

---

## Adding a new PoC

1. Add an instruction builder in `src/escrow_ix.rs` if needed (explicit `AccountMeta` list).
2. Add a `#[test] fn poc_…()` in `tests/security_pocs.rs` using `expect_success` or `expect_failure`.
3. Cross-reference the test name in `AUDIT/08-priority-roadmap.md`.

Use `execute_as_transaction(…).print()` (via `PrintableTransaction`) when debugging failing transactions.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `escrow.so not found` | Run `anchor build` from repo root |
| `anchor build` fails on macOS (edition2024) | Build in WSL; copy `target/deploy/escrow.so` back or run PoCs in WSL |
| PoC crate compile errors | Ensure `poc-tests/` has its own `[workspace]` table (not in root workspace) |
| Transaction succeeds when it should fail | Re-check account order matches Anchor IDL; use `.print()` on the tx |

---

## Status (last integration)

| Item | Status |
|------|--------|
| `cargo check` in `poc-tests/` | ✅ Passes |
| `cargo test` (runtime) | ⏳ Blocked until `target/deploy/escrow.so` exists |
| `anchor build` on macOS (Aug 2026) | ❌ Cargo 1.75 / edition2024 registry conflict — use WSL |

# Neodyme solana-poc-framework

Targeted exploit reproduction crate for audit PoC matrix rows ([AUDIT/04](../AUDIT/04-sea-level-attack-audit.md), [AUDIT/11](../AUDIT/11-adversarial-attack-audit.md)).

**Runbook:** [POC_TESTS.md](../POC_TESTS.md) — prerequisites, commands, troubleshooting.

## Quick start

```bash
anchor build   # WSL — produces target/deploy/escrow.so
cd poc-tests
cargo test -- --nocapture
```

## Implemented PoCs (5)

| Test | Audit ref | Expected |
|------|-----------|----------|
| `poc_create_deal_without_config_fee_bypass` | AUDIT/04 §4, 08 #8, 12 #1 | **SUCCESS** (TRUE POSITIVE — fee bypass) |
| `poc_wrong_vault_ata_for_deal` | AUDIT/04 §1, 08 #1 | **FAIL** (`ConstraintAddress`) |
| `poc_wrong_token_program_pubkey` | AUDIT/04 §2, 08 #7 | **FAIL** (`InvalidProgramId` / `ConstraintOwner`) |
| `poc_non_party_calls_approve_refund` | AUDIT/04 §3, 08 #5 | **FAIL** (`UnauthorizedBuyer` 6007) |
| `poc_treasury_ata_wrong_owner_when_fees_active` | AUDIT/04 §7, 08 #2 | **FAIL** (`TreasuryAccountRequired` 6018) |

Source: `tests/security_pocs.rs` · harness: `src/harness.rs`, `src/escrow_ix.rs`

## Dependency

```toml
poc-framework = { git = "https://github.com/neodyme-labs/solana-poc-framework.git", branch = "2.2" }
```

## Relationship to other tooling

| Tool | Role |
|------|------|
| `trident-tests/` | Fuzz discovery |
| `poc-tests/` | Minimal Neodyme reproducers for external auditors |
| `ctf-tests/` | Otter Sec CTF-style challenge runner (local) |

See [SECURITY_TESTING.md](../SECURITY_TESTING.md) for the unified runbook.

PoCs should be the smallest instruction sequence that demonstrates a finding — do **not** duplicate Trident fuzz flows or CTF challenge narratives.

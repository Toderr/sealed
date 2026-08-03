# Trident Fuzzing — Sealed Escrow

[Ackee Trident](https://ackee.xyz/trident/docs/latest/) stateful fuzz tests for `programs/escrow/`.

**Program ID:** `3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ`

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| `trident-cli` | 0.12.x | `cargo install trident-cli` |
| Anchor | 0.31.1 | `avm install 0.31.1 && avm use 0.31.1` |
| Solana / SBF | ≥ 1.18 | `solana-install init` |

Verify:

```bash
trident --version    # Trident 0.12.0
anchor --version     # anchor-cli 0.31.1
```

---

## Build program (required before fuzzing)

Trident loads `target/deploy/escrow.so` (see `trident-tests/Trident.toml`).

### Recommended: WSL Ubuntu

Native macOS may fail on Anchor 0.31.1 + Solana 1.18 (`edition2024` / `Cargo.lock` v4 vs bundled Cargo 1.75):

```bash
# In WSL
cd /path/to/sealed-nine
avm use 0.31.1
anchor build
```

This produces:

- `target/deploy/escrow.so`
- `target/idl/escrow.json`

### After building — refresh Trident types

The repo ships a stale IDL copy under `app/src/lib/idl/`. After `anchor build`, regenerate fuzz types:

```bash
cp target/idl/escrow.json app/src/lib/idl/escrow.json   # optional app sync
trident fuzz refresh fuzz_0
```

Re-apply manual patches in `trident-tests/fuzz_0/helpers.rs` if `types.rs` overwrote `creator_wallet` helpers (until IDL is current).

---

## Run fuzz tests

All commands from **`trident-tests/`** (not repo root):

```bash
cd trident-tests
trident fuzz run fuzz_0
```

Options:

```bash
# Fixed seed (reproducible)
trident fuzz run fuzz_0 ed61eb0b3ec598437ee6971ce82b19a6e2c31ea208c4df332f44460c226fd894

# Debug single iteration
trident fuzz debug fuzz_0 <SEED>

# Exit non-zero on invariant failure (CI)
trident fuzz run fuzz_0 --with-exit-code
```

---

## Fuzz target: `fuzz_0`

| Flow | Scenario |
|------|----------|
| `start` (init) | SPL mint, buyer/seller ATAs, fund buyer |
| `flow_fund_and_release` | init_config → create_deal → fund_escrow → release_milestone |
| `flow_cancel_unfunded` | create_deal → cancel_deal |
| `flow_mutual_refund` | create → fund → approve_refund (buyer + seller) |
| `flow_account_substitution_attacks` | Wrong vault / mint / treasury on fund (expect revert) |

Helpers in `fuzz_0/helpers.rs` encode the **current** on-chain layout (`creator_wallet`, optional accounts) because the checked-in IDL predates tier/refund upgrades.

---

## Layout

```
trident-tests/
├── Trident.toml          # program path + metrics
├── Cargo.toml            # trident-fuzz 0.12, features = ["all"]
└── fuzz_0/
    ├── test_fuzz.rs      # flows
    ├── helpers.rs        # SPL setup, manual ix builders
    ├── types.rs          # Trident-generated (from IDL)
    └── fuzz_accounts.rs  # AddressStorage per account role
```

---

## macOS status (Aug 2026)

| Step | macOS native | WSL |
|------|--------------|-----|
| `trident-cli` install | ✅ | ✅ |
| `trident fuzz` compile | ✅ | ✅ |
| `anchor build` → `.so` | ❌ (Cargo/edition2024) | ✅ expected |
| `trident fuzz run` execute | ❌ without `.so` | ✅ after build |

Observed macOS error without `.so`:

```
Failed to read file: ../target/deploy/escrow.so
```

---

## CI suggestion

```yaml
- run: avm use 0.31.1 && anchor build
- run: cd trident-tests && trident fuzz run fuzz_0 --with-exit-code
```

---

## Related audit docs

- Sea-level negative scenarios: `AUDIT/04-sea-level-attack-audit.md`
- Test priority roadmap: `AUDIT/08-priority-roadmap.md` (item 16 — complement with Trident flows)

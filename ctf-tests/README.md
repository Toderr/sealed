# Sealed CTF Challenges (Otter Sec sol-ctf-framework)

Local security challenges derived from audit **TRUE POSITIVES** and sea-level defense checks. Uses [sol-ctf-framework](https://github.com/otter-sec/sol-ctf-framework) as a `ProgramTest` harness (adapted from the TCP CTF server pattern for local dev).

## Prerequisites

1. Build the escrow program (WSL Ubuntu recommended per project docs):

   ```bash
   anchor build
   ```

2. Optional — if `cargo-build-sbf` fails on `base64ct`:

   ```bash
   cargo update --precise 1.6.0 -p base64ct@1.8.0
   ```

3. Rust toolchain with `cargo test`.

## Challenges

| Challenge | Audit ref | Goal |
|-----------|-----------|------|
| **Fee Free** | AUDIT/12 #1, AUDIT/04 F-03 | Omit optional `config` on `create_deal` → permanent fee-free deal |
| **Wrong Vault** | AUDIT/04, AUDIT/11 | Substitute vault ATA → must fail (`ConstraintAddress`) |
| **Treasury Trap** | AUDIT/04, AUDIT/11 | Wrong treasury ATA when fees active → must fail (`TreasuryAccountRequired`) |

## Run

```bash
cd ctf-tests
cargo test -- --nocapture
```

Tests are marked `#[ignore = "requires anchor build"]` until `../target/deploy/escrow.so` exists. Run explicitly:

```bash
cargo test -- --ignored --nocapture
```

## Related tooling

| Crate | Role |
|-------|------|
| `poc-tests/` | Neodyme minimal reproducers — 5 audit-matrix PoCs ([POC_TESTS.md](../POC_TESTS.md)) |
| `trident-tests/` | Trident fuzz discovery |

See [SECURITY_TESTING.md](../SECURITY_TESTING.md) for the full security tooling matrix.

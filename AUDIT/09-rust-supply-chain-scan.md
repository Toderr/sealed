# Rust Supply-Chain & Coverage Scan — `programs/escrow/`

Automated dependency vulnerability, `unsafe` usage, and line-coverage scan of the Sealed escrow Anchor program workspace.

| Field | Value |
|-------|-------|
| **Baseline commit** | `20547e5e42554ba334b5db8d7e0f0b1766f1e4e9` |
| **Branch** | `security_audit` |
| **Scan date** | 2026-08-03 |
| **Host** | macOS (darwin) |
| **Workspace** | Virtual workspace at repo root (`programs/*`); escrow at `programs/escrow/Cargo.toml` |
| **Dependencies scanned** | 270 (from `Cargo.lock`) |

---

## Executive summary

| Tool | Verdict |
|------|---------|
| **cargo-audit** | **Pass** — 0 CVE-style vulnerabilities; 4 informational RustSec advisories (transitive / patchable) |
| **cargo-geiger** | **Pass** — First-party `escrow` crate 100% safe (no `unsafe`); full tree ~94% safe at function level |
| **cargo-tarpaulin / llvm-cov** | **Misleading if read alone** — ~0.22% line coverage via `cargo test`; Anchor programs require `anchor test` for meaningful coverage |

**Mainnet supply-chain blockers:** none from this scan. Action items are hygiene (bump `anyhow`, CI gates) and test-suite work already tracked in P1 roadmap items #16–17.

---

## Tool versions & commands

| Tool | Version | Install path |
|------|---------|--------------|
| `cargo-audit` | 0.22.2 | `~/.cargo/bin/` |
| `cargo-geiger` | 0.13.0 | `~/.cargo/bin/` |
| `cargo-tarpaulin` | 0.37.0 | `~/.cargo/bin/` |
| `cargo-llvm-cov` (supplemental) | 0.8.7 | `~/.cargo/bin/` |

All tools were pre-installed; no `cargo install` was required for this run.

### Commands executed

```bash
# From repo root (/Users/macbook/sealed-nine)

cargo audit
cargo audit --json

# geiger: -p escrow from virtual workspace root fails (exit 101)
cargo geiger --manifest-path /Users/macbook/sealed-nine/programs/escrow/Cargo.toml --output-format Json
cargo geiger --manifest-path /Users/macbook/sealed-nine/programs/escrow/Cargo.toml --output-format Ratio 2>/dev/null
cargo geiger --manifest-path /Users/macbook/sealed-nine/programs/escrow/Cargo.toml --forbid-only 2>/dev/null

cargo tarpaulin --manifest-path /Users/macbook/sealed-nine/programs/escrow/Cargo.toml --out Stdout

cargo llvm-cov --manifest-path /Users/macbook/sealed-nine/programs/escrow/Cargo.toml --summary-only
```

### Exit codes

| Command | Exit code | Notes |
|---------|-----------|--------|
| `cargo audit` | **0** | 270 deps scanned |
| `cargo audit --json` | **0** | Structured output |
| `cargo geiger -p escrow` (workspace root) | **101** | Virtual manifest error — use absolute `--manifest-path` |
| `cargo geiger --manifest-path …/programs/escrow/Cargo.toml` | **0** | Requires **absolute** path |
| `cargo geiger --forbid-only` | **0** | Confirms escrow lacks `#![forbid(unsafe_code)]` |
| `cargo tarpaulin --manifest-path …/programs/escrow/Cargo.toml` | **0** | Succeeded on macOS |
| `cargo llvm-cov --summary-only` | **0** | Supplemental coverage |

---

## 1. cargo-audit

**Result:** `vulnerabilities.found: false` — **0 CVE-style vulnerabilities**.

**Informational warnings:** 4 (RustSec advisory categories enabled; reported as `warning: 4 allowed warnings found`).

| ID | Crate | Locked version | Category | Title | Remediation |
|----|-------|----------------|----------|-------|-------------|
| [RUSTSEC-2025-0141](https://rustsec.org/advisories/RUSTSEC-2025-0141) | `bincode` | 1.3.3 | unmaintained | Bincode is unmaintained | Transitive via Solana/Anchor stack. No direct fix until upstream migrates to `bincode` 2.x or alternative serializer. Track Anchor/Solana release notes; not exploitable in isolation for on-chain BPF. |
| [RUSTSEC-2025-0161](https://rustsec.org/advisories/RUSTSEC-2025-0161) | `libsecp256k1` | 0.6.0 | unmaintained | libsecp256k1 is unmaintained | Transitive (crypto deps). Escrow does not call secp256k1 directly. Monitor Solana SDK bumps. |
| [RUSTSEC-2026-0190](https://rustsec.org/advisories/RUSTSEC-2026-0190) | `anyhow` | 1.0.102 | unsound | Unsoundness in `Error::downcast_mut()` | **Actionable:** bump to **≥ 1.0.103** when lockfile resolution allows (`cargo update -p anyhow`). Low runtime risk for BPF (error downcast paths rarely used on-chain). |
| [RUSTSEC-2026-0097](https://rustsec.org/advisories/RUSTSEC-2026-0097) | `rand` | 0.7.3 | unsound | Unsound with custom logger + `thread_rng` | Transitive only; `rand` 0.8.6 also present in lockfile. Not used for on-chain randomness in escrow. Wait for dependency tree to drop 0.7.x. |

### Raw audit output (text)

```
Fetching advisory database from `https://github.com/RustSec/advisory-db.git`
  Loaded 1186 security advisories
  Scanning Cargo.lock for vulnerabilities (270 crate dependencies)
Crate:     bincode     Version: 1.3.3   Warning: unmaintained   ID: RUSTSEC-2025-0141
Crate:     libsecp256k1 Version: 0.6.0  Warning: unmaintained   ID: RUSTSEC-2025-0161
Crate:     anyhow      Version: 1.0.102 Warning: unsound        ID: RUSTSEC-2026-0190
Crate:     rand        Version: 0.7.3   Warning: unsound        ID: RUSTSEC-2026-0097
warning: 4 allowed warnings found
```

---

## 2. cargo-geiger

Measures `unsafe` usage in first-party code and the full dependency tree.

### Geiger legend

| Marker | Meaning |
|--------|---------|
| `:)` | No `unsafe` found; declares `#![forbid(unsafe_code)]` |
| `?` | No `unsafe` found; **missing** `#![forbid(unsafe_code)]` |
| `!` | `unsafe` usage found |

### First-party `escrow 0.1.0`

**Marker:** `?` — no `unsafe` in escrow sources; **`#![forbid(unsafe_code)]` not present**.

| Metric | Safe / total | Ratio |
|--------|--------------|-------|
| Functions | 34/34 | **100%** |
| Expressions | 779/779 | **100%** |
| Impls | 2/2 | **100%** |
| Traits | 0/0 | — |
| Methods | 7/7 | **100%** |

**Recommendation:** Add `#![forbid(unsafe_code)]` to `programs/escrow/src/lib.rs` to enforce the current safe posture and earn geiger `:)` on first-party code.

### Full dependency tree (escrow + transitive deps)

| Metric | Safe / total | Ratio |
|--------|--------------|-------|
| Functions | 6806/7233 | **94.10%** (~427 functions with `unsafe`) |
| Expressions | 312656/338551 | **92.35%** |
| Impls | 14884/15285 | **97.38%** |
| Traits | 842/896 | **93.97%** |
| Methods | 21419/22215 | **96.42%** |

Many transitive crates show `!` — expected for Anchor/Solana/SPL (`syn`, `proc-macro2`, `serde_json`, Solana runtime crates, etc.).

### Geiger caveats

- **Virtual workspace:** `cargo geiger -p escrow` from repo root fails (exit 101). Always pass absolute `--manifest-path programs/escrow/Cargo.toml`.
- **JSON output:** `--output-format Json` mixes cargo artifact JSON into stdout; prefer `--output-format Ratio` with `2>/dev/null` for CI logs.
- **Stderr noise:** Harmless `Failed to match … zerocopy-derive`, `bytes`, `tinyvec` messages; scan still completes.

---

## 3. cargo-tarpaulin & cargo-llvm-cov

### Why coverage is ~0%

Anchor on-chain programs are integration-tested via **`anchor test`** (TypeScript + local validator), not via Rust `#[test]` unit tests in the program crate. The escrow crate exposes only one built-in test:

```rust
#[test]
fn test_id() { /* program ID assertion */ }
```

Running `cargo test` / tarpaulin on the library crate therefore reports near-zero coverage of instruction handlers — **this is expected**, not a sign the program is untested (the TS suite in `tests/` is the real harness; see roadmap P1 #16–17).

### cargo-tarpaulin (macOS)

| Metric | Value |
|--------|--------|
| **Line coverage** | **0.22%** (1/451 lines) |
| Tests run | 1 (`test_id`) |
| Instruction modules | 0% (all handlers uncovered via `cargo test`) |
| `lib.rs` | 1/35 lines |

Per-file: all `programs/escrow/src/instructions/*.rs` and `state.rs` at 0/N lines.

**Note:** Tarpaulin succeeded on macOS in this run (not blocked on darwin). For CI, Linux/WSL runners are still preferred for Anchor toolchain parity per project docs.

### cargo-llvm-cov (supplemental)

| Metric | Value |
|--------|--------|
| TOTAL lines | **0.17%** (1/595) |
| TOTAL regions | **0.12%** |
| `lib.rs` lines | **1.69%** |

Build emitted Anchor/Solana `unexpected cfg` warnings and deprecated `AccountInfo::realloc` notices — build warnings only, not tool failures.

### Meaningful coverage path

| Approach | Covers |
|----------|--------|
| `cargo test` / tarpaulin on `programs/escrow` | `test_id` only (~0.2%) |
| **`anchor test`** (WSL/Linux) | Fund, release, refund, fee, migration paths via TS integration tests |
| Future: Rust integration tests in `tests/` workspace member | Could raise tarpaulin numbers if added |

Aligns with roadmap **P1 #16** (`tests/sea-level-attacks.ts`) and **#17** (`tests/platform-fee.ts` + CI gate on `anchor test`).

---

## Recommendations for CI

### Required gates (P3 roadmap #33 — extend)

```yaml
# Example GitHub Actions steps (Linux/WSL runner for Anchor parity)

- name: Install Rust security tools
  run: |
    cargo install cargo-audit cargo-geiger --locked
    # tarpaulin: Linux only; skip or use llvm-cov on macOS runners

- name: cargo audit (fail on vulnerabilities)
  run: cargo audit
  # Optional: cargo audit --deny warnings  # once anyhow ≥1.0.103

- name: cargo geiger (first-party safe)
  run: |
    cargo geiger \
      --manifest-path "$GITHUB_WORKSPACE/programs/escrow/Cargo.toml" \
      --output-format Ratio 2>/dev/null | tee geiger.txt
    # Assert escrow line shows 100% functions (manual grep or script)

- name: anchor test (meaningful coverage)
  run: anchor test
  # Gate merges on green — not tarpaulin percentage
```

### Suggested policy

| Check | Frequency | Fail condition |
|-------|-----------|----------------|
| `cargo audit` | Every PR touching `Cargo.lock` / Rust deps | Any `vulnerability` (not informational `warning`) |
| `cargo audit` advisories | Weekly / on lockfile bump | Track `anyhow` unsound until ≥1.0.103 |
| `cargo geiger` | Every PR touching `programs/escrow/` | Escrow first-party functions < 100% safe (regression) |
| `#![forbid(unsafe_code)]` | One-time hardening (P2) | Optional CI assert via geiger `:)` marker |
| `anchor test` | Every PR | Red suite (P1 #17) |
| `cargo tarpaulin` | Informational only on program crate | Do **not** gate on % until Rust integration tests exist |
| Semgrep | Every PR (app + program) | Per existing P3 #33 |

### Dependency hygiene (non-blocking)

1. **`anyhow` ≥ 1.0.103** — run `cargo update -p anyhow` when Solana/Anchor constraints allow (P2 #36).
2. **`bincode` / `libsecp256k1`** — accept as transitive Solana/Anchor debt; re-audit on Anchor version bumps.
3. **`rand` 0.7.3** — monitor; no direct escrow dependency.

---

## Cross-references

| Topic | Roadmap item |
|-------|--------------|
| `anchor test` CI gate | P1 #17 |
| Sea-level negative tests | P1 #16 |
| `cargo audit` / Semgrep in CI | P3 #33 (extend with geiger) |
| `anyhow` bump | P2 #36 |
| Coverage gap explanation | Supports P1 test-suite urgency (#16–17) |

---

## Out of scope

- Modifying `Cargo.lock` or bumping dependency versions (deferred to lockfile maintenance)
- Anchor security checklist (report c3732254) — findings already captured in reports 02–04 and roadmap P0/P1
- Snyk / Semgrep scans (separate tooling)
- Mainnet bytecode SHA256 verification (see report 01)

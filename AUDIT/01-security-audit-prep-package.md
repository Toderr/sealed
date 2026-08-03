# Sealed Escrow Program — Security Audit Prep Package

**Program ID:** `3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ`  
**Anchor:** 0.31.1  
**Branch:** `security_audit`  
**Frozen commit (suggested audit baseline):** `20547e5e42554ba334b5db8d7e0f0b1766f1e4e9`  
**Instructions:** 17 (confirmed in `lib.rs`)  
**Report date:** 2026-08-03  

---

## A. Executive Summary

| Severity | Count | Representative issues |
|----------|-------|------------------------|
| **CRITICAL** | 1 | Optional `config` account allows platform fee bypass at deal creation |
| **HIGH** | 3 | Unconstrained mint; `buyer == seller` allowed; unchecked `u64` milestone sum |
| **MEDIUM** | 5 | `approve_refund` leaves vault open; `creator_wallet` asserted not proven; no vault `mint` re-check; legacy `refund` leaves accounts open; `released_amount`/`funded_amount` unchecked add |
| **LOW** | 4 | Dead `Disputed`/`Reputation` types; misleading migrate errors; fee rounding dust; rent reclamation UX gap |
| **INFO** | 6+ | Documented trust boundaries, permissionless migrations, tier snapshot design |

### Mainnet readiness: **NOT READY**

The program has solid Anchor account wiring for token CPIs, PDA-derived vaults, and authority-gated config. However, the **optional-config fee bypass** is a direct revenue-integrity failure, **mint is not constrained to USDC**, and **automated test coverage is skeletal** (one partial TS file, no Rust integration tests). Migration paths (`migrate_deal`, `migrate_config`) are thoughtfully designed but must be verified on devnet per `TIERING_DEVNET_TEST.md` before any live upgrade.

**Recommended gate:** Fix P0 items, complete integration tests for all 17 instructions, run external audit, then freeze bytecode + IDL at a tagged commit.

---

## B. Solana Vulnerability Scanner (6-Pattern Checklist)

| Pattern | Result | Evidence |
|---------|--------|----------|
| **1. Arbitrary CPI** | ✅ **PASS** | All CPIs go through `anchor_spl::token` (`transfer`, `close_account`) or `system_program::transfer`. No user-supplied program IDs. |
| **2. Improper PDA** | ✅ **PASS** (with notes) | Deal/vault/config/tier PDAs use canonical seeds. `UncheckedAccount` in `migrate_*` manually validates discriminator + owner + seeds. `seller` is `UncheckedAccount` but only stores a pubkey — acceptable for this use case. |
| **3. Missing ownership** | ✅ **PASS** | Token accounts constrained via `owner`, `mint`, `address = deal.escrow_token_account`. Migrate handlers check `info.owner == program_id`. |
| **4. Missing signer** | ✅ **PASS** | Buyer/seller/authority gates present. `approve_refund` verifies signer is buyer or seller. |
| **5. Sysvar spoofing** | ✅ **PASS** | `Sysvar<'info, Rent>` typed in `create_deal`. `Clock::get()` uses syscall, not a passed account. |
| **6. Instruction introspection** | ✅ **PASS** | No `load_instruction_at`, `load_current_index_checked`, or stack-height checks found. |

**Scanner notes (non-fail):**
- `Option<Account<Config>>` in `create_deal` is architecturally equivalent to a **business-logic bypass**, not a classic ownership bug.
- Escrow vault `mint` is not re-validated in fund/release/refund paths (trusts creation-time binding).

---

## C. Security Findings

### CRITICAL

#### C-1: Optional config account enables platform fee bypass

**Location:** `programs/escrow/src/instructions/create_deal.rs:38-42, 128-186`

```38:42:programs/escrow/src/instructions/create_deal.rs
    /// Global platform config, if it exists — the deal snapshots its fee_bps +
    /// treasury. Optional so deals can still be created before init_config
    /// (they're then fee-free). Seeds-validated when provided.
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Option<Account<'info, Config>>,
```

```128:186:programs/escrow/src/instructions/create_deal.rs
    match &ctx.accounts.config {
        Some(config) if config.fee_active() => {
            deal.fee_bps = config.fee_bps;
            deal.treasury = config.treasury;
            // ... tier snapshot ...
        }
        _ => {
            deal.fee_bps = 0;
            deal.treasury = Pubkey::default();
            // ... fee-free path ...
        }
    }
```

**Issue:** After `init_config` + `set_treasury`, any buyer can omit the `config` account when calling `create_deal`. Anchor treats it as `None`, snapshotting a permanently fee-free deal.

**Exploit:** Buyer constructs `create_deal` without `config` → deal stores `fee_bps = 0`, `treasury = default()` → all subsequent `fund_escrow` / `release_milestone` calls skip fees despite live platform config.

**Recommendation:** Make `config` required once initialized (e.g. `#[account(seeds = [b"config"], bump)] pub config: Account<'info, Config>` with a program flag, or require config and use `fee_active()` gate only for treasury-unset bootstrap). Client/SDK must always pass config; add on-chain test asserting omission fails post-init.

---

### HIGH

#### H-1: Mint unconstrained — any SPL token accepted

**Location:** `programs/escrow/src/instructions/create_deal.rs:25-26, 97`

```25:26:programs/escrow/src/instructions/create_deal.rs
    /// USDC mint
    pub mint: Account<'info, Mint>,
```

**Issue:** Comments say USDC; on-chain there is no constraint tying `mint` to a canonical USDC address (devnet/mainnet).

**Exploit:** Attacker creates deal with worthless or attacker-minted token; UI/users expecting USDC may accept deal terms denominated in fake value.

**Recommendation:** Add `constraint = mint.key() == EXPECTED_USDC_MINT` (feature-gated per cluster) or accept `mint` via config PDA as canonical platform mint.

---

#### H-2: `buyer == seller` not forbidden

**Location:** `programs/escrow/src/instructions/create_deal.rs:95-96`

```95:96:programs/escrow/src/instructions/create_deal.rs
    deal.buyer = ctx.accounts.buyer.key();
    deal.seller = ctx.accounts.seller.key();
```

**Issue:** No `require!(buyer != seller)`. Same wallet can be both parties.

**Exploit:** Wash deals, fee/tier gaming, and (when reputation ships per `docs/ARCHITECTURE.md`) self-rating via mirrored off-chain aggregates tied to `creator`.

**Recommendation:** `require!(ctx.accounts.buyer.key() != ctx.accounts.seller.key(), EscrowError::SelfDeal);`

---

#### H-3: Milestone sum uses unchecked `u64` addition

**Location:** `programs/escrow/src/instructions/create_deal.rs:87-91`

```87:91:programs/escrow/src/instructions/create_deal.rs
    let milestone_sum: u64 = milestones.iter().map(|m| m.amount).sum();
    require!(
        milestone_sum == total_amount,
        EscrowError::MilestoneAmountMismatch
    );
```

**Issue:** `.sum()` on `u64` wraps in release builds. Malicious milestone amounts could wrap to match `total_amount`.

**Exploit:** Craft milestones whose wrapped sum equals `total_amount` while true sum ≫ `u64::MAX` (theoretical) or causes accounting mismatch with smaller wraps.

**Recommendation:** Use `try_fold(0u64, |acc, m| acc.checked_add(m.amount))` and reject on overflow.

---

### MEDIUM

#### M-1: `approve_refund` does not close escrow vault or deal

**Location:** `programs/escrow/src/instructions/approve_refund.rs:87-102`

**Issue:** Transfers remaining balance and sets `DealStatus::Refunded` but does not `close_account` on vault (unlike `cancel_deal`, `buyer_timeout_refund`). Buyer must call `close_deal` separately.

**Exploit:** Not direct fund loss (SPL close requires zero balance), but leaves vault + deal accounts open; rent locked; UX/orphan-account griefing; integrators may forget `close_deal`.

**Recommendation:** Close vault in same instruction after transfer (pattern from `buyer_timeout_refund.rs:70-80`), or document mandatory two-step flow in IDL + client SDK.

---

#### M-2: `creator_wallet` asserted by buyer, not signer-proven

**Location:** `programs/escrow/src/instructions/create_deal.rs:74-85, 126`

```74:85:programs/escrow/src/instructions/create_deal.rs
    // TRUST BOUNDARY: only `buyer` signs create_deal, so `creator_wallet` is
    // ASSERTED by the buyer, not proven. This is safe for pricing because the
    // creator's discount lands on the creator's OWN side ...
    require!(
        creator_wallet == ctx.accounts.buyer.key() || creator_wallet == ctx.accounts.seller.key(),
        EscrowError::InvalidCreator
    );
```

**Issue:** Code acknowledges trust boundary. Safe for fee-side selection today; unsafe if `creator` gains semantic weight (reputation credit per architecture docs).

**Recommendation:** When reputation on-chain ships: require `creator_wallet` pubkey to sign `create_deal`, or derive creator from a single designated initiator signer.

---

#### M-3: Escrow vault mint not re-validated post-creation

**Location:** All fund/release/refund instructions — e.g. `fund_escrow.rs:19-23`

```19:23:programs/escrow/src/instructions/fund_escrow.rs
    #[account(
        mut,
        address = deal.escrow_token_account,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,
```

**Issue:** Only address match; no `constraint = escrow_token_account.mint == deal.mint`.

**Exploit:** Low practical risk (vault is PDA-init at creation with bound mint), but defense-in-depth gap if `deal.mint` ever desyncs via future upgrade bug.

**Recommendation:** Add mint constraint on all vault-touching instructions.

---

#### M-4: Legacy `refund` leaves vault and deal accounts open

**Location:** `programs/escrow/src/instructions/refund.rs:40-68`

**Issue:** Transfers funds, sets status, no account closure. Superseded by `approve_refund` but still exposed in IDL.

**Recommendation:** Deprecate/remove from IDL for new integrations, or add vault close; document sunset timeline.

---

#### M-5: Unchecked arithmetic on `funded_amount` / `released_amount`

**Location:** `fund_escrow.rs:89`, `release_milestone.rs:103`

**Issue:** `deal.funded_amount += amount` and `deal.released_amount += amount` without `checked_add`.

**Recommendation:** Use checked arithmetic consistent with `EscrowError::MathOverflow`.

---

### LOW

#### L-1: `DealStatus::Disputed` and `Reputation` defined but unused

**Location:** `state.rs:161, 179-190`

**Issue:** Dead enum variant and account type. `Disputed` cannot be entered; no dispute resolution path on-chain.

**Recommendation:** Remove or implement before audit to avoid auditor confusion; align with off-chain dispute flow in docs.

---

#### L-2: Migrate handlers reuse `InvalidCreator` for wrong owner

**Location:** `migrate_deal.rs:57`, `migrate_config.rs:48`

**Issue:** Misleading error when account owner ≠ program.

**Recommendation:** Add `InvalidAccountOwner` error variant.

---

#### L-3: Fee rounding leaves sub-lamport dust in vault

**Location:** `state.rs:101-116` (truncating division)

**Issue:** Truncation favors payee; over many deals, vault may retain dust preventing `close_account`.

**Recommendation:** Document; optional final dust sweep instruction or absorb dust to treasury.

---

#### L-4: `close_deal` requires buyer-only rent reclamation

**Location:** `close_deal.rs:8-18`

**Issue:** Seller cannot reclaim deal account rent after completion/refund.

**Recommendation:** Accept either party or split rent per product policy.

---

### INFO

| ID | Note |
|----|------|
| I-1 | Tier snapshot at creation prevents retroactive repricing — good design (`create_deal.rs:137-139`) |
| I-2 | Mutual refund approvals cleared on fund/release — prevents stale consent (`fund_escrow.rs:96-97`, `release_milestone.rs:109-110`) |
| I-3 | Permissionless `migrate_deal` / `migrate_config` — grow-only, idempotent, by design |
| I-4 | `init-if-needed` on `set_user_tier` — authority-paid, low griefing surface |
| I-5 | No on-chain dispute resolution despite architecture mentioning dispute state |
| I-6 | Buyer-only milestone release (no seller-initiated release) — product choice, document for auditors |

---

## D. QEDGen Brownfield Path

### Detection

| Check | Result |
|-------|--------|
| Existing Anchor program at `programs/escrow/` | ✅ Yes |
| `.qedspec` in repo | ❌ None found (glob `**/*.qedspec` → 0 files) |
| `qedgen --help` | ❌ Not installed |
| `$HOME/.agents/skills/qedgen/tools/qedgen --help` | ❌ Not found |

**Classification:** **BROWNFIELD** — existing deployed program, no formal spec.

### Recommended flow

1. **Install QEDGen:** Run upstream `install.sh` (per qedgen skill docs) to obtain CLI at `$HOME/.agents/skills/qedgen/tools/qedgen`.
2. **Run `/qedgen-auditor` first** — ingest all 17 instructions + account structs; produce structured finding catalog mapped to instruction boundaries.
3. **Author `.qedspec`** — encode invariants below as machine-checkable properties.
4. **Iterate** — spec → property tests → fix → re-verify (do **not** file GitHub issues from this prep pass).

### Draft spec constructs (generic F# shapes — top 5 findings)

```fsharp
// Finding C-1: Config must be present when platform fees are active
requires createDeal(configAccount: option<ConfigAccount>)
property FeeSnapshotWhenConfigActive =
  match configAccount with
  | Some cfg when cfg.feeBps > 0 && cfg.treasury <> Pubkey.default ->
      deal.feeBps = cfg.feeBps && deal.treasury = cfg.treasury
  | None when platformConfigExists() ->
      false  // MUST fail — no silent fee bypass
  | _ -> deal.feeBps = 0

// Finding H-1: Canonical mint
requires createDeal(mint: MintAccount)
invariant AllowedMint =
  mint.key = canonicalStablecoinMint

// Finding H-2: Distinct counterparties
requires createDeal(buyer: Signer, seller: Pubkey)
invariant DistinctParties =
  buyer.key <> seller

// Finding H-3: Milestone sum integrity
requires createDeal(milestones: list<MilestoneInput>, totalAmount: uint64)
property MilestoneSumMatches =
  let sum = milestones |> List.fold (fun acc m -> acc + m.amount) 0UL // checked
  sum = totalAmount && not (overflowOccurred sum)

// Finding M-1: Refund closes vault
requires approveRefund(deal: DealAccount, vault: TokenAccount)
property RefundClosesVault =
  deal.status = Refunded ==> vault.balance = 0 && vault.closed
```

---

## E. Guidelines Advisor (Trail of Bits Style)

### Documentation gaps

| Area | Status | Gap |
|------|--------|-----|
| Instruction trust boundaries | Partial | `create_deal` creator boundary documented in-code; not in external audit brief |
| Migration runbook | Good | `TIERING_DEVNET_TEST.md` is thorough |
| Threat model | Missing | No standalone `THREAT_MODEL.md` for on-chain program |
| Account size / upgrade history | Good | Comments in `state.rs` explain append-only Borsh layout |
| IDL ↔ Rust parity | Unknown | Requires `anchor build` artifact diff |

### On-chain / off-chain split

- **On-chain source of truth for funds** — correctly implemented; Supabase must not drive releases (per `docs/ARCHITECTURE.md`).
- **Reputation hybrid** — `Reputation` PDA exists in `state.rs` but **no instructions** implement it; off-chain `sealed_reputation` can drift until on-chain anchor ships.
- **Dispute state** — `Disputed` enum variant with no transition logic; off-chain dispute handling unauditable on-chain.

### Upgradeability

- Standard Solana **BPF Upgradeable Loader** assumed (deploy via `solana program deploy` / `anchor upgrade`).
- **Single upgrade authority** holds key to replace all 17 instruction handlers — document authority pubkey, multisig plan, and timelock policy for auditors.
- **Layout migrations** (`migrate_deal`, `migrate_config`) are mandatory after struct append — failure mode documented; must be in upgrade checklist.

### Events

- **No Anchor events** (`#[event]`) anywhere in program.
- Reliance on `msg!` logs only — indexers/off-chain monitors cannot reliably parse structured state transitions.
- **Recommendation:** Add events for `DealCreated`, `EscrowFunded`, `MilestoneReleased`, `RefundApproved`, `DealClosed`.

### Testing

| Layer | Coverage |
|-------|----------|
| Rust unit tests in program | ❌ None |
| Anchor integration tests | ❌ None complete |
| TS tests (`tests/platform-fee.ts`) | ⚠️ Skeleton — many tests are comments/stubs |
| Devnet manual (`TIERING_DEVNET_TEST.md`) | ✅ Documented, not automated |
| Migration regression | ⚠️ Critical path documented, blocking for live upgrade |

### Dependencies

```toml
anchor-lang = "0.31.1"  # init-if-needed feature
anchor-spl  = "0.31.1"
```

- Pin exact versions ✅
- Run `cargo audit` / `anchor verify` before audit
- `init-if-needed` expands attack surface slightly — already authority-gated in `set_user_tier`

### Common Solana pitfalls checklist

| Pitfall | Status |
|---------|--------|
| Missing signer checks | ✅ Generally good |
| PDA seed canonicalization | ✅ Good |
| Token account owner validation | ✅ Good |
| Reinitialization | ✅ `init` on deal/config prevents double-init |
| Closing accounts / rent | ⚠️ Partial — `approve_refund` gap |
| Clock manipulation | ⚠️ `buyer_timeout_refund` uses `Clock` — validators control ± small skew; 30-day window mitigates |
| Front-running deal creation | ℹ️ deal_id is user-chosen string — race on same deal_id fails at init |

---

## F. Audit Prep Package

### Review goals for external auditors

1. **Fund safety:** No instruction path drains escrow to unauthorized recipient.
2. **Fee integrity:** Platform fees cannot be bypassed when config is active.
3. **Access control:** Only buyer releases milestones; only parties approve refunds; authority mutates config.
4. **Migration safety:** Pre-upgrade deals remain spendable after upgrade + `migrate_deal`.
5. **Account lifecycle:** All terminal states close vaults and reclaim rent.
6. **Arithmetic:** No overflow/wrap in amount aggregation.
7. **Token correctness:** Escrow denominated in intended stablecoin mint.

### Static analysis status

| Tool | Status |
|------|--------|
| Manual 6-pattern scan | ✅ Completed (this report) |
| 17-instruction systematic review | ✅ Completed (findings in §C) |
| `cargo clippy` / `cargo audit` | ⬜ Not run in this session — run in WSL before audit |
| Semgrep / Snyk | ⬜ Available via MCP plugins — not executed here |
| QEDGen formal properties | ⬜ CLI not installed; brownfield path recommended |

### Test coverage gaps

- [ ] `create_deal` — fee snapshot with/without config
- [ ] `create_deal` — config omission attack (must fail post-init)
- [ ] `create_deal` — tier asymmetric fees
- [ ] `create_deal` — buyer==seller rejection (once fixed)
- [ ] `fund_escrow` — partial funding, buyer fee once-only
- [ ] `release_milestone` — seller fee, status transitions
- [ ] `approve_refund` — two-step flow, stale approval clearing
- [ ] `buyer_timeout_refund` — 30-day boundary
- [ ] `cancel_deal` — partial fund + close
- [ ] `close_deal` — post-complete/post-refund
- [ ] `migrate_deal` / `migrate_config` — old layout → new layout (blocking)
- [ ] All config/tier authority negative tests
- [ ] Legacy `refund` compatibility or deprecation

### Scope file list

```
programs/escrow/Cargo.toml
programs/escrow/TIERING_DEVNET_TEST.md
programs/escrow/src/lib.rs
programs/escrow/src/error.rs
programs/escrow/src/state.rs
programs/escrow/src/instructions/mod.rs
programs/escrow/src/instructions/config.rs
programs/escrow/src/instructions/tier.rs
programs/escrow/src/instructions/create_deal.rs
programs/escrow/src/instructions/fund_escrow.rs
programs/escrow/src/instructions/release_milestone.rs
programs/escrow/src/instructions/refund.rs
programs/escrow/src/instructions/approve_refund.rs
programs/escrow/src/instructions/cancel_deal.rs
programs/escrow/src/instructions/buyer_timeout_refund.rs
programs/escrow/src/instructions/close_deal.rs
programs/escrow/src/instructions/migrate_deal.rs
programs/escrow/src/instructions/migrate_config.rs
Anchor.toml
tests/platform-fee.ts
```

**Out of scope (explicit):** `app/` frontend, Supabase schema, AI agent routes, off-chain reputation aggregation.

### Build & test commands (WSL Ubuntu)

```bash
# Prerequisites: solana-cli, anchor 0.31.1, node 18+
cd /path/to/sealed-nine

# Build program + IDL
anchor build

# Run tests (generates target/idl + target/types first)
anchor test

# Manual deploy to devnet (throwaway program id for migration tests)
solana config set --url devnet
anchor build
solana program deploy target/deploy/escrow.so

# Verify program hash matches audit artifact
sha256sum target/deploy/escrow.so
```

### Pre-audit checklist

- [ ] Freeze commit: `20547e5e42554ba334b5db8d7e0f0b1766f1e4e9`
- [ ] Tag release candidate (e.g. `audit-rc1`)
- [ ] Export IDL: `target/idl/escrow.json`
- [ ] Export `.so` SHA256
- [ ] Document upgrade authority pubkey + multisig policy
- [ ] Fix P0 findings (§G)
- [ ] Complete integration test suite
- [ ] Run `cargo audit` + clippy with deny warnings
- [ ] Execute `TIERING_DEVNET_TEST.md` migration test on throwaway program id
- [ ] Provide auditor: known issues list, architecture docs, this report

### Questions for external auditors

1. Is optional `Option<Account<Config>>` an acceptable bootstrap pattern, or should config be mandatory after first `init_config`?
2. Should mint be hardcoded per cluster or stored in config PDA?
3. Is buyer-only milestone release sufficient, or should seller confirmation be required on-chain?
4. What is the recommended pattern for closing vaults after `approve_refund` without breaking composability?
5. Are permissionless `migrate_*` instructions acceptable, or should migration be authority-gated?
6. Should legacy `refund` be removed before mainnet?
7. Review plan for upgrade authority — multisig, timelock, or immutable deployment?
8. Is 30-day `buyer_timeout_refund` appropriate for seller protection?
9. How should on-chain `Reputation` / `Disputed` align with off-chain Supabase state?
10. Any fee rounding / dust accumulation risks warranting a sweep instruction?

---

## G. Priority Roadmap

### P0 — Block mainnet / external audit kickoff

| # | Action | Finding |
|---|--------|---------|
| 1 | Require `config` account on `create_deal` when config PDA exists (eliminate fee bypass) | C-1 |
| 2 | Add checked milestone sum arithmetic | H-3 |
| 3 | Constrain mint to canonical USDC (cluster-feature-gated) | H-1 |
| 4 | Reject `buyer == seller` | H-2 |
| 5 | Complete Anchor integration tests for all 17 instructions | F |
| 6 | Execute devnet migration test per `TIERING_DEVNET_TEST.md` | E |

### P1 — Before mainnet launch

| # | Action | Finding |
|---|--------|---------|
| 7 | Close vault in `approve_refund` (or enforce documented `close_deal` in SDK) | M-1 |
| 8 | Add vault `mint` constraints on all token paths | M-3 |
| 9 | Use `checked_add` for `funded_amount` / `released_amount` | M-5 |
| 10 | Add Anchor events for indexers | E |
| 11 | Install QEDGen + author `.qedspec` for top invariants | D |
| 12 | Document upgrade authority + multisig | E |

### P2 — Hardening / post-audit

| # | Action | Finding |
|---|--------|---------|
| 13 | Signer-prove `creator_wallet` when reputation ships | M-2 |
| 14 | Implement or remove `Disputed` / `Reputation` | L-1 |
| 15 | Deprecate legacy `refund` instruction | M-4 |
| 16 | Add dedicated error codes for migrate validation | L-2 |
| 17 | Dust sweep or treasury absorption for rounding residue | L-3 |

### P3 — Nice-to-have

| # | Action | Finding |
|---|--------|---------|
| 18 | Allow seller rent reclamation on `close_deal` | L-4 |
| 19 | `cargo audit` / Semgrep in CI | F |
| 20 | Formal verification via QEDGen property suite | D |

---

*End of report. No files were modified. Suggested audit baseline: commit `20547e5` on branch `security_audit`.*

[REDACTED]
# Escrow Program Security Audit: Signers & Account Constraints

Read-only review of all 17 instructions in `lib.rs`, every file under `instructions/`, plus `state.rs` and `error.rs`.

---

## Executive Summary

| Severity | Count | Theme |
|----------|-------|-------|
| **CRITICAL** | 0 | No direct fund-theft path found in normal deal lifecycle |
| **HIGH** | 1 | Fee evasion via omitting optional `config` on `create_deal` |
| **MEDIUM** | 5 | Missing defense-in-depth constraints; griefing / platform risk |
| **LOW** | 6 | Error-code hygiene, admin footguns, style gaps |

**Overall:** Fund-moving instructions correctly pin vault address, buyer/seller token owners, and mint. CPI PDA signing implicitly forces the passed `deal` account key to match `PDA(["deal", deal_id], bump)`, even where seeds are not re-declared in account structs. The main exploitable economic gap is **optional config** allowing permanently fee-free deals after config is live.

---

## Per-Instruction Matrix

| Instruction | Required signers | Signer enforcement | Account constraints | Gaps |
|-------------|------------------|--------------------|---------------------|------|
| **init_config** | Deployer (`authority`) | `Signer<'info>` | Config PDA `seeds = [b"config"]`, `init` | **MEDIUM:** First-caller-wins authority if not initialized atomically at deploy |
| **set_fee** | Config `authority` | `Signer` + `has_one = authority` | Config PDA seeds + bump | None material |
| **set_treasury** | Config `authority` | `Signer` + `has_one = authority` | Config PDA seeds + bump | **LOW:** No on-chain check that `treasury` owns a valid token ATA |
| **set_authority** | Config `authority` | `Signer` + `has_one = authority` | Config PDA seeds + bump | None material |
| **set_tiers** | Config `authority` | `Signer` + `has_one = authority` | Config PDA; handler caps rates & dedupes ids | None material |
| **set_user_tier** | Config `authority` | `Signer` + `has_one = authority` | Config PDA; UserTier PDA `seeds = [b"tier", wallet]` | None material |
| **clear_user_tier** | Config `authority` | `Signer` + `has_one = authority` | UserTier PDA seeds + bump; `close = authority` | **LOW:** No explicit `user_tier.wallet == wallet` (seeds bind address) |
| **create_deal** | Buyer only | Buyer `Signer`; seller **does not sign** | Deal PDA + vault PDA inits; vault `token::mint`, `token::authority = deal`; optional Config/Tier PDAs | **MEDIUM:** Seller `UncheckedAccount`; **HIGH:** optional `config` → fee evasion; **MEDIUM:** `creator_wallet` asserted not signed |
| **fund_escrow** | Buyer | `Signer` + `has_one = buyer` | Vault `address = deal.escrow_token_account`; buyer ATA owner+mint | **MEDIUM:** No vault `mint`/authority constraints; treasury validated in handler only |
| **migrate_deal** | Any payer | Payer `Signer` | Deal PDA seeds; manual owner + discriminator check | **LOW:** `UncheckedAccount` — adequately hand-validated; wrong error variant for bad owner |
| **migrate_config** | Any payer | Payer `Signer` | Config PDA seeds; manual owner + discriminator check | **LOW:** Same as migrate_deal |
| **release_milestone** | Buyer | `Signer` + `has_one = buyer` | Vault pinned; seller ATA `owner == deal.seller`, `mint == deal.mint` | **MEDIUM:** No vault mint/authority constraints; treasury handler-only |
| **refund** (legacy) | Buyer **and** seller | Both `Signer` + `has_one` each | Vault pinned; buyer ATA owner+mint | **MEDIUM:** No deal PDA seeds / vault mint constraints (CPI mitigates) |
| **approve_refund** | Buyer **or** seller | Generic `Signer`; party check **in handler** | Vault pinned; buyer ATA tied to `deal.buyer` + mint | **LOW:** Handler auth sufficient; wrong error for seller; no vault mint/authority |
| **cancel_deal** | Buyer | `Signer` + `has_one = buyer` | Status `Created`; vault pinned; buyer ATA owner+mint | **MEDIUM:** Missing vault mint/authority constraints |
| **buyer_timeout_refund** | Buyer | `Signer` + `has_one = buyer` | Status Funded/InProgress; 30-day handler check; vault pinned | Design: unilateral buyer power after timeout (intentional) |
| **close_deal** | Buyer | `Signer` + `has_one = buyer` | Status Completed/Refunded; vault pinned | **LOW:** Relies on token program to reject close with nonzero balance |

---

## Targeted Hunt Results

### 1. Missing `is_signer` / `Signer<'info>` on privileged ops

All privileged paths require signers:

- Admin: `UpdateConfig`, `SetUserTier`, `ClearUserTier` → `authority: Signer` + `has_one`
- Buyer-only: fund, release, cancel, timeout, close → `buyer: Signer` + `has_one`
- Mutual refund (legacy): both signers
- `approve_refund`: `signer: Signer` + handler party gate before state change or transfer
- Migrations: permissionless resize only; payer signs for rent

**No missing signer on fund-moving privileged ops.**

### 2. `UncheckedAccount` (create_deal seller, migrate paths)

**create_deal seller** — intentional, documented:

```13:14:programs/escrow/src/instructions/create_deal.rs
    /// CHECK: Seller wallet, validated by the buyer
    pub seller: UncheckedAccount<'info>,
```

Safe for funds: seller receives nothing without buyer signing `release_milestone`. Risk is **griefing** (buyer names arbitrary seller) and **no seller consent at creation** — acceptable for one-sided-initiated escrow.

**migrate_deal / migrate_config** — safe:

```38:46:programs/escrow/src/instructions/migrate_deal.rs
    /// CHECK: intentionally a raw account, not Account<Deal> — an old Deal is
    /// too short to deserialize, which is the whole reason we're here. Validated
    /// by hand: PDA seeds, program ownership, and the Deal discriminator.
    #[account(
        mut,
        seeds = [b"deal", deal_id.as_bytes()],
        bump,
    )]
    pub deal: UncheckedAccount<'info>,
```

Hand checks: program owner, discriminator, idempotent resize-only. Cannot change terms or move tokens.

### 3. `approve_refund`: handler check vs `has_one`

```56:63:programs/escrow/src/instructions/approve_refund.rs
    if signer_key == deal.buyer {
        deal.buyer_refund_ok = true;
    } else if signer_key == deal.seller {
        deal.seller_refund_ok = true;
    } else {
        return err!(EscrowError::UnauthorizedBuyer);
    }
```

**Sufficient for authorization** — runs before any transfer; third parties cannot approve. Refund destination is constrained to `deal.buyer`'s ATA, not the signer's. Minor issues only: wrong error for seller (`UnauthorizedBuyer`), no `has_one` at account level (style).

### 4. `create_deal`: buyer signs, seller doesn't

**Intentional.** Seller identity is recorded; seller must deliver and buyer must sign each release. Documented trust boundary for `creator_wallet` (pricing only):

```74:81:programs/escrow/src/instructions/create_deal.rs
    // TRUST BOUNDARY: only `buyer` signs create_deal, so `creator_wallet` is
    // ASSERTED by the buyer, not proven. This is safe for pricing because the
    // creator's discount lands on the creator's OWN side...
    // If `creator` ever gains meaning beyond fee-side
    // selection (e.g. reputation credit), it must become signer-proven.
```

### 5. Optional config / tier accounts

| Account | Impact |
|---------|--------|
| `config: Option<Account<Config>>` | **HIGH:** If live config exists, buyer can pass `None` → deal permanently fee-free (`fee_bps = 0`, `treasury = default`) |
| `creator_tier: Option<Account<UserTier>>` | Self-harm only (miss discount); seeds bind to `creator_wallet` when provided |

Tier PDA binding when present:

```49:53:programs/escrow/src/instructions/create_deal.rs
    #[account(
        seeds = [b"tier", creator_wallet.as_ref()],
        bump = creator_tier.bump,
    )]
    pub creator_tier: Option<Account<'info, UserTier>>,
```

### 6. Token account substitution

| Path | Vault | Recipient ATA | Mint |
|------|-------|---------------|------|
| fund_escrow | `address = deal.escrow_token_account` ✓ | buyer owner + mint ✓ | buyer ATA mint = deal.mint ✓ |
| release_milestone | pinned ✓ | seller owner = deal.seller ✓ | ✓ |
| refund / approve_refund / cancel / timeout | pinned ✓ | buyer owner = deal.buyer ✓ | ✓ |

**Gap:** Post-create instructions never re-assert `token::mint = deal.mint` or `token::authority = deal` on vault (only set at init in `create_deal`). Substitution at same address is impossible; wrong vault authority causes CPI failure. **MEDIUM** defense-in-depth only.

Wrong pubkey **cannot** receive escrow funds except:

- `release_milestone` → only `deal.seller` ATA (constrained)
- Refunds → only `deal.buyer` ATA (constrained)
- Fees → `deal.treasury` + `deal.mint` (handler-validated)

### 7. Treasury optional validation when fees active

Handler validation is **correct but not account-level**:

```69:73:programs/escrow/src/instructions/fund_escrow.rs
            require!(
                treasury_ta.owner == deal.treasury && treasury_ta.mint == deal.mint,
                EscrowError::TreasuryAccountRequired
            );
```

Same pattern in `release_milestone` (lines 82–85). Attacker cannot redirect fees to arbitrary wallet if handler runs; recommend moving to account constraints for Anchor consistency and audit clarity.

### 8. Wrong pubkey receiving funds

No instruction allows arbitrary recipient for escrow outflows. All outflows pin owner to `deal.buyer` or `deal.seller` or snapshotted `deal.treasury`.

---

## Top Findings with Fixes

### HIGH-1: Fee evasion via optional `config` on `create_deal`

When platform config is live and fee-active, buyer can omit the config account and get a permanently fee-free deal.

```128:186:programs/escrow/src/instructions/create_deal.rs
    match &ctx.accounts.config {
        Some(config) if config.fee_active() => {
            deal.fee_bps = config.fee_bps;
            deal.treasury = config.treasury;
            // ...
        }
        _ => {
            deal.fee_bps = 0;
            deal.treasury = Pubkey::default();
            // ...
        }
    }
```

**Recommended fix** — require config PDA when initialized (or always pass it; fail if fee-active and missing):

```rust
// Option A: always require config account (simplest)
pub config: Account<'info, Config>,  // seeds = [b"config"], bump = config.bump

// Option B: keep Option but reject fee evasion in handler
let config_info = ctx.accounts.config.as_ref();
if config_info.is_none() {
    // Try loading config PDA — if exists and fee_active(), fail
    require!(/* config not initialized OR not fee_active */, EscrowError::ConfigRequired);
}
```

---

### MEDIUM-1: Missing vault `mint` / `authority` on fund-moving instructions

Only `create_deal` sets token constraints on vault:

```28:35:programs/escrow/src/instructions/create_deal.rs
    #[account(
        init,
        payer = buyer,
        token::mint = mint,
        token::authority = deal,
        seeds = [b"escrow-vault", deal_id.as_bytes()],
        bump,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,
```

**Recommended fix** (apply to `FundEscrow`, `ReleaseMilestone`, `Refund`, `ApproveRefund`, `CancelDeal`, `BuyerTimeoutRefund`, `CloseDeal`):

```rust
#[account(
    mut,
    address = deal.escrow_token_account,
    constraint = escrow_token_account.mint == deal.mint @ EscrowError::InvalidDealStatus,
    constraint = escrow_token_account.owner == deal.key() @ EscrowError::InvalidDealStatus,
)]
pub escrow_token_account: Account<'info, TokenAccount>,
```

---

### MEDIUM-2: Missing deal PDA seed re-validation (post-create)

`create_deal` and `migrate_deal` enforce deal PDA seeds; fund/release/refund paths do not. CPI signing mitigates (wrong key → PDA seed mismatch → transfer fails), but explicit constraints improve safety and errors:

```rust
#[account(
    mut,
    seeds = [b"deal", deal.deal_id.as_bytes()],
    bump = deal.bump,
    has_one = buyer @ EscrowError::UnauthorizedBuyer,
)]
pub deal: Account<'info, Deal>,
```

---

### MEDIUM-3: `init_config` first-caller-wins

```17:24:programs/escrow/src/instructions/config.rs
    #[account(
        init,
        payer = authority,
        space = 8 + Config::INIT_SPACE,
        seeds = [b"config"],
        bump,
    )]
    pub config: Account<'info, Config>,
```

Anyone can become authority if they call before the deployer. **Ops fix:** initialize in same deploy tx / before program is public. Optional code hardening: dedicated deploy key or init guarded by program upgrade authority.

---

### MEDIUM-4: Seller `UncheckedAccount` griefing

Buyer can assign any seller pubkey without consent. Not a fund theft vector; consider off-chain invite flow or future `seller: Signer` variant for consent-gated deals.

---

### LOW-1: `approve_refund` uses `UnauthorizedBuyer` for non-parties

Use a neutral error (e.g. `UnauthorizedParty`) or branch `UnauthorizedSeller` when appropriate.

---

### LOW-2: `migrate_*` uses `InvalidCreator` for wrong program owner

```57:57:programs/escrow/src/instructions/migrate_deal.rs
    require!(info.owner == ctx.program_id, EscrowError::InvalidCreator);
```

Misleading; add `InvalidAccountOwner` or reuse `AccountDidNotDeserialize`.

---

## Quick Checklist

| Status | Instructions |
|--------|--------------|
| **PASS** (signer + checker review) | `set_fee`, `set_authority`, `set_tiers`, `set_user_tier`, `clear_user_tier`, `refund`, `migrate_deal`, `migrate_config` |
| **PASS with design notes** | `approve_refund` (handler auth OK), `buyer_timeout_refund` (unilateral by design), `close_deal` |
| **NEED FIX / HARDEN** | `init_config` (deploy ordering), `set_treasury` (LOW), **`create_deal`** (optional config HIGH), `fund_escrow`, `release_milestone`, `cancel_deal` (vault/deal constraints MEDIUM) |

---

## Bottom Line

The program’s **fund safety model is sound**: escrow outflows require buyer authorization (or mutual approval / timeout), recipient token accounts are tied to `deal.buyer` / `deal.seller`, vault address is pinned, and treasury destinations are checked against snapshotted `deal.treasury` + `deal.mint` before fee transfers.

Priority hardening:

1. **Require config when fee-active** (`create_deal`) — only clear economic exploit found.
2. Add **vault mint + authority** and **deal PDA** constraints on all token-touching instructions.
3. Move **treasury validation** from handler-only to account constraints.
4. Treat **init_config** as deploy-critical (atomic initialization).

[REDACTED]
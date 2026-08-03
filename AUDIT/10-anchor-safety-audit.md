# Sealed Escrow — Anchor Core Safety Guarantees Audit

**Scope:** `/Users/macbook/sealed-nine/programs/escrow/src/` (17 instructions)  
**Cross-ref:** [AUDIT/02-signer-checker-audit.md](02-signer-checker-audit.md), [AUDIT/04-sea-level-attack-audit.md](04-sea-level-attack-audit.md), subagent 489ed616 (UncheckedAccount — complete), subagent c3732254 (Anchor checklist — complete)  
**Mode:** Read-only

---

## 1. Executive Summary — Category Scores

| Anchor safety category | Score | One-line verdict |
|------------------------|-------|------------------|
| **1. Account confusion** | **OK** | Typed `Account<T>` everywhere fund-moving; 3 justified `UncheckedAccount`s; `Program<'info, Token>` on all CPI paths |
| **2. Account types** | **PARTIAL** | Strong typing on token/deal/config paths; barebones on seller pubkey, optional treasury, optional config |
| **3. Account addresses** | **PARTIAL** | Vault pinned + PDA inits correct; post-create deal PDA seeds not re-validated; optional config omission is an address-binding bypass |
| **4. Account liveness** | **PARTIAL** | `init`/`close` used well; `approve_refund` leaves vault open; no explicit zero-balance pre-check on `close_deal` |
| **5. Ownership** | **PARTIAL** | Party ATAs + vault init authority correct; vault mint/SPL-authority not re-checked; treasury owner handler-only |
| **6. Missing account constraints** | **GAP** | Systematic pattern: vault mint/authority, deal PDA seeds, treasury ATA, optional config — all thinner than handler logic |

**Fund-safety bottom line:** No path found where a wrong account *type* at a constrained slot drains escrow. The exploitable economic gap is **optional `config` omission** (fee bypass), not vault substitution. Barebones regressions are mostly **defense-in-depth** and **policy**, not direct theft — assuming normal `create_deal` flow.

---

## 2. Category-by-Category Analysis

### 1. Account confusion

**Question:** Does every account have a distinct typed discriminator? Can wrong types be substituted?

| Account family | Typing | Discriminator | Substitution risk |
|----------------|--------|---------------|-------------------|
| `Deal`, `Config`, `UserTier` | `Account<'info, T>` | 8-byte Anchor (`#[account]`) | None at typed slots |
| `TokenAccount`, `Mint` | `Account<'info, TokenAccount/Mint>` | SPL layout + Anchor owner check | None vs `Deal` |
| `seller` | `UncheckedAccount` | None | Pubkey-only; not confused with token accounts |
| `migrate_*` targets | `UncheckedAccount` | Manual `Deal::DISCRIMINATOR` / `Config::DISCRIMINATOR` | Blocked at `programs/escrow/src/instructions/migrate_deal.rs:61-64` |
| `token_program` | `Program<'info, Token>` | Program ID | Fake token program blocked |

**Slots where wrong type could theoretically be passed:**

- **`seller: UncheckedAccount`** — any account/pubkey accepted; only a pubkey is stored (`create_deal.rs:13-14`). Not a type-confusion attack — seller is not deserialized as another struct.
- **`config: Option<Account<Config>>`** — attacker passes `None` instead of real Config; Anchor never deserializes Config. This is **optional-account omission**, not passing a Deal where Config is expected (`create_deal.rs:38-42`).
- **Fund paths** — `deal: Account<Deal>` cannot be passed as `TokenAccount`; struct fields are distinct in every `#[derive(Accounts)]`.

**`Program<'info, Token>` vs fake program ID:** Present on all 7 token-touching instructions, e.g. `create_deal.rs:55`, `fund_escrow.rs:37`.

**Verdict: OK** — Anchor's discriminator model is used correctly on all deserialized accounts. The 3 `UncheckedAccount`s are intentional and documented.

---

### 2. Account types

**Full map (17 instructions):**

| Instruction | Typed `Account<T>` | `Signer` | `Program<T>` | `Option<Account<T>>` | `UncheckedAccount` | `Sysvar` |
|-------------|-------------------|----------|--------------|------------------------|--------------------|----------|
| `init_config` | Config | authority | System | — | — | — |
| `set_*` (config) | Config | authority | — | — | — | — |
| `set_user_tier` | Config, UserTier | authority | System | — | — | — |
| `clear_user_tier` | Config, UserTier | authority | — | — | — | — |
| `create_deal` | Deal, Mint, TokenAccount | buyer | Token, System | Config, UserTier | **seller** | Rent |
| `fund_escrow` | Deal, TokenAccount×2 | buyer | Token | treasury | — | — |
| `release_milestone` | Deal, TokenAccount×2 | buyer | Token | treasury | — | — |
| `refund` | Deal, TokenAccount×2 | buyer, seller | Token | — | — | — |
| `approve_refund` | Deal, TokenAccount×2 | signer | Token | — | — | — |
| `cancel_deal` | Deal, TokenAccount×2 | buyer | Token | — | — | — |
| `buyer_timeout_refund` | Deal, TokenAccount×2 | buyer | Token | — | — | — |
| `close_deal` | Deal, TokenAccount | buyer | Token | — | — | — |
| `migrate_deal` | — | payer | System | — | **deal** | — |
| `migrate_config` | — | payer | System | — | **config** | — |

**Correctly typed (highlights):**

- All fund-moving paths use `Account<TokenAccount>` for vault and party ATAs — not raw `AccountInfo`.
- Admin mutators use `Account<Config>` + `has_one = authority`.
- Zero raw `AccountInfo` struct fields (489ed616 confirmed).

**`UncheckedAccount` — justified vs unnecessary:**

| Location | Justified? | Why |
|----------|------------|-----|
| `create_deal::seller` (`create_deal.rs:13-14`) | **Yes (by design)** | Seller does not sign at creation; payout pinned at `release_milestone` |
| `migrate_deal::deal` (`migrate_deal.rs:38-46`) | **Yes (required)** | Old Deal too short to deserialize; hand-validated discriminator + PDA |
| `migrate_config::config` (`migrate_config.rs:32-40`) | **Yes (required)** | Same resize pattern |

**Barebones regressions (typed but thin):**

- `treasury_token_account: Option<Account<TokenAccount>>` — typed but only `mut` in constraints (`fund_escrow.rs:34-35`); validation deferred to handler.
- `config: Option<Account<Config>>` — typed when present, but `None` is a barebones escape hatch (`create_deal.rs:41-42`).
- `mint: Account<Mint>` — typed but no cluster/mint-address constraint (`create_deal.rs:26`).

**Verdict: PARTIAL** — No raw AccountInfo abuse; optional accounts and seller pubkey are the main barebones patterns.

---

### 3. Account addresses

**PDA seed validation:**

| PDA | Seeds | Where enforced |
|-----|-------|----------------|
| Deal | `[b"deal", deal_id]` | `create_deal` init, `migrate_deal` |
| Vault | `[b"escrow-vault", deal_id]` | `create_deal` init |
| Config | `[b"config"]` | `init_config`, all config mutators, optional in `create_deal` |
| UserTier | `[b"tier", wallet]` | `set_user_tier`, `clear_user_tier`, optional `creator_tier` |

**Vault address pinning (all 7 token paths):**

```rust
// fund_escrow.rs:19-22
#[account(
    mut,
    address = deal.escrow_token_account,
)]
```

Same pattern in `release_milestone.rs:19-22`, `refund.rs:24-27`, `approve_refund.rs:34-37`, `cancel_deal.rs:20-23`, `buyer_timeout_refund.rs:22-25`, `close_deal.rs:20-23`.

**Wrong-address substitution attacks:**

| Attack | Blocked? | Mechanism |
|--------|----------|-----------|
| Pass attacker ATA as vault | **Yes** | `address = deal.escrow_token_account` |
| Pass wrong deal PDA | **Partially** | No `seeds` re-check post-create; CPI PDA signing fails if `deal.bump`/`deal_id` wrong |
| Pass wrong seller/buyer ATA | **Yes** | `owner == deal.seller/buyer`, `mint == deal.mint` |
| Omit config PDA when live | **No** | `Option` allows `None` → fee-free snapshot forever (`create_deal.rs:179-185`) |
| Pass another wallet's tier PDA | **Yes** | Seeds bind to `creator_wallet (`create_deal.rs:49-52`) |

**`has_one` usage:**

| Field | Instructions |
|-------|--------------|
| `has_one = buyer` | fund, release, cancel, timeout, close, refund |
| `has_one = seller` | refund only |
| `has_one = authority` | all config + tier admin ops (`config.rs:51`) |

**Missing:** `approve_refund` uses generic `signer` + handler party check — no `has_one` (`approve_refund.rs:27-31`). Functionally sufficient; style gap.

**Verdict: PARTIAL** — Vault and party bindings are strong; deal PDA re-validation and mandatory config are gaps.

---

### 4. Account liveness

**Lifecycle primitives:**

| Primitive | Usage | Examples |
|-----------|-------|----------|
| `init` | Deal, vault, Config | `create_deal.rs:17-21`, `config.rs:18-23` |
| `init_if_needed` | UserTier | `tier.rs:37-43` |
| `close` | Deal → buyer; UserTier → authority | `cancel_deal.rs:16`, `tier.rs:87` |
| `mut` | All state-changing accounts | Throughout |

**Can dead/closed accounts be passed?**

- **Closed Deal:** Subsequent instructions fail at `Account<Deal>` deserialize — Anchor rejects closed accounts when `close` was used in same program.
- **Closed vault:** `cancel_deal` and `buyer_timeout_refund` close vault via SPL `close_account`; `close_deal` also closes vault (`close_deal.rs:37-47`).
- **`approve_refund` gap:** Sets `DealStatus::Refunded` but does **not** close vault or deal (`approve_refund.rs:96-102`). Vault remains open until separate `close_deal` — rent leak, not theft (roadmap P1 #18).

**Zero balance enforcement:**

- SPL `close_account` rejects nonzero balance — relied on in `cancel_deal`, `buyer_timeout_refund`, `close_deal`.
- No explicit `require!(escrow_token_account.amount == 0)` before close — **donation grief**: third party can transfer dust to vault, blocking `close_deal` (LOW; c3732254 noted).

**Deal status gates before mutations:**

| Instruction | Status gate |
|-------------|-------------|
| `fund_escrow` | `Created \| Funded` |
| `release_milestone` | `Funded \| InProgress` |
| `cancel_deal` | `Created` only |
| `close_deal` | `Completed \| Refunded` |
| `buyer_timeout_refund` | `Funded \| InProgress` + 30-day |
| `approve_refund` | Not Completed/Refunded only — **allows Created** |

**Verdict: PARTIAL** — Init/close patterns are sound; `approve_refund` incomplete lifecycle and missing explicit zero-balance assert are gaps.

---

### 5. Ownership

**SPL token account owners (authority field):**

| Account | Expected SPL authority / owner | How validated |
|---------|-------------------------------|---------------|
| Vault at init | Deal PDA | `token::authority = deal` (`create_deal.rs:32`) |
| Vault post-create | Deal PDA | **Not re-validated** — only address pin |
| Buyer ATA | Buyer wallet | `owner == buyer` (`fund_escrow.rs:27`) |
| Seller ATA | `deal.seller` | `owner == deal.seller` (`release_milestone.rs:27`) |
| Treasury ATA | `deal.treasury` | Handler only (`fund_escrow.rs:70-73`) |

**Program-owned accounts:**

| Account | Owner | Validation |
|---------|-------|------------|
| Deal PDA | Escrow program | `init` + seeds; migrate checks `info.owner == program_id` |
| Config PDA | Escrow program | Same |
| UserTier PDA | Escrow program | `init_if_needed` + seeds |

**Mint owner checks:**

- `Account<Mint>` ensures Token-program-owned mint account (`create_deal.rs:26`).
- No canonical USDC address constraint — any mint accepted (roadmap P1 #12).

**Handler-only vs constraint ownership:**

| Check | Constraint | Handler |
|-------|------------|---------|
| Treasury ATA owner+mint | — | `fund_escrow.rs:70-73` |
| Vault SPL authority | At init only | CPI implicit |
| `approve_refund` party | — | `approve_refund.rs:56-63` |
| Migrate program owner | — | `migrate_deal.rs:57` |

**Verdict: PARTIAL** — Party ATA ownership is constraint-enforced; vault SPL authority and treasury ownership fall back to barebones handler/CPI reliance.

---

### 6. Missing account constraints

**Every slot where `#[account(...)]` is thinner than handler checks:**

| Instruction | Account | Current constraint | Handler does | Promote-to-constraint |
|-------------|---------|-------------------|--------------|----------------------|
| **All 7 token paths** | `escrow_token_account` | `address = deal.escrow_token_account` | PDA CPI signing | See snippet A below |
| **fund, release, refund, approve, cancel, timeout, close** | `deal` | `has_one`, status | PDA seeds in CPI | See snippet B below |
| **fund_escrow, release_milestone** | `treasury_token_account` | `mut` only | owner+mint check | See snippet C below |
| **create_deal** | `config` | Optional + seeds when Some | Fee snapshot | See snippet D below |
| **create_deal** | `mint` | `Account<Mint>` only | Stores pubkey | See snippet E below |
| **approve_refund** | `signer` | `Signer` only | buyer/seller match | See snippet F below |
| **set_treasury** | treasury (arg) | None | Stores pubkey | Admin trust — LOW |

**Recommended Rust snippets:**

```rust
// A — vault (all 7 token-touching instructions)
#[account(
    mut,
    address = deal.escrow_token_account,
    constraint = escrow_token_account.mint == deal.mint @ EscrowError::InvalidDealStatus,
    constraint = escrow_token_account.owner == deal.key() @ EscrowError::InvalidDealStatus,
)]
pub escrow_token_account: Account<'info, TokenAccount>,

// B — deal PDA re-validation (post-create instructions)
#[account(
    mut,
    seeds = [b"deal", deal.deal_id.as_bytes()],
    bump = deal.bump,
    has_one = buyer @ EscrowError::UnauthorizedBuyer,
    // ... existing status constraints
)]
pub deal: Account<'info, Deal>,

// C — treasury ATA (fund_escrow / release_milestone)
#[account(
    mut,
    constraint = treasury_token_account.as_ref().map_or(true, |t|
        t.owner == deal.treasury && t.mint == deal.mint
    ) @ EscrowError::TreasuryAccountRequired,
)]
pub treasury_token_account: Option<Account<'info, TokenAccount>>,

// D — config when fee-active (create_deal)
pub config: Account<'info, Config>,  // seeds = [b"config"], bump = config.bump
// OR in handler when keeping Option:
require!(
    ctx.accounts.config.is_some() || !/* config PDA exists and fee_active */,
    EscrowError::ConfigRequired
);

// E — canonical mint (cluster-gated)
#[account(
    constraint = mint.key() == USDC_MINT @ EscrowError::InvalidMint,
)]
pub mint: Account<'info, Mint>,

// F — approve_refund party (optional style improvement)
constraint = signer.key() == deal.buyer || signer.key() == deal.seller
    @ EscrowError::UnauthorizedParty,
```

**Optional config — the highest-impact missing constraint:**

```rust
// create_deal.rs:128-186
match &ctx.accounts.config {
    Some(config) if config.fee_active() => { /* snapshot fees */ }
    _ => {
        deal.fee_bps = 0;
        deal.treasury = Pubkey::default();
        // ...
    }
}
```

When live config exists but account is omitted, Anchor never validates the Config PDA — barebones Solana "pass the accounts you want" pattern.

---

## 3. Anchor Done Right (8 examples)

1. **Vault init with full SPL constraints** — `create_deal.rs:28-35`: PDA seeds + `token::mint` + `token::authority = deal`.

2. **`Program<'info, Token>` on every CPI** — blocks fake token-program redirection (e.g. `fund_escrow.rs:37`).

3. **Vault address pinning on all outflows** — `address = deal.escrow_token_account` on 7 instructions.

4. **Party ATA binding** — seller payout only to `deal.seller` + `deal.mint` (`release_milestone.rs:25-29`).

5. **Admin `has_one = authority`** — `config.rs:47-52` on every config mutation.

6. **PDA CPI signing** — consistent `[b"deal", deal_id, bump]` with stored `deal.bump` (`release_milestone.rs:60-61`).

7. **Migration without type confusion** — raw account + manual discriminator when deserialize would fail (`migrate_deal.rs:57-64`).

8. **Fee math in `state.rs`** — u128 `checked_mul`/`checked_div` in `half_fee`/`side_fee` (`state.rs:103-115`).

---

## 4. Barebones Regressions

| Pattern | Where | Risk |
|---------|-------|------|
| Optional `config` → permanent fee-free | `create_deal.rs:38-42, 179-185` | **HIGH** (platform revenue) |
| Vault mint/authority not re-checked | 7 token instructions | **MEDIUM** (CPI fails; defense gap) |
| Deal PDA seeds omitted post-create | fund/release/refund/etc. | **MEDIUM** (CPI mitigates) |
| Treasury validation handler-only | `fund_escrow.rs:70-73`, `release_milestone.rs:82-85` | **LOW** (correct at CPI time) |
| Seller as `UncheckedAccount` | `create_deal.rs:14` | **LOW** (griefing, not theft) |
| `approve_refund` handler party auth | `approve_refund.rs:56-63` | **LOW** (works; not declarative) |
| Unchecked milestone sum | `create_deal.rs:87` | **MEDIUM** (state corruption) |
| Unchecked `funded_amount +=` | `fund_escrow.rs:89` | **MEDIUM** |
| `approve_refund` no vault/deal close | `approve_refund.rs:96-102` | **LOW** (rent leak) |
| Any mint accepted | `create_deal.rs:26` | **MEDIUM** (policy) |
| `buyer == seller` allowed | `create_deal.rs:95-96` | **MEDIUM** (policy) |
| Dead code: `Reputation`, `Disputed` | `state.rs:161, 179` | **LOW** (no instruction uses them) |

---

## 5. Prioritized Fix List (NEW vs AUDIT/08)

**Already in `08-priority-roadmap.md` (deduped — do not re-prioritize):**

| Roadmap # | Fix |
|-----------|-----|
| P0 #1 | Require config when fee-active |
| P0 #6 | Checked arithmetic (4 sites) |
| P1 #11 | Reject `buyer == seller` |
| P1 #12 | Canonical USDC mint |
| P1 #13 | Vault mint + authority constraints |
| P1 #16 | Sea-level negative tests |
| P1 #18 | Close vault in `approve_refund` |

**NEW to this Anchor-framing audit** (not explicit in 08):

| # | Fix | Anchor category | Location | Severity |
|---|-----|-----------------|----------|----------|
| **N1** | Re-add `seeds + bump` on `deal` in all post-create instructions | Account addresses | 7 token handlers | MEDIUM |
| **N2** | Promote treasury ATA to `#[account(...)]` constraints | Missing constraints / Ownership | `fund_escrow`, `release_milestone` | LOW |
| **N3** | Add `constraint` for `approve_refund` signer party | Account types / Missing constraints | `approve_refund.rs:27` | LOW |
| **N4** | Gate `approve_refund` on `Funded \| InProgress` (block unfunded Created) | Account liveness | `approve_refund.rs:29-30` | LOW (UX) |
| **N5** | Explicit `require!(vault.amount == 0)` before `close_deal` | Account liveness | `close_deal.rs:29` | LOW (donation grief) |
| **N6** | Add `InvalidAccountOwner` for migrate wrong-owner | Account confusion | `migrate_deal.rs:57` | LOW (UX) |

None of N1–N6 are new fund-theft vectors; N1–N2 are the highest-value Anchor hygiene items after roadmap P0/P1.

---

## 6. Subagent Cross-Reference Status

| Subagent | Task | Status |
|----------|------|--------|
| **489ed616** | UncheckedAccount / AccountInfo audit | **Complete** — 3 `UncheckedAccount`, 0 raw `AccountInfo` fields; all sufficient |
| **c3732254** | Anchor checklist (owner/signer/CPI/arithmetic) | **Complete** — 17/17 signer OK; arithmetic gaps at 4 sites; no raw `invoke_signed` |

Both subagent reports align with this audit; no contradictions found.

---

## Summary Table — Anchor vs Barebones by Instruction

| Instruction | Anchor-strong | Barebones fallback |
|-------------|---------------|-------------------|
| `init_config` | PDA init, typed Config | First-caller authority |
| `set_*` | seeds, has_one, typed | set_treasury: no ATA check |
| `set/clear_user_tier` | PDA, has_one, init_if_needed/close | No explicit wallet field constraint on clear |
| `create_deal` | Deal/vault init, Program<Token>, tier seeds | seller Unchecked, config Option, any mint |
| `fund_escrow` | has_one, vault address, buyer ATA | vault mint/auth, treasury handler-only |
| `release_milestone` | Same + seller ATA | Same vault/treasury gaps |
| `refund` | Dual Signer + has_one | vault mint/auth |
| `approve_refund` | Refund dest pinned to deal.buyer | Handler party auth; no close |
| `cancel_deal` | close deal, status gate | vault mint/auth |
| `buyer_timeout_refund` | close deal+vault, timeout | vault mint/auth |
| `close_deal` | terminal status, close deal | vault mint/auth; SPL-only zero check |
| `migrate_*` | PDA + manual discriminator | UncheckedAccount (required) |

The program's **fund safety model holds** because Anchor typing + vault address pinning + party ATA constraints + PDA CPI signing compose correctly. The main work is **closing the gap between what Anchor could enforce declaratively and what the handlers still assert imperatively** — especially config optionality, vault re-validation, and deal PDA seeds.

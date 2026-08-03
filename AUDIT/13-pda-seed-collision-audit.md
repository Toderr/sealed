# PDA Seed Collision & Account Confusion Audit — `programs/escrow/`

**Scope:** `/Users/macbook/sealed-nine/programs/escrow/src/` — all PDA derivations (Deal, Escrow vault, Config, UserTier, Reputation)  
**Mode:** Read-only  
**Cross-ref:** [AUDIT/02-signer-checker-audit.md](02-signer-checker-audit.md), [AUDIT/04-sea-level-attack-audit.md](04-sea-level-attack-audit.md), [AUDIT/01-security-audit-prep-package.md](01-security-audit-prep-package.md) §6-pattern scan  
**Source:** [PDA seed collision audit](aa7839d1-b11a-40a0-bbed-c5f125c9eecc)

---

## Executive verdict: **NOT VULNERABLE**

Sealed is **not vulnerable** to the training-diagram attack (variable string seeds that span account-type boundaries, yielding the same PDA with different deserialized types). Residual issues are **defense-in-depth / hygiene**, not exploitable cross-type PDA collision.

Use **PARTIAL** only if you bucket unrelated hardening (missing post-create seed constraints, `migrate_deal` length parity, unimplemented `Reputation` PDA). For the stated attack class: **NOT VULNERABLE**.

---

## 1. Seed inventory

| Account type | Seeds | Where defined | Seed lengths | Attacker-controlled? |
|---|---|---|---|---|
| **Deal** | `[b"deal", deal_id.as_bytes()]` | ```16:22:programs/escrow/src/instructions/create_deal.rs```, ```41:45:programs/escrow/src/instructions/migrate_deal.rs``` | Prefix fixed 4 B; suffix **0–32 B** variable | `deal_id` (buyer at create; arg at migrate) |
| **Escrow vault** (SPL TokenAccount) | `[b"escrow-vault", deal_id.as_bytes()]` | ```28:35:programs/escrow/src/instructions/create_deal.rs``` | Prefix fixed 12 B; suffix **0–32 B** variable | Same `deal_id` |
| **Config** | `[b"config"]` | ```17:23:programs/escrow/src/instructions/config.rs``` | Single seed, 6 B fixed | None (singleton) |
| **UserTier** | `[b"tier", wallet.as_ref()]` | ```37:43:programs/escrow/src/instructions/tier.rs```, ```49:53:programs/escrow/src/instructions/create_deal.rs``` | Prefix 4 B; suffix **32 B fixed** (Pubkey) | Wallet pubkey (authority-gated for set/clear) |
| **Reputation** | *(not implemented)* | Struct only: ```177:190:programs/escrow/src/state.rs``` | N/A | N/A |

**CPI signer seeds** (Deal PDA as token authority): `[b"deal", deal_id.as_bytes(), &[bump]]` — e.g. ```60:61:programs/escrow/src/instructions/release_milestone.rs```.

**No other PDA derivations** exist under `programs/escrow/src/`.

---

## 2. How Solana hashing relates to the diagram attack

Solana `create_program_address` / `find_program_address` feeds seeds **sequentially** into SHA-256, then appends `program_id` and `"ProgramDerivedAddress"`. Each seed is a **separate segment** in that byte stream (not "one big string the client interprets however they want").

The diagram attack needs a pattern like:

- Type A: `[prefix_a, attacker_string]`
- Type B: `[attacker_string_or_suffix, fixed_pubkey]`

…so that two **different logical tuples** could yield the same address and a program would deserialize the wrong type.

Sealed never uses `deal_id` (or any user string) as the **first** seed without a type-specific prefix. All multi-seed account types start with a **distinct constant** prefix:

| Prefix | Bytes |
|---|---|
| `b"deal"` | 4 |
| `b"escrow-vault"` | 12 |
| `b"tier"` | 4 |
| `b"config"` | 6 (alone) |

Because the hash stream differs at byte 0 for every cross-type pair, **no choice of `deal_id` (≤32 B) or wallet (32 B) can make two different seed tuples collide** without breaking SHA-256.

---

## 3. Collision analysis (logical, not brute force)

### 3.1 Within-type (same account class)

**Deal:** `PDA(["deal", id₁]) = PDA(["deal", id₂])` ⇒ `id₁ == id₂` (identical UTF-8 bytes). Two different deal IDs → two different addresses.

**Vault:** Same logic with `b"escrow-vault"`. Deal and vault for the **same** `deal_id` are **intentionally paired** but **different addresses** (different first seed).

**UserTier:** `[b"tier", wallet]` — wallet is fixed 32 B; collision requires identical wallet.

**Config:** Singleton; only one address.

### 3.2 Seed-boundary / concatenation (diagram scenario)

Diagram pattern:

```
Product:  ["product", "pr"]                    vs  ["product", "youshouldbuythisproductfast"]
Bid:      ["pr", user_address]
```

Sealed has **no** instruction that derives `PDA([deal_id, …])` or `PDA([suffix, pubkey])` without the `b"deal"` / `b"tier"` / etc. prefix. There is no "bid-style" second account type keyed only by a substring of `deal_id`.

Concrete mapping:

| Diagram role | Sealed equivalent | Collision possible? |
|---|---|---|
| `["product", id]` | `["deal", deal_id]` or `["escrow-vault", deal_id]` | No — constant prefix differs across types |
| `["pr", user]` | `["tier", wallet]` (32 B fixed) | No — first seed is `b"tier"`, not user string |
| Attacker-chosen long `id` spanning boundaries | `deal_id` up to 32 chars | No — still preceded by `b"deal"` or `b"escrow-vault"` |

**Example (why `deal_id` cannot bridge types):**

Could `deal_id = "X"` make `["deal", "X"]` equal `["escrow-vault", "Y"]`?

- Stream A: `"deal"` (4) ‖ `X` (0–32)
- Stream B: `"escrow-vault"` (12) ‖ `Y`

Byte 0: `'d'` vs `'e'` → **always differs**. Same argument vs `b"tier"`, `b"config"`.

Could `deal_id = "escrow-vaultfoo"` collide with vault for `deal_id = "foo"`?

- Deal: `"deal"` ‖ `"escrow-vaultfoo"`
- Vault: `"escrow-vault"` ‖ `"foo"`

Byte 0: `'d'` vs `'e'` → **differs**. The variable suffix never "becomes" the type prefix because prefixes are **separate hash segments**, not parsed out of `deal_id`.

### 3.3 Cross-type collision matrix

| Pair | First-seed divergence | Verdict |
|---|---|---|
| Deal ↔ Vault | `b"deal"` vs `b"escrow-vault"` | **Impossible** |
| Deal ↔ Tier | `b"deal"` vs `b"tier"` | **Impossible** |
| Deal ↔ Config | 2-seed vs 1-seed; `'d'` vs `'c'` | **Impossible** |
| Vault ↔ Tier | `'e'` vs `'t'` | **Impossible** |
| Vault ↔ Config | 2-seed vs 1-seed | **Impossible** |
| Tier ↔ Config | 2-seed vs 1-seed; `'t'` vs `'c'` | **Impossible** |

### 3.4 TokenAccount vs program account at same address

Escrow vault is an **SPL Token account** (owner = Token program). Deal is an **Anchor account** (owner = escrow program). One address cannot hold both. Even a hypothetical PDA address clash across owners is moot — **owner + discriminator** partition the namespace.

---

## 4. `deal_id` constraints

| Constraint | Enforced? | Location |
|---|---|---|
| Max length 32 | **Yes** on create | ```67:67:programs/escrow/src/instructions/create_deal.rs``` |
| Max length 32 (storage) | **Yes** (`#[max_len(32)]`) | ```7:8:programs/escrow/src/state.rs``` |
| Min length > 0 | **No** — empty string allowed | Only `len() <= 32` |
| Character set / charset | **No** — any UTF-8 (incl. control bytes) | — |
| Uniqueness | **Implicit** — second `create_deal` with same id fails on `init` | ```16:22:programs/escrow/src/instructions/create_deal.rs``` |
| `migrate_deal` length check | **No** — only PDA seeds bind | ```43:43:programs/escrow/src/instructions/migrate_deal.rs``` |
| Solana `MAX_SEED_LEN` (32 B/seed) | **At limit** for max `deal_id` | Matches create cap |

**Collision relevance:** None. A crafted `deal_id` cannot make `[b"deal", deal_id]` match another type's seed tuple (§3). Empty or weird UTF-8 affects UX/indexing, not PDA collision.

---

## 5. Anchor discriminator mitigation

### 5.1 `Account<T>` paths (normal instructions)

Anchor prepends an **8-byte account discriminator** (`sha256("account:Deal")[..8]`, etc.) and validates on deserialize. Types:

- `Deal` — ```3:79:programs/escrow/src/state.rs```
- `Config` — ```215:239:programs/escrow/src/state.rs```
- `UserTier` — ```267:276:programs/escrow/src/state.rs```

Even in a hypothetical address collision, `Account<'info, Deal>` loading Config bytes would fail `AccountDiscriminatorMismatch` before fund logic runs.

Fund paths use typed accounts without re-stated seeds:

```12:17:programs/escrow/src/instructions/fund_escrow.rs
    #[account(
        mut,
        has_one = buyer @ EscrowError::UnauthorizedBuyer,
        ...
    )]
    pub deal: Account<'info, Deal>,
```

Vault is typed `Account<'info, TokenAccount>` — SPL layout, not Anchor `Deal` layout. Wrong type → deserialize failure.

### 5.2 `migrate_deal` / `migrate_config` (`UncheckedAccount`)

Both deliberately avoid `Account<T>` (old accounts too short to deserialize) and validate manually:

**migrate_deal:**
```57:64:programs/escrow/src/instructions/migrate_deal.rs
    require!(info.owner == ctx.program_id, EscrowError::InvalidCreator);
    {
        let data = info.try_borrow_data()?;
        require!(data.len() >= 8, EscrowError::AccountDidNotDeserialize);
        require!(
            data[..8] == *Deal::DISCRIMINATOR,
            EscrowError::AccountDidNotDeserialize
        );
    }
```

Plus Anchor `seeds = [b"deal", deal_id.as_bytes()]` on the account (```41:45:programs/escrow/src/instructions/migrate_deal.rs```).

**migrate_config:** Same pattern with `Config::DISCRIMINATOR` — ```48:55:programs/escrow/src/instructions/migrate_config.rs```.

**Passing Config at Deal PDA:** fails `ConstraintSeeds` (address ≠ `PDA(["deal", deal_id])`).  
**Passing UserTier at Deal PDA:** fails seeds + discriminator.  
**Passing Deal at Config PDA:** fails `ConstraintSeeds` on `seeds = [b"config"]`.

AUDIT/04 proposed `migrate_deal_wrong_account_discriminator` tests (```567:586:AUDIT/04-sea-level-attack-audit.md```) — controls are correctly designed.

### 5.3 CPI signing as secondary binding

Post-create paths sign with stored `deal.deal_id` + `deal.bump` (```60:61:programs/escrow/src/instructions/release_milestone.rs```). If a client passed a `Deal` account whose **pubkey ≠ PDA(deal.deal_id, bump)**, CPI `invoke_signed` fails even without explicit `seeds=` on the account struct (noted in AUDIT/02 MEDIUM-2).

---

## 6. Comparison to diagram attack

| Diagram requirement | Sealed status |
|---|---|
| Variable-length user string as **first** seed on one account type | **Absent** — always prefixed |
| Second account type keyed by substring of that string | **Absent** — no `[deal_id, party]` pattern |
| No discriminator / unchecked deserialize | **Absent** on fund paths; migrate paths check discriminator |
| Attacker creates "long name" to span boundaries | **Ineffective** — prefixes are separate seeds |

**Concrete scenario (diagram-style):** Attacker creates deal with `deal_id = "youshouldbuythisproductfast"`. Legitimate deal uses `deal_id = "pr"`. Attacker tries to pass Tier PDA or Config as Deal.

- Tier PDA = `PDA(["tier", wallet])` — first seed `b"tier"` ≠ `b"deal"` → different address.
- Config PDA = `PDA(["config"])` — different address.
- Vault for `"pr"` ≠ Deal for `"youshouldbuythisproductfast"`.

**Not vulnerable because:** distinct type prefixes + per-seed hashing + Anchor discriminators + separate program owners for Deal vs TokenAccount.

---

## 7. Recommendations (hardening, not collision fixes)

| Priority | Recommendation | Rationale |
|---|---|---|
| **P2** | Add `seeds = [b"deal", deal.deal_id.as_bytes()], bump = deal.bump` on `deal` in fund/release/refund/close | AUDIT/02 MEDIUM-2; clearer errors, defense-in-depth |
| **P2** | `require!(deal_id.len() <= 32)` in `migrate_deal` handler | Parity with create; avoid client confusion |
| **P3** | `require!(!deal_id.is_empty())` + optional charset allowlist (e.g. `[A-Za-z0-9_-]`) | Indexing/UX; not security-critical for PDAs |
| **P3** | Vault constraints: `escrow_token_account.mint == deal.mint`, authority == deal key | AUDIT/03 M-4, AUDIT/04 F-06 |
| **P1 (future)** | If wiring `Reputation`, use `[b"reputation", wallet.as_ref()]` — **never** `[wallet, …]` or `[deal_id, …]` without prefix | Prevent regression into diagram-vulnerable pattern |
| **P1 (future)** | Document in code that `deal_id` must stay a **second** seed only, never first | Guardrail for future contributors |

No new P0/P1 roadmap items — existing P2 items (N1/N5 in roadmap) cover defense-in-depth gaps.

---

## 8. New findings vs AUDIT/02 and AUDIT/04

| Finding | AUDIT/02 | AUDIT/04 | This analysis |
|---|---|---|---|
| PDA seeds canonical / pass | ✅ Listed per instruction | ✅ "PDA seeds on deal, vault, config, tier" | ✅ Confirmed + **formal cross-type impossibility proof** |
| Diagram / seed-boundary collision | Not analyzed | Not analyzed | **NEW: explicit NOT VULNERABLE verdict** |
| Missing deal PDA seeds post-create | MEDIUM-2 | Implied (CPI mitigates) | Same; not collision-related |
| migrate discriminator checks | LOW, adequate | ✅ F-06 area / test plan | Confirmed sufficient vs type confusion |
| `migrate_deal` no `deal_id` length check | Not noted | Not noted | **NEW: LOW hygiene gap** |
| `Reputation` PDA unused | Not in 02 | Mentioned in 06 | **NEW: future PDA design constraint** |
| Solana `MAX_SEED_LEN == deal_id max | Not noted | Not noted | **NEW: at-limit but valid** |

AUDIT/01 checklist item "Improper PDA ✅ PASS" (```35:35:AUDIT/01-security-audit-prep-package.md```) is **upheld** with stronger collision analysis; no downgrade.

---

## Summary table

| Attack vector | Result |
|---|---|
| Cross-type PDA collision (Deal/Vault/Config/Tier) | **Not possible** (distinct prefixes) |
| Seed-boundary concatenation (diagram) | **Not applicable** (no prefix-less string seeds) |
| Same-type deal_id collision | **Not possible** (SHA-256 + identical prefix) |
| Cross-type deserialize at same address | **Blocked** (addresses differ; discriminators + owners) |
| migrate_* type confusion | **Blocked** (seeds + owner + manual discriminator) |
| Optional config fee bypass | **Separate issue** (AUDIT/02 HIGH) — not PDA collision |

**Bottom line:** Sealed's PDA design matches Anchor best practice for this vulnerability class. The training-diagram exploit does **not** transfer to this program. Remaining work is defense-in-depth and future `Reputation` wiring discipline, not emergency PDA redesign.

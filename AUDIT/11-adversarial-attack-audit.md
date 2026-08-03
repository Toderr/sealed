# Adversarial Security Audit: Sealed Escrow (Red Team)

**Scope:** `programs/escrow/src/` (17 instructions), `app/src/lib/escrow-client.ts`, `app/src/app/deals/[id]/page.tsx`, negotiate deploy flow  
**Mode:** Read-only  
**Cross-reference:** AUDIT/01–08 (baseline commit noted in roadmap)  
**Source:** [Adversarial escrow attack audit](9e4e7767-041b-4df2-855f-88acfd317d7c)

---

## Executive Summary

### Can an attacker steal escrowed USDC?

**No — not via on-chain account substitution on a deal created through the normal `create_deal` path**, assuming the vault PDA was initialized in that same transaction.

Fund-moving instructions pin:
- Vault: `address = deal.escrow_token_account` (`fund_escrow.rs:19-22`, `release_milestone.rs:19-22`)
- Recipients: buyer/seller ATA owner + mint constraints
- Treasury: handler check `owner == deal.treasury && mint == deal.mint` (`fund_escrow.rs:70-73`, `release_milestone.rs:82-85`)
- CPI program: `Program<'info, Token>`

**Indirect “theft” surfaces (not vault drain):**
- **Worthless-token escrow:** any `Mint` accepted at `create_deal.rs:26` — seller delivers real work, buyer funded fake token.
- **Buyer unilateral release:** buyer signs `release_milestone` without off-chain delivery verification — by design, not a bypass.
- **UI/wallet deception:** malicious client passes wrong accounts; program constraints block fund redirection to arbitrary pubkeys.

### Can an attacker permanently freeze funds?

**Yes — several realistic paths:**

| Path | Mechanism |
|------|-----------|
| **Program upgrade without `migrate_deal`** | Old-layout `Deal` fails `AccountDidNotDeserialize` on all fund/release/refund paths (`state.rs:56-64`) |
| **Treasury rotation + client uses live Config** | On-chain validates snapshotted `deal.treasury`; client derives ATA from `fetchFeeConfig()` → `TreasuryAccountRequired` (`deals/[id]/page.tsx:380-384`) |
| **Vault dust donation** | Third party SPL-transfers into vault PDA; refund drains `funded - released`; dust remains → `close_deal` reverts forever (`close_deal.rs:37-47`) |
| **Milestone sum overflow** | Unchecked `.sum()` (`create_deal.rs:87`) → valid-looking deal with unreleasable milestone amounts → release CPI fails |

### Top 5 highest-ROI attacks for an attacker

1. **Fee bypass:** omit `config` on `create_deal` while platform config is live → permanently fee-free deal (`create_deal.rs:38-42,179-185`)
2. **Post-upgrade freeze:** deploy tier upgrade without running `migrate_deal` on every legacy deal → all escrow locked (`migrate_deal.rs:14-18`; app never calls `buildMigrateDealIx`)
3. **Treasury rotation freeze:** admin rotates treasury; UI passes new treasury ATA; on-chain rejects → releases blocked indefinitely (`release_milestone.rs:82-85` + client bug)
4. **Self-deal + fee evasion:** `buyer == seller` + config omission → wash deals, zero fees, future reputation gaming (`create_deal.rs:10-14`)
5. **Vault dust griefing:** 1 lamport USDC donation to vault after terminal refund → buyer cannot reclaim vault rent (`close_deal.rs:37-47`)

---

## Attack Catalog

### Critical

#### C-1: Post-upgrade deserialization freeze (unmigrated legacy deals)

| Field | Detail |
|-------|--------|
| **Prerequisites** | Program upgraded with appended `Deal` fields; deal created under old layout; holds USDC |
| **Steps** | 1. Upgrade program 2. Call `fund_escrow` / `release_milestone` / `approve_refund` on old deal (no `migrate_deal`) |
| **Victim impact** | **Permanent fund freeze** until permissionless migrate runs |
| **On-chain result** | **Fails** — `AccountDidNotDeserialize` (6017) |
| **Severity** | Critical (operational) |
| **Evidence** | `state.rs:56-64`, `migrate_deal.rs:14-18`, `escrow-client.ts:807-824` (builder exists, **never invoked**), `TIERING_DEVNET_TEST.md:32-48` |
| **Mitigation** | Auto-prepend `migrate_deal` in client before every deal ix; blocking devnet Test 1 |
| **Test case** | `unmigrated_deal_fails_after_upgrade` |

---

### High

#### H-1: Platform fee bypass via optional config omission

| Field | Detail |
|-------|--------|
| **Persona** | Fee evader (malicious buyer) |
| **Prerequisites** | Config PDA exists, `fee_active()` true |
| **Steps** | 1. Build `create_deal` tx 2. Pass `config: None` (Anchor: program ID in optional slot) 3. Fund and release normally |
| **Victim impact** | Platform loses all fees on that deal permanently |
| **On-chain result** | **Succeeds** — `fee_bps=0`, `treasury=default` snapshotted (`create_deal.rs:179-185`) |
| **Severity** | High (economic) |
| **Evidence** | `create_deal.rs:38-42,128-186` |
| **Mitigation** | Require `Account<Config>` when config initialized, or reject `None` if config exists |
| **Test case** | `create_deal_without_config_fee_bypass` |

#### H-2: Treasury rotation freezes releases (client ↔ on-chain desync)

| Field | Detail |
|-------|--------|
| **Persona** | Platform authority compromise / honest admin rotation + broken client |
| **Prerequisites** | Fee-bearing deal with snapshotted `deal.treasury = T_old`; admin calls `set_treasury(T_new)` |
| **Steps** | 1. Buyer attempts release via app 2. Client: `fetchFeeConfig()` → derives ATA for `T_new` 3. Passes wrong treasury ATA |
| **Victim impact** | **Funds safe but unreleasable**; seller unpaid; buyer cannot complete deal on-chain |
| **On-chain result** | **Fails** — `TreasuryAccountRequired` (6018) at `release_milestone.rs:82-85` |
| **Severity** | High (freeze) |
| **Evidence** | `deals/[id]/page.tsx:380-384`, `app/page.tsx:882-886`, `release_milestone.rs:82-85`, `config.rs:63-66` |
| **Mitigation** | Derive treasury ATA from **deal PDA** `deal.treasury`, not live Config |
| **Test case** | `release_with_rotated_treasury_uses_deal_snapshot` |

#### H-3: Milestone sum integer wrap → release DoS

| Field | Detail |
|-------|--------|
| **Persona** | Malicious buyer (deal creator) |
| **Prerequisites** | Buyer signs `create_deal` |
| **Steps** | 1. Pass milestones whose unchecked `sum()` wraps to equal `total_amount` (e.g. `u64::MAX` + small) 2. Fund fully 3. Call `release_milestone(0)` |
| **Victim impact** | Escrow funded but milestones unreleasable; mutual refund still works for `funded - released` |
| **On-chain result** | Create **succeeds**; release **fails** at SPL transfer (insufficient vault balance) |
| **Severity** | High (DoS / stuck deal) |
| **Evidence** | `create_deal.rs:87-91` (unchecked `.sum()`) |
| **Mitigation** | `try_fold` + `checked_add`; reject on overflow |
| **Test case** | `milestone_sum_overflow_wraps_to_total` |

#### H-4: Client gating on live `fee.active` skips treasury on fee-bearing deals

| Field | Detail |
|-------|--------|
| **Persona** | Client/UI deceiver (bug, not malice) |
| **Prerequisites** | Deal snapshotted with fees; live Config treasury later unset OR client reads wrong state |
| **Steps** | 1. `fetchFeeConfig()` returns `active: false` 2. Client omits `treasuryTokenAccount` 3. User funds/releases fee-bearing deal |
| **Victim impact** | Transaction fails; user confusion; deal stuck until fixed client |
| **On-chain result** | **Fails** — `TreasuryAccountRequired` (6018) when `deal.has_fee()` and fee > 0 |
| **Severity** | High (availability) |
| **Evidence** | `deals/[id]/page.tsx:380-383`, `DealDetail.tsx:195-196` (fund without treasury), `fund_escrow.rs:61-68` |
| **Mitigation** | Read `deal.fee_bps` + `deal.treasury` from chain; always pass treasury when `deal.has_fee()` |
| **Test case** | `fund_escrow_missing_treasury_on_fee_deal` |

#### H-5: `init_config` first-caller-wins (authority hijack)

| Field | Detail |
|-------|--------|
| **Persona** | Third-party MEV / front-runner |
| **Prerequisites** | Program deployed; config not yet initialized |
| **Steps** | 1. Front-run deployer's `init_config` 2. Attacker becomes `config.authority` 3. Set fees/treasury/tiers |
| **Victim impact** | Platform fee revenue redirected; tier manipulation |
| **On-chain result** | **Succeeds** for first caller (`config.rs:17-24,29-36`) |
| **Severity** | High (platform compromise) |
| **Evidence** | `config.rs:17-37` |
| **Mitigation** | Init config in same deploy tx; verify authority post-deploy |
| **Test case** | `init_config_race_second_call_fails` |

---

### Medium

#### M-1: Self-deal (`buyer == seller`)

| Field | Detail |
|-------|--------|
| **Prerequisites** | Buyer signs `create_deal` with `seller = buyer.key()` |
| **Steps** | Create → fund → release milestones to self / refund / timeout |
| **Victim impact** | Fee laundering, reputation inflation (future), milestone theater |
| **On-chain result** | **Succeeds** — no inequality check (`create_deal.rs:95-96`) |
| **Severity** | Medium |
| **Evidence** | `create_deal.rs:10-14,95-96` |
| **Mitigation** | `require!(buyer.key() != seller.key())` |
| **Test case** | `buyer_equals_seller_self_deal` |

#### M-2: Vault dust donation blocks rent reclaim

| Field | Detail |
|-------|--------|
| **Persona** | Griefing attacker (permissionless) |
| **Prerequisites** | Deal status `Refunded` or `Completed`; vault mostly drained |
| **Steps** | 1. Attacker SPL-transfers 1+ USDC lamports to vault PDA 2. Buyer calls `close_deal` |
| **Victim impact** | Vault rent (~0.002 SOL) locked forever unless dust swept |
| **On-chain result** | **Fails** — SPL `close_account` requires zero balance |
| **Severity** | Medium |
| **Evidence** | `close_deal.rs:37-47`, `approve_refund.rs:87-96` (no vault close) |
| **Mitigation** | Assert `escrow_token_account.amount == 0` before close, or add `sweep_dust` |
| **Test case** | `vault_dust_blocks_close_deal` |

#### M-3: Out-of-order milestone release (buyer discretion abuse)

| Field | Detail |
|-------|--------|
| **Persona** | Malicious / careless buyer |
| **Prerequisites** | Fully funded deal; multiple milestones |
| **Steps** | Call `release_milestone(2)` while milestone 0 still `Pending` |
| **Victim impact** | Seller paid for later milestone before earlier deliverables; reputational/business harm |
| **On-chain result** | **Succeeds** — only checks milestone `Pending`, not ordering (`release_milestone.rs:45-48`) |
| **Severity** | Medium (trust/abuse) |
| **Evidence** | `release_milestone.rs:40-48,100-103` |
| **Mitigation** | Optional: require milestone `i-1` released before `i`; or document as buyer-controlled |
| **Test case** | `release_milestone_out_of_order_succeeds` |

#### M-4: `approve_refund` cross-tx TOCTOU with fund/release

| Field | Detail |
|-------|--------|
| **Prerequisites** | One party approved refund; same block as counterparty `fund_escrow` or `release_milestone` |
| **Steps** | 1. Buyer approves refund 2. Same block: seller approves OR buyer releases 3. Block ordering determines outcome |
| **Victim impact** | Unexpected refund vs release; user confusion (not theft — destination still `deal.buyer`) |
| **On-chain result** | **Partial** — fund/release clear flags (`fund_escrow.rs:96-97`, `release_milestone.rs:109-110`) |
| **Severity** | Medium |
| **Evidence** | `approve_refund.rs:52-73,106-110` |
| **Mitigation** | Document; optional status lock during pending refund |
| **Test case** | `approve_refund_stale_after_release` |

#### M-5: Dual approval on zero-funded deal (flag pollution)

| Field | Detail |
|-------|--------|
| **Prerequisites** | Deal status `Created`, `funded_amount == 0` |
| **Steps** | 1. Buyer `approve_refund` 2. Seller `approve_refund` |
| **Victim impact** | Both flags true; transfer fails `InsufficientFunds`; flags persist until fund/release |
| **On-chain result** | Second call **fails** at `InsufficientFunds` after setting both flags |
| **Severity** | Medium (griefing/noise) |
| **Evidence** | `approve_refund.rs:27-31,66-80` |
| **Mitigation** | Restrict to `Funded \| InProgress`; require `funded > released` before recording approval |
| **Test case** | `approve_refund_zero_funded_dual_approval` |

#### M-6: Unchecked `funded_amount` / `released_amount` arithmetic

| Field | Detail |
|-------|--------|
| **Prerequisites** | Corrupted or edge-case amounts |
| **Steps** | Overflow `funded_amount += amount` or `released_amount += amount`; legacy `refund` uses plain subtraction |
| **Victim impact** | Accounting corruption; inflated refund attempt (bounded by vault balance) |
| **On-chain result** | Wrap possible on-chain; SPL transfer caps actual outflow |
| **Severity** | Medium |
| **Evidence** | `fund_escrow.rs:43-46,89`, `release_milestone.rs:103`, `refund.rs:43` vs `approve_refund.rs:76-79` |
| **Mitigation** | `checked_add` / `checked_sub` everywhere |
| **Test case** | `released_amount_overflow_inflates_refund_attempt` |

#### M-7: Worthless-token escrow (unconstrained mint)

| Field | Detail |
|-------|--------|
| **Prerequisites** | Attacker creates mint; counterparty doesn't verify mint |
| **Steps** | `create_deal` with attacker mint → fund with worthless tokens → buyer releases |
| **Victim impact** | Seller delivers real goods; receives worthless tokens |
| **On-chain result** | **Succeeds** — `create_deal.rs:26` accepts any `Mint` |
| **Severity** | Medium (counterparty trust) |
| **Evidence** | `create_deal.rs:26-27,97` |
| **Mitigation** | Canonical USDC mint in Config or cluster-gated constraint |
| **Test case** | `create_deal_fake_mint_escrow` |

#### M-8: Vault mint/authority not re-validated post-creation

| Field | Detail |
|-------|--------|
| **Prerequisites** | Hypothetically corrupted `deal.escrow_token_account` field |
| **Steps** | Pass token account at stored address with wrong authority |
| **Victim impact** | None today — PDA CPI signing fails |
| **On-chain result** | **Fails** at CPI |
| **Severity** | Medium (defense-in-depth) |
| **Evidence** | `fund_escrow.rs:19-23` (address only) |
| **Mitigation** | Add `mint == deal.mint`, `owner == deal.key()` constraints |
| **Test case** | `wrong_vault_ata_for_deal` |

#### M-9: Seller griefing — no consent at deal creation

| Field | Detail |
|-------|--------|
| **Prerequisites** | Buyer knows seller pubkey |
| **Steps** | Buyer creates deal naming victim as seller without their knowledge |
| **Victim impact** | Reputation/noise; seller must ignore or approve refund |
| **On-chain result** | **Succeeds** — seller is `UncheckedAccount` (`create_deal.rs:13-14`) |
| **Severity** | Medium |
| **Evidence** | `create_deal.rs:13-14` |
| **Mitigation** | Off-chain invite flow; optional seller signature variant |
| **Test case** | N/A (policy) |

#### M-10: Buyer timeout after partial releases

| Field | Detail |
|-------|--------|
| **Prerequisites** | `funded_at + 30 days` elapsed; some milestones released |
| **Steps** | Buyer calls `buyer_timeout_refund` |
| **Victim impact** | Seller keeps released amounts; buyer reclaims remainder (by design) |
| **On-chain result** | **Succeeds** — `buyer_timeout_refund.rs:38-80` |
| **Severity** | Medium (seller trust risk, intentional) |
| **Evidence** | `buyer_timeout_refund.rs:7,43-49` |
| **Mitigation** | Product disclosure; shorter milestones |
| **Test case** | `buyer_timeout_after_partial_release` |

---

### Low

#### L-1: Account substitution attacks (blocked)

| Attack | Result | Evidence |
|--------|--------|----------|
| Wrong vault ATA | **Fails** `ConstraintAddress` | `fund_escrow.rs:19-22` |
| Wrong buyer/seller ATA owner | **Fails** constraint | `fund_escrow.rs:27-28`, `release_milestone.rs:27-28` |
| Wrong treasury owner | **Fails** `TreasuryAccountRequired` | `fund_escrow.rs:70-73` |
| Wrong token program | **Fails** program ID check | All ix use `Program<'info, Token>` |
| Wrong mint on ATA | **Fails** mint constraint | `fund_escrow.rs:28` |
| Non-party `approve_refund` | **Fails** `UnauthorizedBuyer` | `approve_refund.rs:57-63` |
| Non-authority tier/config | **Fails** `UnauthorizedAuthority` | `tier.rs:27-31`, `config.rs:47-52` |
| Tier PDA cosplay | **Fails** `ConstraintSeeds` | `create_deal.rs:49-53` |

**Test cases:** `wrong_vault_ata_for_deal`, `wrong_token_program_pubkey`, `non_party_calls_approve_refund`, `treasury_ata_wrong_owner_when_fees_active`

#### L-2: `creator_wallet` buyer-asserted (not signer-proven)

Safe for fee-side selection today (`create_deal.rs:74-81`). Becomes privilege escalation if `deal.creator` drives reputation.

**Test case:** `create_deal_invalid_creator_third_party` (must fail)

#### L-3: `approve_refund` wrong error code for seller/non-party

Returns `UnauthorizedBuyer` for all non-buyer signers (`approve_refund.rs:62`).

#### L-4: `DealStatus::Disputed` / `MilestoneStatus::Completed` dead variants

No instruction sets them (`state.rs:155-168`). Off-chain “dispute” has no on-chain effect.

#### L-5: Legacy `refund` + `DealDetail` co-sign path

`DealDetail.tsx:21-22` still imports `buildRefundIx` / partial-sign flow; superseded by `approve_refund`. Blockhash expiry makes legacy path unreliable (documented in `approve_refund.rs:7-17`).

#### L-6: `fetchDealRefundState` hand-decoder omits tier tail fields

Refund flags at correct offset (`escrow-client.ts:531-536`); tier fields unread — safe for refund UI today, fragile on future layout changes.

#### L-7: Zero-milestone / zero-amount deals

No minimum milestone count (`create_deal.rs:68`); `total_amount == 0` allowed → rent griefing.

**Test case:** `create_deal_zero_amount_zero_milestones`

#### L-8: Milestone description > 128 chars

Fails at account write, not handler (`state.rs:142`).

---

## Exploit Chains

### Chain 1: Fee evasion + self-deal wash

```
create_deal(config=None, buyer=seller) → fund_escrow → release_milestone × N → close_deal
```

**Impact:** Zero platform fees, inflated deal volume for future reputation.  
**ROI:** High for repeat abuser.

### Chain 2: Upgrade freeze → ransom-by-migration

```
Program upgrade → all legacy deals fail deserialize → attacker (or anyone) runs migrate_deal for rent
```

**Impact:** Funds frozen until migrate; app doesn't auto-migrate (`escrow-client.ts:807-824` unused).  
**ROI:** Critical for platform ops; permissionless migrate is benign but **UI must invoke it**.

### Chain 3: Treasury rotation + live-config client → stuck mid-deal

```
set_treasury(T_new) → buyer releases via app → TreasuryAccountRequired → seller unpaid indefinitely
```

**Impact:** No theft; bilateral freeze on remaining milestones.  
**ROI:** High for admin mistake or compromised authority.

### Chain 4: Vault dust + completed refund

```
approve_refund (both parties) → attacker donates 1 USDC to vault → close_deal fails forever
```

**Impact:** ~0.002 SOL rent griefing per deal.  
**ROI:** Low cost, persistent annoyance.

### Chain 5: Supabase mirror lies + premature seller delivery

```
Seller uploads deliverable (off-chain) → mirror shows "Released" (PATCH without tx) → seller ships goods → on-chain still Pending
```

**Impact:** Seller delivers; buyer never signs release. **Funds safe on-chain**; seller loses goods.  
**Evidence:** `deals/[id]/page.tsx:402-406` (mirror patch after on-chain success — correct pattern, but mirror can desync if API compromised).

### Chain 6: Milestone overflow + mutual refund escape

```
create_deal(wrapped milestones) → fund → release fails → approve_refund × 2 → buyer gets funds back minus buyer fee
```

**Impact:** Deal DoS; buyer fee non-refundable by design (`fund_escrow.rs:59-86`).

---

## Breaking Point Scenarios

| Stress condition | What breaks first |
|------------------|-------------------|
| **Upgrade without migration** | Every legacy deal ix → `AccountDidNotDeserialize`; escrow frozen |
| **Config unset treasury at create** | Deals fee-free even with `config` passed (`Config::fee_active()` false) |
| **100% asymmetric tier (500 bps one side)** | Capped at `MAX_FEE_BPS` (500); works but one side pays 5% |
| **Treasury rotation after deals** | On-chain OK (snapshot); **client breaks first** |
| **`migrate_config` not run post-upgrade** | `set_tiers`, tiered `create_deal` fail deserialize |
| **100 concurrent deals, no tests** | Silent regressions (`tests/platform-fee.ts` stubs only) |
| **SSS tier (buyer 0%, seller 0.5%)** | Works if treasury passed at release; fails if client omits treasury (`TIERING_DEVNET_TEST.md:Test 4`) |
| **Partial fund + cancel** | Works — `cancel_deal` refunds partial (`cancel_deal.rs:38-59`) |
| **Partial fund + release** | Blocked — status stays `Created` until fully funded (`fund_escrow.rs:90-92`) |

---

## PoC Test Matrix

| Attack | Test name | Expected error / outcome |
|--------|-----------|--------------------------|
| Wrong vault | `wrong_vault_ata_for_deal` | Anchor `ConstraintAddress` (~2012) |
| Wrong token program | `wrong_token_program_pubkey` | Invalid program / 3008 |
| Non-party refund | `non_party_calls_approve_refund` | `UnauthorizedBuyer` (6007) |
| Fee bypass | `create_deal_without_config_fee_bypass` | **Success** (document) |
| Self-deal | `buyer_equals_seller_self_deal` | **Success** (document) |
| Wrong buyer mint | `wrong_mint_on_buyer_token_account` | Constraint violation |
| Wrong treasury | `treasury_ata_wrong_owner_when_fees_active` | `TreasuryAccountRequired` (6018) |
| Wrong seller ATA | `release_milestone_seller_ata_not_owned_by_deal_seller` | Constraint violation |
| Non-authority tier | `set_user_tier_by_non_authority` | `UnauthorizedAuthority` (6011) |
| Migrate wrong disc | `migrate_deal_wrong_account_discriminator` | `AccountDidNotDeserialize` (6017) |
| Milestone overflow | `milestone_sum_overflow_wraps_to_total` | Create OK; release SPL fail |
| Unmigrated deal | `unmigrated_deal_fails_after_upgrade` | `AccountDidNotDeserialize` (6017) |
| Post-migrate release | `migrate_deal_unfreezes_legacy_deal` | **Success** |
| Stale refund flags | `approve_refund_stale_after_fund_escrow` | Second approve no refund alone |
| Stale refund after release | `approve_refund_stale_after_release` | Flags cleared |
| Vault dust | `vault_dust_blocks_close_deal` | SPL close fail |
| Treasury rotation | `release_with_stale_treasury_ata_fails` | `TreasuryAccountRequired` (6018) |
| Timeout early | `buyer_timeout_before_30_days` | `TimeoutNotReached` (6010) |
| Cancel funded | `cancel_deal_when_funded` | `InvalidDealStatus` (6003) |
| Double release | `double_release_same_milestone` | `InvalidMilestoneStatus` (6005) |
| Out-of-order release | `release_milestone_out_of_order_succeeds` | **Success** |

---

## Gaps vs Existing AUDIT/01–08

### Already covered (confirm, don't re-prioritize)

- Vault/treasury/mint substitution blocked (AUDIT/04, /02)
- Optional config fee bypass (AUDIT/01, /02, /04) — **HIGH**
- Self-deal, vault defense-in-depth, migrate design (AUDIT/04, /03)
- Unchecked arithmetic (AUDIT/03) — **HIGH for milestone sum**
- `approve_refund` TOCTOU mitigated by flag clears (AUDIT/04)
- Client treasury snapshot bug (AUDIT/05, /08 item 14)
- `migrate_deal` not wired in app (AUDIT/05, /06, /08)
- Sea-level test plan (AUDIT/04) — file not yet created

### NEW or deeper in this review

| Finding | Why new / deeper |
|---------|------------------|
| **Client gates treasury on live `fee.active`, not `deal.has_fee()`** | Chain 3: admin unsets treasury → all fee-deal releases fail even though deals retain snapshotted treasury |
| **`DealDetail.tsx` fund/release omit treasury entirely** | Separate UI path from negotiate/deals page; fee deals fail silently from dashboard |
| **Out-of-order milestone release** | Not emphasized in 01–08; buyer can pay milestone N before 0 |
| **Vault dust → permanent close_deal failure** | In /03 but not chained with third-party attacker persona |
| **Supabase mirror desync → seller delivers against fake "Released"** | Off-chain trust boundary; /07 covers prompt injection, not deal-state lying |
| **Zero-milestone zero-amount deals** | Rent spam vector; not in prior reports |
| **Legacy `DealDetail` refund co-sign still wired** | UX/security confusion; /08 mentions consolidate but not attack surface |
| **`buildCreateDealIx` always passes configPDA** | /05 notes mismatch with comment; pre-init deploy fails (inverse of fee bypass) |
| **Buyer timeout + partial release seller exposure** | Business-logic trust break spelled as attacker-mindset scenario |

---

## Summary Verdict

The on-chain program's **fund-safety model is sound** for normal deal creation: escrow outflows require buyer authorization (or mutual approval / timeout), recipients are pinned to deal parties, and CPI signing binds vault authority to the deal PDA.

**No Critical direct-theft vector** was found in the instruction set. **Critical operational risk** exists for program upgrades without migration. **High economic and availability risks** concentrate in fee bypass, client↔chain treasury desync, and arithmetic hardening gaps.

**Pre-mainnet minimum:** implement `tests/sea-level-attacks.ts` P0/P1 matrix, wire `migrate_deal`, fix treasury derivation from deal snapshot, require config when fee-active, and add checked arithmetic on `create_deal.rs:87`.

---

## Anchor safety note

Cross-instruction audit of `remaining_accounts` usage across all 17 escrow instructions found **zero** `remaining_accounts` handlers — no unvalidated trailing-account attack surface in the current program (see [Audit remaining_accounts usage](2cc4842e-b80e-40c4-9d77-e09b52fd5663)).

## 1. Executive Summary

The escrow program is a milestone-based USDC vault with buyer-initiated funding, buyer-only release, platform fees (symmetric + tiered asymmetric), mutual two-step refund (`approve_refund`), buyer timeout reclaim, and account-layout migrations for tier upgrades. Core money paths—fund, release, refund—have sensible access control, per-deal fee snapshots, and stale-approval invalidation on fund/release.

**Overall readiness:** Adequate for devnet iteration on the *current* layout; **not mainnet-ready** without addressing tier-upgrade migration wiring, integer overflow hardening, and a real test suite. `STATUS.md` (June 2026) is stale—it lists 7 instructions; the program now has ~17 including tiering, config admin, and migrations.

**Top risks:** (1) Pre-tier `Deal`/`Config` accounts **cannot deserialize** after the tier upgrade until `migrate_deal` / `migrate_config` run—funds are frozen if upgrade deploys without migration automation; (2) client uses **live Config treasury** for release, not the deal's snapshotted treasury; (3) **no completed on-chain tests** (`tests/platform-fee.ts` is mostly stubs).

---

## 2. Critical Findings (Blockers)

### Legacy deals frozen after tier upgrade without migration
| | |
|---|---|
| **Severity** | Blocker (for tier-upgrade deploy / any program with existing deals) |
| **Location** | `programs/escrow/src/state.rs:56-64`, `migrate_deal.rs:51-96`, `migrate_config.rs:45-83`; app: `escrow-client.ts:807-824` (builder exists, **never called**) |
| **Why it matters** | Appending tier fields lengthens `Deal`/`Config`. Borsh rejects short buffers → `AccountDidNotDeserialize` on fund/release/refund. Escrowed USDC is inaccessible until migration runs. `TIERING_DEVNET_TEST.md:32-37` explicitly marks this as the blocking pre-upgrade test. |
| **Recommended fix** | Before live upgrade: (1) run devnet Test 1 in `TIERING_DEVNET_TEST.md`; (2) prepend `migrate_deal` to every deal-touching tx in the app (fund/release/refund/cancel/timeout); (3) add `buildMigrateConfigIx` and run once post-upgrade before any config/tier ops. |

### Tier-upgrade devnet verification not evidenced as complete
| | |
|---|---|
| **Severity** | Blocker (process gate before live upgrade) |
| **Location** | `programs/escrow/TIERING_DEVNET_TEST.md:100-104` |
| **Why it matters** | The only test that validates real escrow survivability across layout change is manual, two-deployment, and **not automated**. Upgrading live program ID without a green run risks freezing production escrow. |
| **Recommended fix** | Execute all four test sections on throwaway program ID; document pass/fail before upgrade. Automate at minimum Test 1 + Test 4 (`has_fee` 0-side trap). |

---

## 3. Important Findings (Should Fix)

### Unchecked `u64` arithmetic on value-bearing paths
| | |
|---|---|
| **Severity** | Should Fix |
| **Location** | `create_deal.rs:87-90` (milestone `.sum()`), `fund_escrow.rs:89` (`funded_amount +=`), `release_milestone.rs:103` (`released_amount +=`), `refund.rs:43` (`funded_amount - released_amount`) |
| **Why it matters** | Wrapping addition can make `milestone_sum == total_amount` with oversized milestone entries; wrapping subtraction can inflate refund amounts if state ever diverges. Unlikely with normal USDC amounts but standard Solana hardening gap. |
| **Recommended fix** | Use `checked_add` / `checked_sub` throughout; return `EscrowError::MathOverflow`. |

### Client passes live Config treasury, not deal snapshot
| | |
|---|---|
| **Severity** | Should Fix |
| **Location** | `app/src/app/deals/[id]/page.tsx:380-384`, `app/src/app/app/page.tsx:882-886`; on-chain guard: `release_milestone.rs:82-84` |
| **Why it matters** | On-chain validates `treasury_ta.owner == deal.treasury` (snapshotted at create). If authority calls `set_treasury` after deal creation, client-derived ATA fails → releases blocked. Funds safe but deal stuck. |
| **Recommended fix** | Decode `deal.treasury` from Deal PDA (or mirror in Supabase) and derive treasury ATA from snapshot, not `fetchFeeConfig()`. |

### `buildCreateDealIx` always passes Config PDA when account may not exist
| | |
|---|---|
| **Severity** | Should Fix |
| **Location** | `escrow-client.ts:301-326` (comment at 296-300 says pass `PROGRAM_ID` for None; code always passes `configPDA`) |
| **Why it matters** | Anchor `Option<Account<Config>>` requires program ID for `None`. Missing Config PDA → `create_deal` fails on fresh deploys before `init_config`. |
| **Recommended fix** | Mirror tier-slot logic: `getAccountInfo(configPDA)` → use PDA if exists, else `PROGRAM_ID`. |

### No buyer ≠ seller guard on `create_deal`
| | |
|---|---|
| **Severity** | Should Fix |
| **Location** | `create_deal.rs:60-85` (parties set, no inequality check); noted in `STATUS.md:58` |
| **Why it matters** | Self-deals waste rent and can confuse reputation/accounting; not direct theft but avoidable footgun. |
| **Recommended fix** | `require!(buyer.key() != seller.key(), EscrowError::...)` |

### Test suite is non-functional scaffolding
| | |
|---|---|
| **Severity** | Should Fix |
| **Location** | `tests/platform-fee.ts:72-106` (empty `it` bodies); no other Anchor tests |
| **Why it matters** | Fee logic, tier pricing, refund paths, and migration are untested in CI. Regressions will ship silently. |
| **Recommended fix** | Complete platform-fee tests; add tests for `approve_refund`, `buyer_timeout_refund`, tier asymmetric fees, `migrate_deal` idempotency. |

### Milestone description length not validated in handler
| | |
|---|---|
| **Severity** | Should Fix |
| **Location** | `create_deal.rs:67-68` (validates deal_id/milestone count, not description); `state.rs:142` (`max_len(128)`) |
| **Why it matters** | Overlong descriptions fail at account write with opaque Anchor errors instead of clear rejection. |
| **Recommended fix** | `require!(m.description.len() <= 128, ...)` per milestone in handler. |

### `migrate_config` not exposed in client
| | |
|---|---|
| **Severity** | Should Fix |
| **Location** | On-chain: `lib.rs:85-87`; client: **missing** (only `buildMigrateDealIx`) |
| **Why it matters** | Post-upgrade, old Config PDA blocks `set_tiers`, `set_user_tier`, and fee-bearing `create_deal` until migrated. |
| **Recommended fix** | Add `buildMigrateConfigIx`; run in admin upgrade script before tier setup. |

### Mint not constrained to USDC on-chain
| | |
|---|---|
| **Severity** | Should Fix |
| **Location** | `create_deal.rs:26` (any `Mint` accepted) |
| **Why it matters** | Trust boundary is entirely on the frontend/env. Malicious or mistaken mint → worthless-token escrow. Acceptable for devnet; risky for mainnet without allowlist or canonical mint constraint. |
| **Recommended fix** | Store allowed mint in Config or hardcode mainnet/devnet USDC per cluster. |

---

## 4. Minor Findings (Nice to Have)

### `DealStatus::Disputed` is dead code
| | |
|---|---|
| **Severity** | Nice to Have |
| **Location** | `state.rs:161`; no instruction sets it (`STATUS.md:60`) |
| **Why it matters** | Misleading for integrators; no on-chain dispute flow exists. |
| **Recommended fix** | Remove enum variant or implement `raise_dispute`. |

### `Reputation` PDA defined but unused
| | |
|---|---|
| **Severity** | Nice to Have |
| **Location** | `state.rs:177-190`; `STATUS.md:54` |
| **Why it matters** | Product differentiator not anchored on-chain. |
| **Recommended fix** | Wire updates in `release_milestone` or defer and remove from IDL until ready. |

### Manual Borsh decoders fragile to layout changes
| | |
|---|---|
| **Severity** | Nice to Have |
| **Location** | `escrow-client.ts:504-543` (`fetchDealRefundState`), `88-143` (Config/Tier decode) |
| **Why it matters** | Correct today for refund flags; breaks silently on next appended field without IDL. |
| **Recommended fix** | Generate client from Anchor IDL after `anchor build`. |

### `approve_refund` uses wrong error for non-parties
| | |
|---|---|
| **Severity** | Nice to Have |
| **Location** | `approve_refund.rs:62` → `UnauthorizedBuyer` for any non-buyer/non-seller |
| **Why it matters** | Confusing logs/UI; not a security issue. |
| **Recommended fix** | Add `UnauthorizedParty` error. |

### `STATUS.md` outdated vs program surface
| | |
|---|---|
| **Severity** | Nice to Have |
| **Location** | `STATUS.md:11-20` (7 instructions vs ~17 today) |
| **Why it matters** | Misleads reviewers and deploy checklists. |
| **Recommended fix** | Update instruction table, note tier/migration/approve_refund. |

### Milestone release order not enforced
| | |
|---|---|
| **Severity** | Nice to Have |
| **Location** | `release_milestone.rs:44-48` (only checks target milestone is Pending) |
| **Why it matters** | Buyer can release milestone 2 before 1 if both Pending. Likely intentional flexibility. |
| **Recommended fix** | Document as allowed, or require prior milestones Released. |

### `DealDetail.tsx` omits treasury on fund/release (appears unused)
| | |
|---|---|
| **Severity** | Nice to Have |
| **Location** | `DealDetail.tsx:195`, `249-254`; component has no imports in app |
| **Why it matters** | Would fail on fee-bearing deals if re-wired. Primary paths (`deals/[id]`, negotiate, app panel) handle treasury correctly. |
| **Recommended fix** | Delete or fix if kept. |

---

## 5. Assumptions & Open Questions

- **Tier upgrade deploy status (needs verification):** Is the tier-layout program already deployed to `3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ`, or still pre-tier on devnet? Blocker severity depends on whether live deals exist under old layout.
- **Devnet Test 1 completion (needs verification):** Has the two-deployment migration test in `TIERING_DEVNET_TEST.md` been run and passed?
- **Config initialization:** Is `init_config` + `set_treasury` always run on devnet before deal creation? If yes, the config-PDA client bug is latent only.
- **Tier pricing decision:** `TIERING_DEVNET_TEST.md:106-111` — Reading A vs B for counterparty fee bps is still a product open question (no code change needed).
- **Partial funding:** Not supported for release (status stays `Created` until fully funded)—confirmed intentional; timeout refund unavailable on partial fund; `cancel_deal` handles buyer exit.

---

## 6. Recommended Next Actions

1. **Run `TIERING_DEVNET_TEST.md` Tests 1–4** on throwaway program ID; do not upgrade live program until Test 1 passes.
2. **Wire migrations in app:** prepend `migrate_deal` to all deal instructions; add and run `migrate_config` in admin upgrade flow.
3. **Fix client treasury resolution:** read snapshotted `deal.treasury` from chain for fund (partial) and release paths.
4. **Fix `buildCreateDealIx` optional Config** account wiring (existence check → PDA or program ID).
5. **Harden arithmetic** with checked ops on all amount accumulators and refund math.
6. **Add `seller != buyer` constraint** in `create_deal`.
7. **Complete `tests/platform-fee.ts`** and add refund/migration/tier coverage; gate CI on `anchor test`.
8. **Decide mainnet mint policy** (Config-stored USDC mint or cluster constants).
9. **Update `STATUS.md`** to reflect current instruction set and migration requirements.

---

### What PASSED review

- **Access control:** Buyer-only fund/release/timeout/cancel/close; dual-party mutual refund via `approve_refund`; authority-gated config/tier admin (`config.rs:47-52`, `tier.rs:27-31`).
- **Fee model:** Per-deal snapshot at create (`create_deal.rs:126-186`); `has_fee()` correctly handles asymmetric 0-side tiers (`state.rs:83-94`); buyer fee charged once (`fund_escrow.rs:61-86`); seller fee deducted at release (`release_milestone.rs:54-97`).
- **Refund safety:** Refund destination locked to `deal.buyer` ATA (`approve_refund.rs:42-46`); approvals cleared on fund/release (`fund_escrow.rs:96-98`, `release_milestone.rs:109-110`); timeout anchored to `funded_at` (`buyer_timeout_refund.rs:42-46`).
- **Migration design:** Permissionless, idempotent, grow-only (`migrate_deal.rs:70-73`); zero-fill preserves legacy fee behavior (`state.rs:65-78`).
- **PDA binding:** Deal/escrow-vault/config/tier seeds validated; creator tier PDA bound to `creator_wallet` (`create_deal.rs:49-53`).
- **Primary UI paths:** `deals/[id]/page.tsx` uses two-step `approve_refund` + optional `close_deal`; negotiate page passes treasury + creator role correctly.

[REDACTED]
# Post-Fix Verification — Audit Remediation

Verification that the Daemon audit findings are closed, run against the
**patched** program (commit on `main` after PR #64, merged into `security_audit`).
Reproduces the auditor's own exploit tests against the fixed code.

| Field | Value |
|-------|-------|
| Program ID (devnet) | `3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ` |
| Fixes commit | `6c5f482` (PR #64) |
| Verified by re-running | Daemon's `ctf-tests` against the rebuilt `escrow.so` |
| Date | 2026-08-05 |

---

## Headline: C-1 is closed — proven by the auditor's own test flipping

Daemon's CTF challenge `challenge_fee_free_config_omission_bypasses_platform_fee`
builds a `create_deal` with the `config` account **omitted** (`include_config =
false`) and asserts it **succeeds** — that was the fee bypass.

Run against the patched program, the exploit is **rejected**:

```
Program log: Instruction: CreateDeal
Program log: AnchorError caused by account: config.
  Error Code: AccountOwnedByWrongProgram. Error Number: 3007.
Program failed: custom program error: 0xbbf

test challenge_fee_free_config_omission_bypasses_platform_fee ... FAILED
```

**The test FAILING is the proof.** It was written to demonstrate a working
exploit; the exploit no longer works, so its `.expect("...should succeed")`
panics. `config` is now a required account (audit C-1 fix), so Anchor rejects a
`create_deal` that omits it before the handler runs. The permanent fee bypass is
dead.

This is the pass→fail flip the auditor asked us to confirm, reproduced against
the actual patched program.

---

## Full findings status

| Finding | Sev | Fix | Verified how |
|---|---|---|---|
| **C-1** optional config fee bypass | CRITICAL | `config` now required | CTF `fee_free` exploit now REJECTED (above) |
| **H-1** unconstrained mint | HIGH→MED | mint allowlist + `set_allowed_mints` | IDL shows the instruction; on-chain allowlist set to USDC; `UnsupportedMint` error in binary |
| **H-2** milestone sum overflow | HIGH→LOW | `try_fold` + `checked_add` | logic tested; returns `MathOverflow`, no panic |
| **M-3** unchecked accounting | MEDIUM | `checked_add` on funded/released | logic tested |

Deployed to devnet and verified live:
- program upgrade `5X35FFHhacNhFpUg4j94oKE6QmehwAu65JTNUaNfk62LZ9VbmTnUuXBeyjmrGETziNMEb6ePzi1cB8sby57RExzL`
- `migrate_config` (159→419 bytes) `4QvMXf5aSoX52Fzn4yj6r8ErGQj83TZqHcKm4S2AoHHvzPp52m14P8MbCh6ztWWRLBCFj5KwUrikenN7rabpdMjZ`
- `set_allowed_mints([USDC])` `4p2yYRAAf8f6NbCbxj44WGb2ofDAJay5pgTseNtxftir28htyCmCgbBjysVkRfGtP979DVGmFJMDRCyZRgeYmHTv`

---

## Important note for the auditor: two CTF harness tests need updating

`challenge_treasury_trap_wrong_ata_rejected` and the `wrong_vault` challenge now
fail on a **`creator_tier` account error, NOT the control they test**:

```
AnchorError caused by account: creator_tier. Error Code: AccountOwnedByWrongProgram (3007)
```

This is a **harness-staleness issue, not a security regression.** The CTF
`create_deal_ix` builder (`ctf-tests/src/escrow_ix.rs:100-114`) was written for an
earlier account layout and does not supply the optional `creator_tier` slot that
`create_deal` now expects between `config` and `token_program`. So those tests
fail during *setup*, before reaching their actual treasury/vault assertion.

**The controls they test are intact and unchanged by the fix:**
- Treasury validation still enforced: `release_milestone.rs:83-84` —
  `treasury_ta.owner == deal_treasury && treasury_ta.mint == deal_mint`.
- Vault address pinning unchanged.

These are the same controls the original audit rated "Verified secure." The fix
touched `config` (made it required), the mint check, and arithmetic — none of the
vault/treasury constraints. Updating the CTF harness's `create_deal_ix` to include
the `creator_tier` sentinel would let those two tests reach and re-pass their
assertions; that is a change to the auditor's own harness, so it is flagged here
for Daemon rather than edited unilaterally.

---

## The `poc-tests` (Neodyme framework) suite

Not run here: the `poc-tests` crate pulls `poc-framework` → `rocksdb` →
`libclang` as a native build dependency, which requires an interactive
`sudo apt install libclang-dev` this environment could not complete. The
`ctf-tests` suite (otter-sec `sol-ctf-framework`, no native deps) covers the same
C-1 fee-bypass exploit and is what's reported above. Daemon can run `poc-tests`
in their own environment for the remaining PoC rows.

---

## Bottom line

- **C-1 (the only critical) is proven closed** by the auditor's own exploit test,
  which now fails because the attack is rejected on-chain.
- H-1/H-2/M-3 fixes are in the deployed binary and logic-verified.
- Two CTF tests need a one-line harness update (add the `creator_tier` slot) to
  re-reach their assertions; the controls they cover are unchanged.
- Recommend Daemon re-run their full `poc-tests` + `ctf-tests` (after the harness
  tweak) in their environment for a formal sign-off.

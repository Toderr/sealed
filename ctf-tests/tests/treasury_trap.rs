//! Challenge: Treasury Trap — wrong treasury ATA with fees active must fail.
//!
//! Audit: AUDIT/04 (treasury_ata_wrong_owner), AUDIT/11, AUDIT/12 #8 (PARTIAL freeze).
//!
//! When a deal snapshotted fees + treasury, fund/release paths validate
//! `treasury_token_account.owner == deal.treasury`.

use sealed_ctf_tests::escrow_ix::{create_deal_ix, fund_escrow_ix, vault_pda};
use sealed_ctf_tests::harness::{require_escrow_so, LocalChallenge};
use sealed_ctf_tests::setup::{init_fee_platform, ChallengeActors};
use sealed_ctf_tests::{ONE_USDC, Signer};

#[tokio::test]
#[ignore = "requires anchor build (../target/deploy/escrow.so)"]
async fn challenge_treasury_trap_wrong_ata_rejected() {
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

    let deal_id = "ctf-treasury-trap";
    let amount = 10 * ONE_USDC;

    let create_ix = create_deal_ix(
        actors.buyer.pubkey(),
        actors.seller.pubkey(),
        actors.mint,
        deal_id,
        amount,
        actors.buyer.pubkey(),
        true, // snapshotted fee + treasury
    );
    challenge
        .challenge
        .run_ixs_full(&[create_ix], &[&actors.buyer], &actors.buyer.pubkey())
        .await
        .expect("create deal with fees");

    // Attacker treasury ATA — correct mint, wrong owner vs deal.treasury.
    let wrong_treasury_ata = challenge
        .challenge
        .add_token_account(&actors.mint, &actors.attacker.pubkey())
        .await
        .expect("attacker treasury ATA");

    let fund_ix = fund_escrow_ix(
        actors.buyer.pubkey(),
        deal_id,
        actors.buyer_ata,
        amount,
        vault_pda(deal_id),
        Some(wrong_treasury_ata),
    );

    let err = challenge
        .challenge
        .run_ixs_full(&[fund_ix], &[&actors.buyer], &actors.buyer.pubkey())
        .await
        .expect_err("wrong treasury ATA must fail (TreasuryAccountRequired 6018)");

    eprintln!("Treasury Trap challenge: defense held — {err}");

    // Control: correct treasury ATA succeeds.
    let fund_ok = fund_escrow_ix(
        actors.buyer.pubkey(),
        deal_id,
        actors.buyer_ata,
        amount,
        vault_pda(deal_id),
        Some(actors.treasury_ata),
    );
    challenge
        .challenge
        .run_ixs_full(&[fund_ok], &[&actors.buyer], &actors.buyer.pubkey())
        .await
        .expect("correct treasury ATA should fund");

    eprintln!("Treasury Trap control: legitimate treasury path succeeded");
}

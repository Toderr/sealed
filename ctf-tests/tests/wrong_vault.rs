//! Challenge: Wrong Vault — vault substitution must fail.
//!
//! Audit: AUDIT/04 (wrong_vault_ata_for_deal), AUDIT/11, AUDIT/12 (FALSE POSITIVE on drain).
//!
//! Documents the on-chain defense: `address = deal.escrow_token_account` blocks
//! redirecting funds to an attacker-owned token account.

use sealed_ctf_tests::escrow_ix::{create_deal_ix, fund_escrow_ix, vault_pda};
use sealed_ctf_tests::harness::{require_escrow_so, LocalChallenge};
use sealed_ctf_tests::setup::{init_fee_platform, ChallengeActors};
use sealed_ctf_tests::{ONE_USDC, Signer};

#[tokio::test]
#[ignore = "requires anchor build (../target/deploy/escrow.so)"]
async fn challenge_wrong_vault_substitution_rejected() {
    if require_escrow_so().is_none() {
        return;
    }

    let mut challenge = LocalChallenge::new().await.expect("harness");
    let actors = ChallengeActors::bootstrap(&mut challenge)
        .await
        .expect("bootstrap");

    // config is now required (audit C-1), so init the platform and pass it —
    // otherwise create_deal is rejected before this test reaches its actual
    // vault-substitution assertion (audit #65 finding 2).
    init_fee_platform(&mut challenge, actors.treasury_owner.pubkey())
        .await
        .expect("fee platform");

    let deal_id = "ctf-wrong-vault";
    let amount = 5 * ONE_USDC;

    let create_ix = create_deal_ix(
        actors.buyer.pubkey(),
        actors.seller.pubkey(),
        actors.mint,
        deal_id,
        amount,
        actors.buyer.pubkey(),
        true,
    );
    challenge
        .challenge
        .run_ixs_full(&[create_ix], &[&actors.buyer], &actors.buyer.pubkey())
        .await
        .expect("create deal");

    // Attacker-owned fake vault (not the PDA bound in deal.escrow_token_account).
    let fake_vault = challenge
        .challenge
        .add_token_account(&actors.mint, &actors.attacker.pubkey())
        .await
        .expect("fake vault");

    let real_vault = vault_pda(deal_id);
    assert_ne!(fake_vault, real_vault, "sanity: fake != real vault");

    let malicious_fund = fund_escrow_ix(
        actors.buyer.pubkey(),
        deal_id,
        actors.buyer_ata,
        amount,
        fake_vault, // substituted vault
        None,
    );

    let err = challenge
        .challenge
        .run_ixs_full(&[malicious_fund], &[&actors.buyer], &actors.buyer.pubkey())
        .await
        .expect_err("wrong vault must be rejected");

    eprintln!("Wrong Vault challenge: defense held — {err}");
}

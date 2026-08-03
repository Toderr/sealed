//! Security PoC integration tests — Neodyme solana-poc-framework + LocalEnvironment.
//!
//! Run (from repo root, after `anchor build`):
//!   cd poc-tests && cargo test -- --nocapture
//!
//! See `../POC_TESTS.md` for prerequisites and expected outcomes.

use poc_framework::solana_program::system_program;
use poc_framework::solana_sdk::signature::Signer;
use poc_framework::spl_associated_token_account::get_associated_token_address;
use poc_framework::spl_token;

use sealed_poc_tests::escrow_ix::{
    approve_refund_ix, create_deal_ix, fund_escrow_ix, release_milestone_ix, CreateDealAccounts,
    deal_pda, single_milestone, vault_pda,
};
use sealed_poc_tests::harness::{
    build_local_env, create_and_fund_deal, expect_failure, expect_success, setup_fee_config,
    Roles, ESCROW_SO_PATH,
};

fn roles_from_env() -> Roles {
    Roles::new()
}

// ── TRUE POSITIVE: fee bypass when config omitted ───────────────────────────

#[test]
fn poc_create_deal_without_config_fee_bypass() {
    let mut env = build_local_env(ESCROW_SO_PATH);
    let roles = roles_from_env();
    let config = setup_fee_config(&mut env, &roles.authority, roles.treasury_owner.pubkey());

    let deal_id = "fee-bypass";
    let amount = 1_000_000u64; // 1 USDC
    let (deal, _) = deal_pda(deal_id);
    let (vault, _) = vault_pda(deal_id);

    // Deliberately omit config → deal snapshots fee_bps=0 (TRUE POSITIVE).
    expect_success(
        &mut env,
        &[create_deal_ix(
            CreateDealAccounts {
                buyer: roles.buyer.pubkey(),
                seller: roles.seller.pubkey(),
                deal,
                mint: roles.mint,
                escrow_token_account: vault,
                config: None, // ← bypass
                creator_tier: None,
            },
            deal_id.to_string(),
            single_milestone(amount),
            amount,
            roles.buyer.pubkey(),
        )],
        &[&roles.buyer],
    )
    .expect("create_deal without config should succeed (documents fee bypass)");

    // Fund without treasury succeeds on a config-active platform.
    let buyer_ata = get_associated_token_address(&roles.buyer.pubkey(), &roles.mint);
    expect_success(
        &mut env,
        &[fund_escrow_ix(
            roles.buyer.pubkey(),
            deal,
            vault,
            buyer_ata,
            None, // no treasury needed — deal is fee-free
            spl_token::ID,
            amount,
        )],
        &[&roles.buyer],
    )
    .expect("fee-free deal funds without treasury even though global config has fees");

    let _ = config; // config exists on-chain but was bypassed at deal creation
    eprintln!("✓ TRUE POSITIVE: create_deal without config permanently fee-free");
}

// ── FALSE POSITIVES: attacks that must fail ─────────────────────────────────

#[test]
fn poc_wrong_vault_ata_for_deal() {
    let mut env = build_local_env(ESCROW_SO_PATH);
    let roles = roles_from_env();

    let deal_id = "vault-sub";
    let amount = 1_000_000u64;
    let (deal, real_vault) = create_and_fund_deal(
        &mut env,
        &roles.buyer,
        roles.seller.pubkey(),
        roles.mint,
        deal_id,
        amount,
        None,
    );

    let fake_vault = get_associated_token_address(&roles.stranger.pubkey(), &roles.mint);
    let buyer_ata = get_associated_token_address(&roles.buyer.pubkey(), &roles.mint);

    expect_failure(
        &mut env,
        &[fund_escrow_ix(
            roles.buyer.pubkey(),
            deal,
            fake_vault, // NOT deal.escrow_token_account
            buyer_ata,
            None,
            spl_token::ID,
            amount,
        )],
        &[&roles.buyer],
    )
    .expect("wrong vault must be rejected (ConstraintAddress ~2004)");

    let _ = real_vault;
    eprintln!("✓ FALSE POSITIVE CHECK: wrong_vault_ata_for_deal rejected");
}

#[test]
fn poc_wrong_token_program_pubkey() {
    let mut env = build_local_env(ESCROW_SO_PATH);
    let roles = roles_from_env();
    setup_fee_config(&mut env, &roles.authority, roles.treasury_owner.pubkey());

    let deal_id = "wrong-tok-prog";
    let amount = 1_000_000u64;
    let (deal, vault) = create_and_fund_deal(
        &mut env,
        &roles.buyer,
        roles.seller.pubkey(),
        roles.mint,
        deal_id,
        amount,
        None,
    );

    let seller_ata = get_associated_token_address(&roles.seller.pubkey(), &roles.mint);

    expect_failure(
        &mut env,
        &[release_milestone_ix(
            roles.buyer.pubkey(),
            deal,
            vault,
            seller_ata,
            None,
            system_program::ID, // NOT spl_token::ID
            0,
        )],
        &[&roles.buyer],
    )
    .expect("wrong token program must fail (InvalidProgramId / ConstraintOwner)");

    eprintln!("✓ FALSE POSITIVE CHECK: wrong_token_program_pubkey rejected");
}

#[test]
fn poc_non_party_calls_approve_refund() {
    let mut env = build_local_env(ESCROW_SO_PATH);
    let roles = roles_from_env();

    let deal_id = "non-party-refund";
    let amount = 1_000_000u64;
    let (deal, vault) = create_and_fund_deal(
        &mut env,
        &roles.buyer,
        roles.seller.pubkey(),
        roles.mint,
        deal_id,
        amount,
        None,
    );

    let buyer_ata = get_associated_token_address(&roles.buyer.pubkey(), &roles.mint);

    expect_failure(
        &mut env,
        &[approve_refund_ix(
            roles.stranger.pubkey(), // not buyer or seller
            deal,
            vault,
            buyer_ata,
            spl_token::ID,
        )],
        &[&roles.stranger],
    )
    .expect("non-party approve_refund must fail (UnauthorizedBuyer 6007)");

    eprintln!("✓ FALSE POSITIVE CHECK: non_party_calls_approve_refund rejected");
}

#[test]
fn poc_treasury_ata_wrong_owner_when_fees_active() {
    let mut env = build_local_env(ESCROW_SO_PATH);
    let roles = roles_from_env();
    let config = setup_fee_config(&mut env, &roles.authority, roles.treasury_owner.pubkey());

    let deal_id = "wrong-treasury";
    let amount = 1_000_000u64;
    let (deal, _) = deal_pda(deal_id);
    let (vault, _) = vault_pda(deal_id);
    let buyer_ata = get_associated_token_address(&roles.buyer.pubkey(), &roles.mint);
    let wrong_treasury_ata = get_associated_token_address(&roles.stranger.pubkey(), &roles.mint);

    expect_success(
        &mut env,
        &[create_deal_ix(
            CreateDealAccounts {
                buyer: roles.buyer.pubkey(),
                seller: roles.seller.pubkey(),
                deal,
                mint: roles.mint,
                escrow_token_account: vault,
                config: Some(config),
                creator_tier: None,
            },
            deal_id.to_string(),
            single_milestone(amount),
            amount,
            roles.buyer.pubkey(),
        )],
        &[&roles.buyer],
    )
    .expect("create_deal with config");

    expect_failure(
        &mut env,
        &[fund_escrow_ix(
            roles.buyer.pubkey(),
            deal,
            vault,
            buyer_ata,
            Some(wrong_treasury_ata), // stranger-owned, correct mint
            spl_token::ID,
            amount,
        )],
        &[&roles.buyer],
    )
    .expect("wrong treasury owner must fail (TreasuryAccountRequired 6018)");

    eprintln!("✓ FALSE POSITIVE CHECK: treasury_ata_wrong_owner_when_fees_active rejected");
}

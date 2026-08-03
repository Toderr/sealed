//! Security PoC integration tests — Neodyme solana-poc-framework + LocalEnvironment.
//!
//! Run (from repo root, after `anchor build`):
//!   cd poc-tests && cargo test -- --nocapture
//!
//! See `../POC_TESTS.md` for prerequisites and expected outcomes.

use escrow::state::MilestoneInput;
use poc_framework::solana_program::instruction::InstructionError;
use poc_framework::solana_program::system_program;
use poc_framework::solana_sdk::signature::Signer;
use poc_framework::spl_associated_token_account::get_associated_token_address;
use poc_framework::spl_token;
use poc_framework::Environment;

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

// ── Milestone sum overflow: aborts at create_deal, release unreachable ──────
//
// AUDIT/11 H-3 and AUDIT/12 Claims 3 + 12 assert that `.sum()` WRAPS: milestones
// [u64::MAX, 2] sum to 1, so `create_deal` with total_amount = 1 passes the
// MilestoneAmountMismatch check, the deal is created, and it only gets stuck
// later at `release_milestone` ("create OK, release stuck").
//
// `overflow-checks = true` (root Cargo.toml, present since commit f1f5be3) makes
// that sum abort instead. This test pins the real behavior: create_deal fails,
// nothing is persisted, and release_milestone is never reached.
//
// If this test ever fails at step 1, overflow-checks was turned off and the
// audit's wrap-based findings become live again.

#[test]
fn poc_milestone_sum_overflow_aborts_create_deal() {
    let mut env = build_local_env(ESCROW_SO_PATH);
    let roles = roles_from_env();

    let deal_id = "sum-overflow";
    // u64::MAX + 2 == 1 (mod 2^64) — the wrapped sum the audit relies on.
    let overflowing = vec![
        MilestoneInput {
            description: "wraps".to_string(),
            amount: u64::MAX,
        },
        MilestoneInput {
            description: "carry".to_string(),
            amount: 2,
        },
    ];
    let claimed_total = 1u64;

    let (deal, _) = deal_pda(deal_id);
    let (vault, _) = vault_pda(deal_id);
    let accounts = || CreateDealAccounts {
        buyer: roles.buyer.pubkey(),
        seller: roles.seller.pubkey(),
        deal,
        mint: roles.mint,
        escrow_token_account: vault,
        config: None,
        creator_tier: None,
    };

    let result = env.execute_as_transaction(
        &[create_deal_ix(
            accounts(),
            deal_id.to_string(),
            overflowing,
            claimed_total,
            roles.buyer.pubkey(),
        )],
        &[&roles.buyer],
    );
    let outcome = result.transaction.meta.as_ref().unwrap().err.clone();

    // 1. It must fail. With overflow-checks off the wrapped sum would equal
    //    claimed_total, the require! would pass, and this would SUCCEED.
    let err = outcome.expect(
        "create_deal SUCCEEDED — .sum() wrapped, so overflow-checks is off \
         and AUDIT/11 H-3 / AUDIT/12 Claim 3 are valid after all",
    );

    // 2. It must abort mid-instruction, not return MilestoneAmountMismatch
    //    (6002). A clean custom error would mean the sum completed and the
    //    require! caught the mismatch — a different, benign story.
    let is_abort = matches!(
        err,
        poc_framework::solana_sdk::transaction::TransactionError::InstructionError(
            _,
            InstructionError::ProgramFailedToComplete
        )
    );
    assert!(
        is_abort,
        "expected an overflow abort (ProgramFailedToComplete), got {err:?} — \
         if this is Custom(6002) the sum did not overflow"
    );

    // 3. Nothing was persisted: the same Deal PDA still accepts a well-formed
    //    deal, so there is no "state corruption" to release against.
    let amount = 1_000_000u64;
    expect_success(
        &mut env,
        &[create_deal_ix(
            accounts(),
            deal_id.to_string(),
            single_milestone(amount),
            amount,
            roles.buyer.pubkey(),
        )],
        &[&roles.buyer],
    )
    .expect("Deal PDA must be untouched after the aborted create_deal");

    eprintln!(
        "✓ overflow aborts create_deal ({err:?}); no Deal written, \
         release_milestone unreachable"
    );
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

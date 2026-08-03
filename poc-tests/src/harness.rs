//! LocalEnvironment bootstrap for escrow PoCs.

use std::path::Path;

use poc_framework::{
    keypair, setup_logging, Environment, LocalEnvironment, LogLevel, PrintableTransaction,
};
use poc_framework::solana_program::pubkey::Pubkey;
use poc_framework::solana_sdk::signature::{Keypair, Signer};

use crate::escrow_ix::ESCROW_PROGRAM_ID;

/// Default path to the compiled escrow program (after `anchor build`).
pub const ESCROW_SO_PATH: &str = "../target/deploy/escrow.so";

/// Well-known roles for readable transaction dumps (`Kooo…`, `Koo1…`, etc.).
pub struct Roles {
    pub authority: Keypair,
    pub buyer: Keypair,
    pub seller: Keypair,
    pub stranger: Keypair,
    pub treasury_owner: Keypair,
    pub mint: Pubkey,
}

impl Roles {
    pub fn new() -> Self {
        Self {
            authority: keypair(0),
            buyer: keypair(1),
            seller: keypair(2),
            stranger: keypair(3),
            treasury_owner: keypair(4),
            mint: keypair(5).pubkey(),
        }
    }
}

/// Build a funded local bank with SPL programs + escrow deployed from `.so`.
pub fn build_local_env(so_path: &str) -> LocalEnvironment {
    setup_logging(LogLevel::INFO);
    let roles = Roles::new();
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join(so_path);
    assert!(
        path.exists(),
        "escrow.so not found at {} — run `anchor build` from repo root first (WSL Ubuntu if macOS fails)",
        path.display()
    );

    let env = LocalEnvironment::builder()
        .add_account_with_lamports(
            roles.authority.pubkey(),
            poc_framework::solana_program::system_program::ID,
            poc_framework::solana_sdk::native_token::LAMPORTS_PER_SOL,
        )
        .add_account_with_lamports(
            roles.buyer.pubkey(),
            poc_framework::solana_program::system_program::ID,
            poc_framework::solana_sdk::native_token::LAMPORTS_PER_SOL,
        )
        .add_account_with_lamports(
            roles.seller.pubkey(),
            poc_framework::solana_program::system_program::ID,
            poc_framework::solana_sdk::native_token::LAMPORTS_PER_SOL / 2,
        )
        .add_account_with_lamports(
            roles.stranger.pubkey(),
            poc_framework::solana_program::system_program::ID,
            poc_framework::solana_sdk::native_token::LAMPORTS_PER_SOL / 4,
        )
        .add_account_with_lamports(
            roles.treasury_owner.pubkey(),
            poc_framework::solana_program::system_program::ID,
            poc_framework::solana_sdk::native_token::LAMPORTS_PER_SOL / 4,
        )
        .add_token_mint(roles.mint, Some(roles.authority.pubkey()), 0, 6, None)
        .add_associated_account_with_tokens(
            roles.buyer.pubkey(),
            roles.mint,
            10_000_000_000, // 10_000 USDC (6 decimals)
        )
        .add_associated_account_with_tokens(roles.seller.pubkey(), roles.mint, 0)
        .add_associated_account_with_tokens(roles.stranger.pubkey(), roles.mint, 0)
        .add_associated_account_with_tokens(roles.treasury_owner.pubkey(), roles.mint, 0)
        .add_program(ESCROW_PROGRAM_ID, &path)
        .build();

    env
}

/// Returns `Ok(())` when the transaction succeeded, `Err` with logs otherwise.
pub fn expect_success(
    env: &mut LocalEnvironment,
    instructions: &[poc_framework::solana_program::instruction::Instruction],
    signers: &[&Keypair],
) -> Result<(), String> {
    let result = env.execute_as_transaction(instructions, signers);
    if result.transaction.meta.as_ref().unwrap().err.is_some() {
        result.print();
        return Err(format!(
            "expected success, got {:?}",
            result.transaction.meta.as_ref().unwrap().err
        ));
    }
    Ok(())
}

/// Returns `Ok(())` when the transaction **failed** (negative test).
pub fn expect_failure(
    env: &mut LocalEnvironment,
    instructions: &[poc_framework::solana_program::instruction::Instruction],
    signers: &[&Keypair],
) -> Result<(), String> {
    let result = env.execute_as_transaction(instructions, signers);
    match result.transaction.meta.as_ref().unwrap().err {
        Some(_) => Ok(()),
        None => {
            result.print();
            Err("expected transaction failure, but it succeeded".into())
        }
    }
}

/// Initialize config + set treasury so fees are active (1% default from init).
pub fn setup_fee_config(
    env: &mut LocalEnvironment,
    authority: &Keypair,
    treasury_owner: Pubkey,
) -> Pubkey {
    use crate::escrow_ix::{config_pda, init_config_ix, set_treasury_ix};

    let (config, _) = config_pda();
    expect_success(
        env,
        &[init_config_ix(authority.pubkey(), config, 100)],
        &[authority],
    )
    .expect("init_config");
    expect_success(
        env,
        &[set_treasury_ix(
            authority.pubkey(),
            config,
            treasury_owner,
        )],
        &[authority],
    )
    .expect("set_treasury");
    config
}

/// Create a standard funded deal (no fee — config omitted).
pub fn create_and_fund_deal(
    env: &mut LocalEnvironment,
    buyer: &Keypair,
    seller: Pubkey,
    mint: Pubkey,
    deal_id: &str,
    amount: u64,
    include_config: Option<Pubkey>,
) -> (Pubkey, Pubkey) {
    use poc_framework::spl_associated_token_account::get_associated_token_address;

    use crate::escrow_ix::{
        create_deal_ix, fund_escrow_ix, single_milestone, CreateDealAccounts, deal_pda, vault_pda,
    };

    let (deal, _) = deal_pda(deal_id);
    let (vault, _) = vault_pda(deal_id);
    let buyer_ata = get_associated_token_address(&buyer.pubkey(), &mint);

    expect_success(
        env,
        &[create_deal_ix(
            CreateDealAccounts {
                buyer: buyer.pubkey(),
                seller,
                deal,
                mint,
                escrow_token_account: vault,
                config: include_config,
                creator_tier: None,
            },
            deal_id.to_string(),
            single_milestone(amount),
            amount,
            buyer.pubkey(),
        )],
        &[buyer],
    )
    .expect("create_deal");

    expect_success(
        env,
        &[fund_escrow_ix(
            buyer.pubkey(),
            deal,
            vault,
            buyer_ata,
            None,
            poc_framework::spl_token::ID,
            amount,
        )],
        &[buyer],
    )
    .expect("fund_escrow");

    (deal, vault)
}

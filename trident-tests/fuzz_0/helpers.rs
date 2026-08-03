//! Escrow-specific helpers for Trident fuzz tests.
//!
//! The checked-in IDL predates `creator_wallet`, `creator_tier`, and
//! `approve_refund`. Helpers here build instructions with the current on-chain
//! account layout. Re-run `anchor build && trident fuzz refresh fuzz_0` in WSL
//! to regenerate `types.rs` from a fresh IDL.

use borsh::BorshSerialize;
use trident_fuzz::fuzzing::*;

use crate::{assert_tx_failure, assert_tx_success};
use crate::fuzz_accounts::AccountAddresses;
use crate::types::escrow;
use crate::types::{MilestoneInput};

pub const TOKEN_PROGRAM: Pubkey = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
pub const SYSTEM_PROGRAM: Pubkey = pubkey!("11111111111111111111111111111111");
pub const RENT_SYSVAR: Pubkey = pubkey!("SysvarRent111111111111111111111111111111111");

pub const USDC_DECIMALS: u8 = 6;
pub const ONE_USDC: u64 = 1_000_000;

const CREATE_DEAL_DISC: [u8; 8] = [198, 212, 144, 151, 97, 56, 149, 113];
const APPROVE_REFUND_DISC: [u8; 8] = [133, 74, 53, 175, 88, 246, 218, 27];

pub fn config_pda() -> Pubkey {
    Pubkey::find_program_address(&[b"config"], &escrow::program_id()).0
}

pub fn deal_pda(deal_id: &str) -> Pubkey {
    Pubkey::find_program_address(&[b"deal", deal_id.as_bytes()], &escrow::program_id()).0
}

pub fn vault_pda(deal_id: &str) -> Pubkey {
    Pubkey::find_program_address(&[b"escrow-vault", deal_id.as_bytes()], &escrow::program_id()).0
}

pub fn sample_milestones(total: u64) -> Vec<MilestoneInput> {
    vec![MilestoneInput::new("Milestone 0".to_string(), total)]
}

/// Create SPL mint + fund buyer/seller ATAs. Returns `(mint, buyer, seller)`.
pub fn setup_token_environment(
    trident: &mut Trident,
    fuzz_accounts: &mut AccountAddresses,
) -> (Pubkey, Pubkey, Pubkey) {
    let payer = fuzz_accounts
        .authority
        .insert(trident, None);
    trident.airdrop(&payer, 50 * LAMPORTS_PER_SOL);

    let buyer = fuzz_accounts.buyer.insert(trident, None);
    let seller = fuzz_accounts.seller.insert(trident, None);
    trident.airdrop(&buyer, 10 * LAMPORTS_PER_SOL);
    trident.airdrop(&seller, 10 * LAMPORTS_PER_SOL);

    let mint = fuzz_accounts.mint.insert(trident, None);
    let init_mint_ixs = trident.initialize_mint(&payer, &mint, USDC_DECIMALS, &payer, None);
    let res = trident.process_transaction(&init_mint_ixs, Some("Init mint"));
    assert!(res.is_success(), "Init mint failed: {:#?}", res.get_result());

    let buyer_ata_ix = trident.initialize_associated_token_account(&payer, &mint, &buyer);
    let res = trident.process_transaction(&[buyer_ata_ix], Some("Buyer ATA"));
    assert!(res.is_success(), "Buyer ATA failed: {:#?}", res.get_result());

    let seller_ata_ix = trident.initialize_associated_token_account(&payer, &mint, &seller);
    let res = trident.process_transaction(&[seller_ata_ix], Some("Seller ATA"));
    assert!(res.is_success(), "Seller ATA failed: {:#?}", res.get_result());

    let buyer_ata = trident.get_associated_token_address(&mint, &buyer, &TOKEN_PROGRAM);
    fuzz_accounts
        .buyer_token_account
        .insert_with_address(buyer_ata);

    let seller_ata = trident.get_associated_token_address(&mint, &seller, &TOKEN_PROGRAM);
    fuzz_accounts
        .seller_token_account
        .insert_with_address(seller_ata);

    // Fund buyer with 10 USDC for escrow flows.
    let mint_to_ix = trident.mint_to(&buyer_ata, &mint, &payer, 10 * ONE_USDC);
    let res = trident.process_transaction(&[mint_to_ix], Some("Mint to buyer"));
    assert!(
        res.is_success(),
        "Mint to buyer failed: {:#?}",
        res.get_result()
    );

    (mint, buyer, seller)
}

pub fn init_config_if_needed(trident: &mut Trident, fuzz_accounts: &mut AccountAddresses) {
    let authority = fuzz_accounts
        .authority
        .get(trident)
        .expect("authority");
    let config = config_pda();
    fuzz_accounts.config.insert_with_address(config);

    if trident
        .get_account_with_type::<crate::types::Config>(&config, 8)
        .is_some()
    {
        return;
    }

    use crate::types::escrow::{
        InitConfigInstruction, InitConfigInstructionAccounts, InitConfigInstructionData,
    };

    let ix = InitConfigInstruction::data(InitConfigInstructionData::new(100))
        .accounts(InitConfigInstructionAccounts::new(authority, config))
        .instruction();

    let res = trident.process_transaction(&[ix], Some("InitConfig"));
    assert!(
        res.is_success(),
        "InitConfig failed: {:#?}",
        res.get_result()
    );
}

/// `create_deal` with current account layout (optional config / creator_tier omitted).
pub fn create_deal_ix(
    buyer: Pubkey,
    seller: Pubkey,
    mint: Pubkey,
    deal_id: &str,
    total_amount: u64,
    creator_wallet: Pubkey,
    include_config: bool,
) -> Instruction {
    let deal = deal_pda(deal_id);
    let vault = vault_pda(deal_id);
    let milestones = sample_milestones(total_amount);

    #[derive(BorshSerialize)]
    struct Args {
        deal_id: String,
        milestones: Vec<MilestoneInput>,
        total_amount: u64,
        creator_wallet: Pubkey,
    }

    let mut data = CREATE_DEAL_DISC.to_vec();
    Args {
        deal_id: deal_id.to_string(),
        milestones,
        total_amount,
        creator_wallet,
    }
    .serialize(&mut data)
    .unwrap();

    let mut metas = vec![
        AccountMeta::new(buyer, true),
        AccountMeta::new_readonly(seller, false),
        AccountMeta::new(deal, false),
        AccountMeta::new_readonly(mint, false),
        AccountMeta::new(vault, false),
    ];

    if include_config {
        metas.push(AccountMeta::new_readonly(config_pda(), false));
    }

    metas.push(AccountMeta::new_readonly(TOKEN_PROGRAM, false));
    metas.push(AccountMeta::new_readonly(SYSTEM_PROGRAM, false));
    metas.push(AccountMeta::new_readonly(RENT_SYSVAR, false));

    Instruction::new_with_bytes(escrow::program_id(), &data, metas)
}

/// `fund_escrow` — treasury account omitted when `treasury_ata` is `None`.
pub fn fund_escrow_ix(
    buyer: Pubkey,
    deal_id: &str,
    buyer_ata: Pubkey,
    amount: u64,
    treasury_ata: Option<Pubkey>,
) -> Instruction {
    let deal = deal_pda(deal_id);
    let vault = vault_pda(deal_id);
    let disc = [155u8, 18, 218, 141, 182, 213, 69, 201];
    let mut data = disc.to_vec();
    amount.serialize(&mut data).unwrap();

    let mut metas = vec![
        AccountMeta::new(buyer, true),
        AccountMeta::new(deal, false),
        AccountMeta::new(vault, false),
        AccountMeta::new(buyer_ata, false),
    ];

    if let Some(ta) = treasury_ata {
        metas.push(AccountMeta::new(ta, false));
    }

    metas.push(AccountMeta::new_readonly(TOKEN_PROGRAM, false));
    Instruction::new_with_bytes(escrow::program_id(), &data, metas)
}

pub fn release_milestone_ix(
    buyer: Pubkey,
    deal_id: &str,
    seller_ata: Pubkey,
    treasury_ata: Option<Pubkey>,
    milestone_index: u8,
) -> Instruction {
    let deal = deal_pda(deal_id);
    let vault = vault_pda(deal_id);
    let disc = [56u8, 2, 199, 164, 184, 108, 167, 222];
    let mut data = disc.to_vec();
    milestone_index.serialize(&mut data).unwrap();

    let mut metas = vec![
        AccountMeta::new(buyer, true),
        AccountMeta::new(deal, false),
        AccountMeta::new(vault, false),
        AccountMeta::new(seller_ata, false),
    ];

    if let Some(ta) = treasury_ata {
        metas.push(AccountMeta::new(ta, false));
    }

    metas.push(AccountMeta::new_readonly(TOKEN_PROGRAM, false));
    Instruction::new_with_bytes(escrow::program_id(), &data, metas)
}

pub fn approve_refund_ix(
    signer: Pubkey,
    deal_id: &str,
    buyer_ata: Pubkey,
) -> Instruction {
    let deal = deal_pda(deal_id);
    let vault = vault_pda(deal_id);

    #[derive(BorshSerialize)]
    struct Empty {}

    let mut data = APPROVE_REFUND_DISC.to_vec();
    Empty {}.serialize(&mut data).unwrap();

    let metas = vec![
        AccountMeta::new(signer, true),
        AccountMeta::new(deal, false),
        AccountMeta::new(vault, false),
        AccountMeta::new(buyer_ata, false),
        AccountMeta::new_readonly(TOKEN_PROGRAM, false),
    ];

    Instruction::new_with_bytes(escrow::program_id(), &data, metas)
}

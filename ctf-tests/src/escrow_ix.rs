//! Raw instruction builders for the escrow program (matches on-chain layout).

use borsh::{BorshDeserialize, BorshSerialize};
use solana_sdk::instruction::{AccountMeta, Instruction};
use solana_sdk::pubkey::Pubkey;

use crate::{ESCROW_PROGRAM_ID, RENT_SYSVAR, SYSTEM_PROGRAM, TOKEN_PROGRAM};

const INIT_CONFIG_DISC: [u8; 8] = [23, 235, 115, 232, 168, 96, 1, 231];
const SET_TREASURY_DISC: [u8; 8] = [57, 97, 196, 95, 195, 206, 106, 136];
const CREATE_DEAL_DISC: [u8; 8] = [198, 212, 144, 151, 97, 56, 149, 113];
const FUND_ESCROW_DISC: [u8; 8] = [155, 18, 218, 141, 182, 213, 69, 201];

#[derive(BorshSerialize, BorshDeserialize, Clone)]
pub struct MilestoneInput {
    pub description: String,
    pub amount: u64,
}

pub fn config_pda() -> Pubkey {
    Pubkey::find_program_address(&[b"config"], &ESCROW_PROGRAM_ID).0
}

pub fn deal_pda(deal_id: &str) -> Pubkey {
    Pubkey::find_program_address(&[b"deal", deal_id.as_bytes()], &ESCROW_PROGRAM_ID).0
}

pub fn vault_pda(deal_id: &str) -> Pubkey {
    Pubkey::find_program_address(&[b"escrow-vault", deal_id.as_bytes()], &ESCROW_PROGRAM_ID).0
}

pub fn sample_milestones(total: u64) -> Vec<MilestoneInput> {
    vec![MilestoneInput {
        description: "Milestone 0".to_string(),
        amount: total,
    }]
}

pub fn init_config_ix(authority: Pubkey, fee_bps: u16) -> Instruction {
    let config = config_pda();
    let mut data = INIT_CONFIG_DISC.to_vec();
    fee_bps.serialize(&mut data).unwrap();

    let metas = vec![
        AccountMeta::new(authority, true),
        AccountMeta::new(config, false),
        AccountMeta::new_readonly(SYSTEM_PROGRAM, false),
    ];

    Instruction::new_with_bytes(ESCROW_PROGRAM_ID, &data, metas)
}

pub fn set_treasury_ix(authority: Pubkey, treasury: Pubkey) -> Instruction {
    let config = config_pda();
    let mut data = SET_TREASURY_DISC.to_vec();
    treasury.serialize(&mut data).unwrap();

    let metas = vec![
        AccountMeta::new_readonly(authority, true),
        AccountMeta::new(config, false),
    ];

    Instruction::new_with_bytes(ESCROW_PROGRAM_ID, &data, metas)
}

/// `create_deal` — pass `include_config: false` to exercise the fee-bypass path.
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

    Instruction::new_with_bytes(ESCROW_PROGRAM_ID, &data, metas)
}

pub fn fund_escrow_ix(
    buyer: Pubkey,
    deal_id: &str,
    buyer_ata: Pubkey,
    amount: u64,
    escrow_vault: Pubkey,
    treasury_ata: Option<Pubkey>,
) -> Instruction {
    let deal = deal_pda(deal_id);
    let mut data = FUND_ESCROW_DISC.to_vec();
    amount.serialize(&mut data).unwrap();

    let mut metas = vec![
        AccountMeta::new(buyer, true),
        AccountMeta::new(deal, false),
        AccountMeta::new(escrow_vault, false),
        AccountMeta::new(buyer_ata, false),
    ];

    if let Some(ta) = treasury_ata {
        metas.push(AccountMeta::new(ta, false));
    }

    metas.push(AccountMeta::new_readonly(TOKEN_PROGRAM, false));
    Instruction::new_with_bytes(ESCROW_PROGRAM_ID, &data, metas)
}

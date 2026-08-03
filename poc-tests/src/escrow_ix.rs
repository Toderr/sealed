//! Manual Anchor instruction builders for the escrow program.
//!
//! Uses `escrow` crate types for Borsh-compatible serialization. Account metas are
//! assembled explicitly so PoCs can pass malicious/wrong accounts on purpose.

use anchor_lang::InstructionData;
use escrow::state::MilestoneInput;
use poc_framework::solana_program::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    system_program,
    sysvar,
};
use poc_framework::spl_token;

/// Escrow program ID (devnet / local PoC default).
pub const ESCROW_PROGRAM_ID: Pubkey =
    poc_framework::solana_sdk::pubkey!("3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ");

pub fn config_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"config"], &ESCROW_PROGRAM_ID)
}

pub fn deal_pda(deal_id: &str) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"deal", deal_id.as_bytes()], &ESCROW_PROGRAM_ID)
}

pub fn vault_pda(deal_id: &str) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"escrow-vault", deal_id.as_bytes()], &ESCROW_PROGRAM_ID)
}

pub fn creator_tier_pda(wallet: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"tier", wallet.as_ref()], &ESCROW_PROGRAM_ID)
}

/// Anchor convention: optional account omitted → pass the program id.
pub fn optional_none(program_id: &Pubkey) -> Pubkey {
    *program_id
}

pub fn init_config_ix(authority: Pubkey, config: Pubkey, fee_bps: u16) -> Instruction {
    Instruction {
        program_id: ESCROW_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(authority, true),
            AccountMeta::new(config, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: escrow::instruction::InitConfig { fee_bps }.data(),
    }
}

pub fn set_treasury_ix(authority: Pubkey, config: Pubkey, treasury: Pubkey) -> Instruction {
    Instruction {
        program_id: ESCROW_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new_readonly(authority, true),
            AccountMeta::new(config, false),
        ],
        data: escrow::instruction::SetTreasury { treasury }.data(),
    }
}

pub struct CreateDealAccounts {
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub deal: Pubkey,
    pub mint: Pubkey,
    pub escrow_token_account: Pubkey,
    /// `None` → omit config (fee bypass PoC). `Some` → include config PDA.
    pub config: Option<Pubkey>,
    /// `None` → omit creator tier. `Some` → include tier PDA.
    pub creator_tier: Option<Pubkey>,
}

pub fn create_deal_ix(
    accounts: CreateDealAccounts,
    deal_id: String,
    milestones: Vec<MilestoneInput>,
    total_amount: u64,
    creator_wallet: Pubkey,
) -> Instruction {
    let mut metas = vec![
        AccountMeta::new(accounts.buyer, true),
        AccountMeta::new_readonly(accounts.seller, false),
        AccountMeta::new(accounts.deal, false),
        AccountMeta::new_readonly(accounts.mint, false),
        AccountMeta::new(accounts.escrow_token_account, false),
    ];

    match accounts.config {
        Some(config) => metas.push(AccountMeta::new_readonly(config, false)),
        None => metas.push(AccountMeta::new_readonly(ESCROW_PROGRAM_ID, false)),
    }

    match accounts.creator_tier {
        Some(tier) => metas.push(AccountMeta::new_readonly(tier, false)),
        None => metas.push(AccountMeta::new_readonly(ESCROW_PROGRAM_ID, false)),
    }

    metas.extend([
        AccountMeta::new_readonly(spl_token::ID, false),
        AccountMeta::new_readonly(system_program::ID, false),
        AccountMeta::new_readonly(sysvar::rent::ID, false),
    ]);

    Instruction {
        program_id: ESCROW_PROGRAM_ID,
        accounts: metas,
        data: escrow::instruction::CreateDeal {
            deal_id,
            milestones,
            total_amount,
            creator_wallet,
        }
        .data(),
    }
}

pub fn fund_escrow_ix(
    buyer: Pubkey,
    deal: Pubkey,
    escrow_token_account: Pubkey,
    buyer_token_account: Pubkey,
    treasury_token_account: Option<Pubkey>,
    token_program: Pubkey,
    amount: u64,
) -> Instruction {
    let mut metas = vec![
        AccountMeta::new(buyer, true),
        AccountMeta::new(deal, false),
        AccountMeta::new(escrow_token_account, false),
        AccountMeta::new(buyer_token_account, false),
    ];

    match treasury_token_account {
        Some(ta) => metas.push(AccountMeta::new(ta, false)),
        None => metas.push(AccountMeta::new_readonly(ESCROW_PROGRAM_ID, false)),
    }

    metas.push(AccountMeta::new_readonly(token_program, false));

    Instruction {
        program_id: ESCROW_PROGRAM_ID,
        accounts: metas,
        data: escrow::instruction::FundEscrow { amount }.data(),
    }
}

pub fn release_milestone_ix(
    buyer: Pubkey,
    deal: Pubkey,
    escrow_token_account: Pubkey,
    seller_token_account: Pubkey,
    treasury_token_account: Option<Pubkey>,
    token_program: Pubkey,
    milestone_index: u8,
) -> Instruction {
    let mut metas = vec![
        AccountMeta::new(buyer, true),
        AccountMeta::new(deal, false),
        AccountMeta::new(escrow_token_account, false),
        AccountMeta::new(seller_token_account, false),
    ];

    match treasury_token_account {
        Some(ta) => metas.push(AccountMeta::new(ta, false)),
        None => metas.push(AccountMeta::new_readonly(ESCROW_PROGRAM_ID, false)),
    }

    metas.push(AccountMeta::new_readonly(token_program, false));

    Instruction {
        program_id: ESCROW_PROGRAM_ID,
        accounts: metas,
        data: escrow::instruction::ReleaseMilestone { milestone_index }.data(),
    }
}

pub fn approve_refund_ix(
    signer: Pubkey,
    deal: Pubkey,
    escrow_token_account: Pubkey,
    buyer_token_account: Pubkey,
    token_program: Pubkey,
) -> Instruction {
    Instruction {
        program_id: ESCROW_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(signer, true),
            AccountMeta::new(deal, false),
            AccountMeta::new(escrow_token_account, false),
            AccountMeta::new(buyer_token_account, false),
            AccountMeta::new_readonly(token_program, false),
        ],
        data: escrow::instruction::ApproveRefund {}.data(),
    }
}

/// One milestone covering the full deal amount (common PoC setup).
pub fn single_milestone(amount: u64) -> Vec<MilestoneInput> {
    vec![MilestoneInput {
        description: "PoC milestone".to_string(),
        amount,
    }]
}

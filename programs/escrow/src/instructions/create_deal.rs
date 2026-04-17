use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::error::EscrowError;
use crate::state::*;

#[derive(Accounts)]
#[instruction(deal_id: String)]
pub struct CreateDeal<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: Seller wallet, validated by the buyer
    pub seller: UncheckedAccount<'info>,

    #[account(
        init,
        payer = buyer,
        space = 8 + Deal::INIT_SPACE,
        seeds = [b"deal", deal_id.as_bytes()],
        bump,
    )]
    pub deal: Account<'info, Deal>,

    /// USDC mint
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = buyer,
        token::mint = mint,
        token::authority = deal,
        seeds = [b"escrow-vault", deal_id.as_bytes()],
        bump,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<CreateDeal>,
    deal_id: String,
    milestones: Vec<MilestoneInput>,
    total_amount: u64,
) -> Result<()> {
    require!(deal_id.len() <= 32, EscrowError::DealIdTooLong);
    require!(milestones.len() <= 10, EscrowError::TooManyMilestones);

    let milestone_sum: u64 = milestones.iter().map(|m| m.amount).sum();
    require!(
        milestone_sum == total_amount,
        EscrowError::MilestoneAmountMismatch
    );

    let deal = &mut ctx.accounts.deal;
    deal.deal_id = deal_id;
    deal.buyer = ctx.accounts.buyer.key();
    deal.seller = ctx.accounts.seller.key();
    deal.mint = ctx.accounts.mint.key();
    deal.escrow_token_account = ctx.accounts.escrow_token_account.key();
    deal.total_amount = total_amount;
    deal.funded_amount = 0;
    deal.released_amount = 0;
    deal.status = DealStatus::Created;
    deal.milestones = milestones
        .into_iter()
        .map(|m| Milestone {
            description: m.description,
            amount: m.amount,
            status: MilestoneStatus::Pending,
            confirmed_by: None,
            confirmed_at: None,
        })
        .collect();
    deal.created_at = Clock::get()?.unix_timestamp;
    deal.updated_at = deal.created_at;
    deal.bump = ctx.bumps.deal;

    msg!("Deal created: {}", deal.deal_id);
    Ok(())
}

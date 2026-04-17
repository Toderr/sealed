use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::error::EscrowError;
use crate::state::*;

#[derive(Accounts)]
pub struct FundEscrow<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        has_one = buyer @ EscrowError::UnauthorizedBuyer,
        constraint = deal.status == DealStatus::Created || deal.status == DealStatus::Funded @ EscrowError::InvalidDealStatus,
    )]
    pub deal: Account<'info, Deal>,

    #[account(
        mut,
        address = deal.escrow_token_account,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = buyer_token_account.owner == buyer.key(),
        constraint = buyer_token_account.mint == deal.mint,
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<FundEscrow>, amount: u64) -> Result<()> {
    let deal = &mut ctx.accounts.deal;

    require!(
        deal.funded_amount + amount <= deal.total_amount,
        EscrowError::OverFunding
    );

    // Transfer USDC from buyer to escrow
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.buyer_token_account.to_account_info(),
            to: ctx.accounts.escrow_token_account.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, amount)?;

    deal.funded_amount += amount;
    if deal.funded_amount == deal.total_amount {
        deal.status = DealStatus::Funded;
    }
    deal.updated_at = Clock::get()?.unix_timestamp;

    msg!("Escrow funded: {} USDC", amount);
    Ok(())
}

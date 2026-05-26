use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount, Transfer};

use crate::error::EscrowError;
use crate::state::*;

pub const TIMEOUT_SECONDS: i64 = 30 * 24 * 60 * 60; // 30 days

#[derive(Accounts)]
pub struct BuyerTimeoutRefund<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        has_one = buyer @ EscrowError::UnauthorizedBuyer,
        constraint = deal.status == DealStatus::Funded || deal.status == DealStatus::InProgress @ EscrowError::InvalidDealStatus,
        close = buyer,
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

pub fn handler(ctx: Context<BuyerTimeoutRefund>) -> Result<()> {
    let deal = &mut ctx.accounts.deal;

    let now = Clock::get()?.unix_timestamp;
    require!(deal.funded_at > 0, EscrowError::InvalidDealStatus);
    require!(
        now >= deal.funded_at + TIMEOUT_SECONDS,
        EscrowError::TimeoutNotReached
    );

    let refund_amount = deal.funded_amount.saturating_sub(deal.released_amount);
    require!(refund_amount > 0, EscrowError::InsufficientFunds);

    let deal_id = deal.deal_id.clone();
    let bump = deal.bump;

    let seeds = &[b"deal".as_ref(), deal_id.as_bytes(), &[bump]];
    let signer_seeds = &[&seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow_token_account.to_account_info(),
                to: ctx.accounts.buyer_token_account.to_account_info(),
                authority: deal.to_account_info(),
            },
            signer_seeds,
        ),
        refund_amount,
    )?;

    token::close_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.escrow_token_account.to_account_info(),
                destination: ctx.accounts.buyer.to_account_info(),
                authority: deal.to_account_info(),
            },
            signer_seeds,
        ),
    )?;

    deal.status = DealStatus::Refunded;
    deal.updated_at = now;

    msg!("Buyer timeout refund: {} lamports", refund_amount);
    Ok(())
}

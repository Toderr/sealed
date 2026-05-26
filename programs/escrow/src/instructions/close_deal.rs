use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount};

use crate::error::EscrowError;
use crate::state::*;

#[derive(Accounts)]
pub struct CloseDeal<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        has_one = buyer @ EscrowError::UnauthorizedBuyer,
        constraint = deal.status == DealStatus::Completed || deal.status == DealStatus::Refunded @ EscrowError::InvalidDealStatus,
        close = buyer,
    )]
    pub deal: Account<'info, Deal>,

    #[account(
        mut,
        address = deal.escrow_token_account,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<CloseDeal>) -> Result<()> {
    let deal = &ctx.accounts.deal;
    let deal_id = deal.deal_id.clone();
    let bump = deal.bump;

    let seeds = &[b"deal".as_ref(), deal_id.as_bytes(), &[bump]];
    let signer_seeds = &[&seeds[..]];

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

    msg!("Deal closed and rent reclaimed: {}", deal_id);
    Ok(())
}

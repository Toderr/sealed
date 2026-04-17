use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::error::EscrowError;
use crate::state::*;

#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(
        mut,
        has_one = buyer @ EscrowError::UnauthorizedBuyer,
        has_one = seller @ EscrowError::UnauthorizedSeller,
        constraint = deal.status != DealStatus::Completed @ EscrowError::InvalidDealStatus,
        constraint = deal.status != DealStatus::Refunded @ EscrowError::InvalidDealStatus,
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

pub fn handler(ctx: Context<Refund>) -> Result<()> {
    let deal = &mut ctx.accounts.deal;

    let refund_amount = deal.funded_amount - deal.released_amount;
    require!(refund_amount > 0, EscrowError::InsufficientFunds);

    let deal_id = deal.deal_id.clone();
    let bump = deal.bump;

    // Transfer remaining funds back to buyer
    let seeds = &[b"deal".as_ref(), deal_id.as_bytes(), &[bump]];
    let signer_seeds = &[&seeds[..]];

    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.buyer_token_account.to_account_info(),
            authority: deal.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(transfer_ctx, refund_amount)?;

    deal.status = DealStatus::Refunded;
    deal.updated_at = Clock::get()?.unix_timestamp;

    msg!("Refund processed: {} USDC", refund_amount);
    Ok(())
}

use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount, Transfer};

use crate::error::EscrowError;
use crate::state::*;

#[derive(Accounts)]
pub struct CancelDeal<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        has_one = buyer @ EscrowError::UnauthorizedBuyer,
        constraint = deal.status == DealStatus::Created @ EscrowError::InvalidDealStatus,
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

pub fn handler(ctx: Context<CancelDeal>) -> Result<()> {
    let deal = &mut ctx.accounts.deal;
    let refund_amount = deal.funded_amount.saturating_sub(deal.released_amount);
    let deal_id = deal.deal_id.clone();
    let bump = deal.bump;

    let seeds = &[b"deal".as_ref(), deal_id.as_bytes(), &[bump]];
    let signer_seeds = &[&seeds[..]];

    // Return any partial funding to buyer before closing
    if refund_amount > 0 {
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
    }

    // Close the escrow token account, sending rent to buyer
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

    msg!("Deal cancelled: {}", deal_id);
    Ok(())
}

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::error::EscrowError;
use crate::state::*;

// Two-step mutual refund.
//
// The old `refund` instruction required buyer AND seller as signers on the SAME
// transaction. That can't work in practice: the two parties sign from different
// devices minutes or hours apart, while a recent blockhash dies in ~90 seconds,
// so the second signer always hit "Blockhash not found".
//
// Here each party calls `approve_refund` in their OWN transaction. The first call
// just records that side's approval; the call that completes the pair performs the
// transfer and closes the deal out as Refunded. No shared transaction, no partial
// signing, no expiry window, no relay.
//
// Either party may call first, and calling twice is harmless (idempotent).

#[derive(Accounts)]
pub struct ApproveRefund<'info> {
    /// The approving party — must be the deal's buyer or seller.
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        constraint = deal.status != DealStatus::Completed @ EscrowError::InvalidDealStatus,
        constraint = deal.status != DealStatus::Refunded @ EscrowError::InvalidDealStatus,
    )]
    pub deal: Account<'info, Deal>,

    #[account(
        mut,
        address = deal.escrow_token_account,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    /// Buyer's USDC account — the refund destination. Validated against the deal's
    /// buyer + mint, so the caller can't redirect funds.
    #[account(
        mut,
        constraint = buyer_token_account.owner == deal.buyer @ EscrowError::UnauthorizedBuyer,
        constraint = buyer_token_account.mint == deal.mint,
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ApproveRefund>) -> Result<()> {
    let signer_key = ctx.accounts.signer.key();
    let deal = &mut ctx.accounts.deal;

    // Record this party's approval. Only the two counterparties may approve.
    if signer_key == deal.buyer {
        deal.buyer_refund_ok = true;
    } else if signer_key == deal.seller {
        deal.seller_refund_ok = true;
    } else {
        return err!(EscrowError::UnauthorizedBuyer);
    }
    deal.updated_at = Clock::get()?.unix_timestamp;

    // Still waiting on the other side — record and stop here.
    if !(deal.buyer_refund_ok && deal.seller_refund_ok) {
        msg!(
            "Refund approved by {} — awaiting the counterparty",
            if signer_key == deal.buyer { "buyer" } else { "seller" }
        );
        return Ok(());
    }

    // Both approved: return whatever hasn't been released to the buyer.
    let refund_amount = deal
        .funded_amount
        .checked_sub(deal.released_amount)
        .ok_or(EscrowError::MathOverflow)?;
    require!(refund_amount > 0, EscrowError::InsufficientFunds);

    let deal_id = deal.deal_id.clone();
    let bump = deal.bump;
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

    msg!("Mutual refund completed: {} USDC returned to buyer", refund_amount);
    Ok(())
}

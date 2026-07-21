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

    /// Treasury token account — required only when the deal charges a fee.
    /// Validated in the handler against deal.treasury + mint.
    #[account(mut)]
    pub treasury_token_account: Option<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<FundEscrow>, amount: u64) -> Result<()> {
    let deal = &mut ctx.accounts.deal;

    require!(
        deal.funded_amount + amount <= deal.total_amount,
        EscrowError::OverFunding
    );

    // Transfer the contract amount from buyer → escrow vault.
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.buyer_token_account.to_account_info(),
            to: ctx.accounts.escrow_token_account.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, amount)?;

    // Charge the buyer's fee half ONCE, to the treasury. Only when the deal
    // carries a fee; skipped entirely for fee-free deals (no treasury needed).
    if deal.has_fee() && !deal.buyer_fee_paid {
        let buyer_fee = deal.half_fee(deal.total_amount);
        if buyer_fee > 0 {
            let treasury_ta = ctx
                .accounts
                .treasury_token_account
                .as_ref()
                .ok_or(EscrowError::TreasuryAccountRequired)?;
            // The treasury account must belong to the snapshotted treasury + mint.
            require!(
                treasury_ta.owner == deal.treasury && treasury_ta.mint == deal.mint,
                EscrowError::TreasuryAccountRequired
            );
            let fee_ctx = CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.buyer_token_account.to_account_info(),
                    to: treasury_ta.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            );
            token::transfer(fee_ctx, buyer_fee)?;
            msg!("Buyer fee charged: {} USDC", buyer_fee);
        }
        deal.buyer_fee_paid = true;
    }

    let now = Clock::get()?.unix_timestamp;
    deal.funded_amount += amount;
    if deal.funded_amount == deal.total_amount {
        deal.status = DealStatus::Funded;
        deal.funded_at = now;
    }
    // More money in escrow changes what a mutual refund would return, so a
    // standing approval no longer reflects consent to the current amount.
    deal.buyer_refund_ok = false;
    deal.seller_refund_ok = false;
    deal.updated_at = now;

    msg!("Escrow funded: {} USDC", amount);
    Ok(())
}

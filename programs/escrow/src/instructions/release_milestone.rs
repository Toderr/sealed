use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::error::EscrowError;
use crate::state::*;

#[derive(Accounts)]
pub struct ReleaseMilestone<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        has_one = buyer @ EscrowError::UnauthorizedBuyer,
        constraint = deal.status == DealStatus::Funded || deal.status == DealStatus::InProgress @ EscrowError::InvalidDealStatus,
    )]
    pub deal: Account<'info, Deal>,

    #[account(
        mut,
        address = deal.escrow_token_account,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = seller_token_account.owner == deal.seller,
        constraint = seller_token_account.mint == deal.mint,
    )]
    pub seller_token_account: Account<'info, TokenAccount>,

    /// Treasury token account — required only when the deal charges a fee.
    /// Validated in the handler against deal.treasury + mint.
    #[account(mut)]
    pub treasury_token_account: Option<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ReleaseMilestone>, milestone_index: u8) -> Result<()> {
    let deal = &mut ctx.accounts.deal;
    let index = milestone_index as usize;

    require!(index < deal.milestones.len(), EscrowError::InvalidMilestoneIndex);
    require!(
        deal.milestones[index].status == MilestoneStatus::Pending,
        EscrowError::InvalidMilestoneStatus
    );

    let amount = deal.milestones[index].amount;
    let deal_id = deal.deal_id.clone();
    let bump = deal.bump;

    // Seller's fee half comes out of this milestone; the rest goes to the seller.
    let seller_fee = if deal.has_fee() { deal.half_fee(amount) } else { 0 };
    let seller_net = amount.checked_sub(seller_fee).ok_or(EscrowError::MathOverflow)?;
    let deal_treasury = deal.treasury;
    let deal_mint = deal.mint;

    let seeds = &[b"deal".as_ref(), deal_id.as_bytes(), &[bump]];
    let signer_seeds = &[&seeds[..]];

    // Transfer the seller's net share from the vault (PDA-signed).
    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.seller_token_account.to_account_info(),
            authority: deal.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(transfer_ctx, seller_net)?;

    // Transfer the seller fee to the treasury (PDA-signed), when charged.
    if seller_fee > 0 {
        let treasury_ta = ctx
            .accounts
            .treasury_token_account
            .as_ref()
            .ok_or(EscrowError::TreasuryAccountRequired)?;
        require!(
            treasury_ta.owner == deal_treasury && treasury_ta.mint == deal_mint,
            EscrowError::TreasuryAccountRequired
        );
        let fee_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow_token_account.to_account_info(),
                to: treasury_ta.to_account_info(),
                authority: deal.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(fee_ctx, seller_fee)?;
        msg!("Seller fee charged: {} USDC", seller_fee);
    }

    // Update milestone status
    deal.milestones[index].status = MilestoneStatus::Released;
    deal.milestones[index].confirmed_by = Some(ctx.accounts.buyer.key());
    deal.milestones[index].confirmed_at = Some(Clock::get()?.unix_timestamp);
    deal.released_amount += amount;

    // Check if all milestones are released
    let all_released = deal.milestones.iter().all(|m| m.status == MilestoneStatus::Released);
    if all_released {
        deal.status = DealStatus::Completed;
    } else {
        deal.status = DealStatus::InProgress;
    }
    deal.updated_at = Clock::get()?.unix_timestamp;

    msg!("Milestone {} released: {} USDC", milestone_index, amount);
    Ok(())
}

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

    // Transfer from escrow to seller using PDA signer seeds
    let seeds = &[b"deal".as_ref(), deal_id.as_bytes(), &[bump]];
    let signer_seeds = &[&seeds[..]];

    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.seller_token_account.to_account_info(),
            authority: deal.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(transfer_ctx, amount)?;

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

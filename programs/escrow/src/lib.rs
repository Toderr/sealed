use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;
use state::MilestoneInput;

declare_id!("3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ");

#[program]
pub mod escrow {
    use super::*;

    /// Create a new deal with milestones and escrow parameters
    pub fn create_deal(
        ctx: Context<CreateDeal>,
        deal_id: String,
        milestones: Vec<MilestoneInput>,
        total_amount: u64,
    ) -> Result<()> {
        instructions::create_deal::handler(ctx, deal_id, milestones, total_amount)
    }

    /// Fund the escrow with USDC
    pub fn fund_escrow(ctx: Context<FundEscrow>, amount: u64) -> Result<()> {
        instructions::fund_escrow::handler(ctx, amount)
    }

    /// Release funds for a completed milestone
    pub fn release_milestone(ctx: Context<ReleaseMilestone>, milestone_index: u8) -> Result<()> {
        instructions::release_milestone::handler(ctx, milestone_index)
    }

    /// Refund remaining funds to buyer (requires both signatures)
    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        instructions::refund::handler(ctx)
    }

    /// Cancel an unfunded deal, close accounts, reclaim rent (buyer only)
    pub fn cancel_deal(ctx: Context<CancelDeal>) -> Result<()> {
        instructions::cancel_deal::handler(ctx)
    }

    /// Unilateral refund after 30-day inactivity timeout (buyer only, no seller required)
    pub fn buyer_timeout_refund(ctx: Context<BuyerTimeoutRefund>) -> Result<()> {
        instructions::buyer_timeout_refund::handler(ctx)
    }

    /// Close a completed or refunded deal, reclaim escrow vault rent (buyer only)
    pub fn close_deal(ctx: Context<CloseDeal>) -> Result<()> {
        instructions::close_deal::handler(ctx)
    }
}

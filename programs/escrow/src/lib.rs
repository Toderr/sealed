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

    /// Initialize the global platform config (fee + treasury + authority). Once.
    pub fn init_config(ctx: Context<InitConfig>, fee_bps: u16) -> Result<()> {
        instructions::config::init_config(ctx, fee_bps)
    }

    /// Change the platform fee in basis points (authority only)
    pub fn set_fee(ctx: Context<UpdateConfig>, fee_bps: u16) -> Result<()> {
        instructions::config::set_fee(ctx, fee_bps)
    }

    /// Change the treasury address (authority only)
    pub fn set_treasury(ctx: Context<UpdateConfig>, treasury: Pubkey) -> Result<()> {
        instructions::config::set_treasury(ctx, treasury)
    }

    /// Transfer the config authority to a new wallet (authority only)
    pub fn set_authority(ctx: Context<UpdateConfig>, new_authority: Pubkey) -> Result<()> {
        instructions::config::set_authority(ctx, new_authority)
    }

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

    /// Refund remaining funds to buyer (requires both signatures in ONE tx).
    /// Superseded by `approve_refund` — kept for compatibility with any deal
    /// mid-flight under the old flow.
    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        instructions::refund::handler(ctx)
    }

    /// Mutual refund, two-step: each party approves in their OWN transaction and
    /// the refund executes once both have. Avoids the ~90s blockhash expiry that
    /// made the single shared co-signed transaction unusable in practice.
    pub fn approve_refund(ctx: Context<ApproveRefund>) -> Result<()> {
        instructions::approve_refund::handler(ctx)
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

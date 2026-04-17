use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowError {
    #[msg("Deal ID too long (max 32 characters)")]
    DealIdTooLong,
    #[msg("Too many milestones (max 10)")]
    TooManyMilestones,
    #[msg("Milestone amounts don't sum to total deal amount")]
    MilestoneAmountMismatch,
    #[msg("Deal is not in the correct status for this operation")]
    InvalidDealStatus,
    #[msg("Milestone index out of bounds")]
    InvalidMilestoneIndex,
    #[msg("Milestone is not in the correct status")]
    InvalidMilestoneStatus,
    #[msg("Insufficient funds in escrow")]
    InsufficientFunds,
    #[msg("Unauthorized: only the buyer can perform this action")]
    UnauthorizedBuyer,
    #[msg("Unauthorized: only the seller can perform this action")]
    UnauthorizedSeller,
    #[msg("Funding amount exceeds remaining balance")]
    OverFunding,
}

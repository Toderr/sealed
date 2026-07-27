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
    #[msg("30-day timeout period has not elapsed yet")]
    TimeoutNotReached,
    #[msg("Unauthorized: only the config authority can perform this action")]
    UnauthorizedAuthority,
    #[msg("Fee exceeds the maximum allowed (5%)")]
    FeeTooHigh,
    #[msg("Too many tiers configured (max 16)")]
    TooManyTiers,
    #[msg("Duplicate tier id — each tier id must be unique")]
    DuplicateTierId,
    #[msg("No tier with that id exists in the platform config")]
    UnknownTierId,
    #[msg("The named creator is not a party to this deal")]
    InvalidCreator,
    #[msg("Account could not be deserialized")]
    AccountDidNotDeserialize,
    #[msg("This deal charges a fee; the correct treasury token account is required")]
    TreasuryAccountRequired,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}

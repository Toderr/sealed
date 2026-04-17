use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Deal {
    /// Unique deal identifier
    #[max_len(32)]
    pub deal_id: String,
    /// Buyer (funds the escrow)
    pub buyer: Pubkey,
    /// Seller (receives milestone payments)
    pub seller: Pubkey,
    /// USDC mint address
    pub mint: Pubkey,
    /// Escrow token account (PDA-owned)
    pub escrow_token_account: Pubkey,
    /// Total deal amount in USDC (lamports)
    pub total_amount: u64,
    /// Amount currently funded
    pub funded_amount: u64,
    /// Amount already released
    pub released_amount: u64,
    /// Deal status
    pub status: DealStatus,
    /// Milestones (max 10)
    #[max_len(10)]
    pub milestones: Vec<Milestone>,
    /// Creation timestamp
    pub created_at: i64,
    /// Last updated timestamp
    pub updated_at: i64,
    /// Bump seed for PDA
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct Milestone {
    /// Milestone description
    #[max_len(128)]
    pub description: String,
    /// Amount to release for this milestone
    pub amount: u64,
    /// Status of this milestone
    pub status: MilestoneStatus,
    /// Who confirmed completion (buyer confirms seller delivered)
    pub confirmed_by: Option<Pubkey>,
    /// Confirmation timestamp
    pub confirmed_at: Option<i64>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum DealStatus {
    Created,
    Funded,
    InProgress,
    Completed,
    Refunded,
    Disputed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum MilestoneStatus {
    Pending,
    Completed,
    Released,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MilestoneInput {
    pub description: String,
    pub amount: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Reputation {
    /// Wallet address
    pub wallet: Pubkey,
    /// Number of completed deals as buyer
    pub deals_as_buyer: u32,
    /// Number of completed deals as seller
    pub deals_as_seller: u32,
    /// Total volume transacted (USDC)
    pub total_volume: u64,
    /// Bump seed
    pub bump: u8,
}

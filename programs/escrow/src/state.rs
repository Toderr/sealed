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
    /// Timestamp when deal reached fully-funded status (0 = not yet funded)
    pub funded_at: i64,
    /// Last updated timestamp
    pub updated_at: i64,
    /// Platform fee (bps) snapshotted from Config at creation. 0 = fee-free deal.
    /// Frozen per-deal so later fee changes never affect in-flight deals.
    pub fee_bps: u16,
    /// Treasury snapshotted at creation (owner of the treasury token account the
    /// buyer/seller fees are sent to). Pubkey::default() = no fee for this deal.
    pub treasury: Pubkey,
    /// Whether the buyer's fee half has already been charged (once, at funding).
    pub buyer_fee_paid: bool,
    /// Bump seed for PDA
    pub bump: u8,
}

impl Deal {
    /// This deal charges a fee: it snapshotted a nonzero rate and a real treasury.
    pub fn has_fee(&self) -> bool {
        self.fee_bps > 0 && self.treasury != Pubkey::default()
    }
    /// Half the fee (buyer's or seller's share) of `amount`, in lamports.
    /// fee_bps is the TOTAL; each side pays half. Truncates (favors payee).
    pub fn half_fee(&self, amount: u64) -> u64 {
        // amount * (fee_bps / 2) / 10_000, computed as amount * fee_bps / 20_000
        (amount as u128)
            .checked_mul(self.fee_bps as u128)
            .and_then(|v| v.checked_div(20_000))
            .unwrap_or(0) as u64
    }
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

/// Global platform config (PDA: seeds = ["config"]). Holds the changeable fee
/// rate, treasury, and the admin authority. A single instance for the program.
/// The fee is only ACTUALLY charged when fee_bps > 0 AND treasury is set — so
/// the program can be deployed and run fee-free until the treasury exists.
#[account]
#[derive(InitSpace)]
pub struct Config {
    /// The only wallet allowed to change fee settings.
    pub authority: Pubkey,
    /// Where platform fees are sent (owner of the treasury token account).
    /// Pubkey::default() means "unset" → no fee is charged.
    pub treasury: Pubkey,
    /// Total platform fee in basis points (100 = 1%). Split half buyer / half seller.
    pub fee_bps: u16,
    /// Bump seed
    pub bump: u8,
}

impl Config {
    /// Max fee the authority may set: 5%.
    pub const MAX_FEE_BPS: u16 = 500;
    /// Default fee applied when config is initialized: 1%.
    pub const DEFAULT_FEE_BPS: u16 = 100;

    /// The fee is only live when a rate is set AND a treasury exists.
    pub fn fee_active(&self) -> bool {
        self.fee_bps > 0 && self.treasury != Pubkey::default()
    }
}

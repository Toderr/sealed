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
    /// Mutual-refund approvals. Each party approves in their OWN transaction;
    /// the refund executes once both are true. This replaces the old ceremony
    /// where buyer and seller had to co-sign a single shared transaction, which
    /// could not work in practice: a recent blockhash expires in ~90s and the
    /// counterparty signs much later.
    pub buyer_refund_ok: bool,
    pub seller_refund_ok: bool,
    /// Bump seed for PDA
    pub bump: u8,
    // ── Fields below were added after deals existed on-chain. ────────────────
    // Borsh is positional, so they MUST stay at the end: inserting anywhere
    // above shifts every subsequent byte and makes already-funded deals
    // undecodable.
    //
    // CRITICAL — these fields make the account LONGER, and Borsh does NOT
    // tolerate a short buffer: loading an old (pre-upgrade) Deal account fails
    // with AccountDidNotDeserialize, which would freeze its escrow. Appending is
    // necessary but NOT sufficient on its own. A pre-existing account must be
    // grown to the new length and its tail zero-filled BEFORE any fee-path
    // instruction loads it — that is exactly what `migrate_deal` does, and every
    // fee/refund instruction that takes a full `Account<Deal>` will reject an
    // un-migrated old account until it's run. Zero values are the correct legacy
    // meaning (untiered, symmetric split), so the migration is a pure resize.
    /// Who created the deal. Pubkey::default() = unknown (created before this
    /// field existed) → no tier applies. Not inferable from `buyer`, which
    /// always signs create_deal regardless of who initiated.
    pub creator: Pubkey,
    /// Buyer's fee rate in bps of the buyer's side. 0 with `fee_bps` set means
    /// this deal predates asymmetric fees — `buyer_fee()` falls back to the
    /// symmetric half-split so old deals keep charging exactly what they did.
    pub buyer_fee_bps: u16,
    /// Seller's fee rate in bps of the seller's side. Same legacy fallback.
    pub seller_fee_bps: u16,
    /// Whether the two rates above are authoritative. False on every deal
    /// created before tiers shipped, which is what makes the fallback safe and
    /// unambiguous rather than guessing from zero values.
    pub asymmetric_fees: bool,
}

impl Deal {
    /// This deal charges a fee: it snapshotted a nonzero rate and a real treasury.
    pub fn has_fee(&self) -> bool {
        // Under asymmetric rates ONE side can legitimately be 0 (an SSS creator
        // pays nothing while the counterparty still pays). Gating on fee_bps
        // alone would then skip the other side's fee too and make the whole
        // deal free — so check the per-side rates when they're authoritative.
        let rate_set = if self.asymmetric_fees {
            self.buyer_fee_bps > 0 || self.seller_fee_bps > 0
        } else {
            self.fee_bps > 0
        };
        rate_set && self.treasury != Pubkey::default()
    }
    /// Half the fee (buyer's or seller's share) of `amount`, in lamports.
    /// fee_bps is the TOTAL; each side pays half. Truncates (favors payee).
    ///
    /// This is the LEGACY symmetric path, kept because every deal created
    /// before tiers relies on it. New deals set `asymmetric_fees` and go
    /// through `buyer_fee`/`seller_fee` instead.
    pub fn half_fee(&self, amount: u64) -> u64 {
        // amount * (fee_bps / 2) / 10_000, computed as amount * fee_bps / 20_000
        (amount as u128)
            .checked_mul(self.fee_bps as u128)
            .and_then(|v| v.checked_div(20_000))
            .unwrap_or(0) as u64
    }

    /// Apply a per-side rate: `amount * bps / 10_000`. Unlike `half_fee` the
    /// rate is already this side's own, so there's no halving.
    fn side_fee(amount: u64, bps: u16) -> u64 {
        (amount as u128)
            .checked_mul(bps as u128)
            .and_then(|v| v.checked_div(10_000))
            .unwrap_or(0) as u64
    }

    /// The buyer's fee on `amount`. Falls back to the symmetric half-split for
    /// deals created before asymmetric fees existed, so their charge is
    /// bit-for-bit what it was at creation.
    pub fn buyer_fee(&self, amount: u64) -> u64 {
        if self.asymmetric_fees {
            Self::side_fee(amount, self.buyer_fee_bps)
        } else {
            self.half_fee(amount)
        }
    }

    /// The seller's fee on `amount`. Same legacy fallback as `buyer_fee`.
    pub fn seller_fee(&self, amount: u64) -> u64 {
        if self.asymmetric_fees {
            Self::side_fee(amount, self.seller_fee_bps)
        } else {
            self.half_fee(amount)
        }
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
/// One pricing tier. The two rates are INDEPENDENT — a tier is any
/// (creator, counterparty) pair — so a tier can make the creator free while the
/// counterparty still pays their normal share, or shift the whole fee onto one
/// side. Pricing policy lives in data, not code: repricing is a `set_tiers`
/// call, never a redeploy.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace)]
pub struct Tier {
    /// Stable identifier referenced by UserTier.tier_id (0 = SSS, 1 = SS, …).
    pub id: u8,
    /// Fee charged to the party who CREATED the deal, in bps of their side.
    pub creator_fee_bps: u16,
    /// Fee charged to the counterparty, in bps of their side.
    pub counterparty_fee_bps: u16,
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
    /// Default total fee in basis points (100 = 1%) for wallets with no tier.
    /// Split half buyer / half seller, as it always has been.
    pub fee_bps: u16,
    /// Pricing tiers, indexed by Tier.id. Empty = nobody is tiered and every
    /// deal uses fee_bps. Sized generously up front: growing this later means
    /// reallocating the account, which is far more disruptive than the ~80
    /// unused bytes it costs today.
    #[max_len(16)]
    pub tiers: Vec<Tier>,
    /// Bump seed
    pub bump: u8,
}

impl Config {
    /// Max fee the authority may set: 5%.
    pub const MAX_FEE_BPS: u16 = 500;
    /// Default fee applied when config is initialized: 1%.
    pub const DEFAULT_FEE_BPS: u16 = 100;
    /// Hard cap on tier count, mirroring the `max_len` above.
    pub const MAX_TIERS: usize = 16;

    /// The fee is only live when a rate is set AND a treasury exists.
    pub fn fee_active(&self) -> bool {
        self.fee_bps > 0 && self.treasury != Pubkey::default()
    }

    /// Look up a tier by id. None when the id isn't configured — callers then
    /// fall back to the default split rather than failing the deal.
    pub fn tier(&self, id: u8) -> Option<&Tier> {
        self.tiers.iter().find(|t| t.id == id)
    }
}

/// Per-wallet tier assignment (PDA: seeds = ["tier", wallet]).
///
/// ABSENCE IS THE DEFAULT: a wallet with no UserTier account is untiered and
/// pays the standard fee. That costs nothing for the overwhelming majority of
/// users who aren't VIPs — only whitelisted wallets get an account. Revoking a
/// tier closes the account and returns the rent.
#[account]
#[derive(InitSpace)]
pub struct UserTier {
    /// The wallet this assignment belongs to (also the PDA seed).
    pub wallet: Pubkey,
    /// Which Config.tiers entry applies to deals this wallet CREATES.
    pub tier_id: u8,
    /// Bump seed
    pub bump: u8,
}

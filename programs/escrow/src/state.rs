use anchor_lang::prelude::*;

/// Current on-chain layout version for `Deal`. Bump on EVERY layout change so
/// a decoder can branch per generation instead of misreading old bytes.
pub const DEAL_VERSION: u8 = 1;

#[account]
#[derive(InitSpace)]
pub struct Deal {
    /// Layout version (audit #65 finding 5). MUST be the first field so a reader
    /// can dispatch on it before touching anything positional. Older on-chain
    /// deals predate this field entirely — see the migration note at the bottom.
    pub version: u8,
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
    // ── HISTORY / LESSON (audit #65 finding 1) ───────────────────────────────
    // Fields above were added across releases by INSERTING them ahead of `bump`
    // (funded_at, fee_bps, treasury, buyer_fee_paid, buyer_refund_ok,
    // seller_refund_ok). Every insertion shifted `bump` for accounts already on
    // chain, so five layout generations exist on devnet and 17 of them decode
    // `bump` from the wrong offset → their vault PDA no longer signs → escrow
    // frozen, and `migrate_deal` (append-only resize) cannot repair a mid-struct
    // shift. That mistake is why `version` (first) and `_reserved` (last) now
    // exist: future scalar additions go into `_reserved` IN PLACE — never
    // inserted, never appended past it — so `bump` and every prior offset stay
    // fixed forever. This is the canonical layout for the fresh mainnet deploy.
    /// Who created the deal. Pubkey::default() = unknown → no tier applies. Not
    /// inferable from `buyer`, which always signs create_deal.
    pub creator: Pubkey,
    /// Buyer's fee rate in bps of the buyer's side.
    pub buyer_fee_bps: u16,
    /// Seller's fee rate in bps of the seller's side.
    pub seller_fee_bps: u16,
    /// Whether the two rates above are authoritative (vs the symmetric split).
    pub asymmetric_fees: bool,
    /// Reserved padding (audit #65 finding 5). New scalar fields are carved out
    /// of THIS block in place, keeping every offset above it stable — so no
    /// future addition can shift `bump` the way the history above did.
    pub _reserved: [u8; 64],
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
/// Current on-chain layout version for `Config`. Bump on every layout change.
pub const CONFIG_VERSION: u8 = 1;

#[account]
#[derive(InitSpace)]
pub struct Config {
    /// Layout version (audit #65 finding 5). First field, for the same reason
    /// as Deal.version — dispatch on it before reading anything positional.
    pub version: u8,
    /// The only wallet allowed to change fee settings.
    pub authority: Pubkey,
    /// Where platform fees are sent (owner of the treasury token account).
    /// Pubkey::default() means "unset" → no fee is charged.
    pub treasury: Pubkey,
    /// Default total fee in basis points (100 = 1%) for wallets with no tier.
    /// Split half buyer / half seller, as it always has been.
    pub fee_bps: u16,
    /// Bump seed
    pub bump: u8,
    // ── Appended AFTER the original fields (which ended at `bump`). ───────────
    // Borsh is positional: the pre-tier Config had `bump` last, so `tiers` MUST
    // come after it, not before — otherwise migrating an existing Config would
    // need to relocate `bump`, not just grow the account. As a trailing field,
    // migrate_config is a pure resize + zero-fill, and a zero-filled tail is an
    // empty vec (len prefix 0) = "no tiers", which is the truth until set_tiers.
    /// Pricing tiers, indexed by Tier.id. Empty = nobody is tiered and every
    /// deal uses fee_bps. Sized generously up front (max 16): growing the cap
    /// later would need another realloc.
    #[max_len(16)]
    pub tiers: Vec<Tier>,
    /// Mints a deal may be denominated in (audit H-1). Empty = accept ANY mint
    /// (the pre-fix behavior, so an un-migrated Config keeps working) — set it
    /// via `set_allowed_mints` to enforce USDC/USDT/USDG only. Appended AFTER
    /// `tiers` to stay Borsh-positional: a zero-filled tail reads as an empty
    /// vec, which migrate_config produces on an old account.
    #[max_len(8)]
    pub allowed_mints: Vec<Pubkey>,
    /// Reserved padding (audit #65 finding 5). Future scalar config fields come
    /// out of this block in place. (Vecs above already move the tail, so the
    /// padding mainly guards fixed-size additions.)
    pub _reserved: [u8; 64],
}

impl Config {
    /// Max fee the authority may set: 5%.
    pub const MAX_FEE_BPS: u16 = 500;
    /// Default fee applied when config is initialized: 1%.
    pub const DEFAULT_FEE_BPS: u16 = 100;
    /// Hard cap on tier count, mirroring the `max_len` above.
    pub const MAX_TIERS: usize = 16;
    /// Hard cap on the accepted-mint allowlist, mirroring the `max_len` above.
    pub const MAX_ALLOWED_MINTS: usize = 8;

    /// The fee is only live when a rate is set AND a treasury exists.
    pub fn fee_active(&self) -> bool {
        self.fee_bps > 0 && self.treasury != Pubkey::default()
    }

    /// Look up a tier by id. None when the id isn't configured — callers then
    /// fall back to the default split rather than failing the deal.
    pub fn tier(&self, id: u8) -> Option<&Tier> {
        self.tiers.iter().find(|t| t.id == id)
    }

    /// Whether a deal may be denominated in `mint`. An EMPTY allowlist means
    /// "accept any mint" — the original behavior, so a Config that predates the
    /// allowlist (or hasn't had one set) keeps working. Once populated, only the
    /// listed mints (USDC/USDT/USDG) are accepted (audit H-1).
    pub fn mint_allowed(&self, mint: &Pubkey) -> bool {
        self.allowed_mints.is_empty() || self.allowed_mints.contains(mint)
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

// ── Unit tests (audit #65 finding 4.1) ───────────────────────────────────────
// Pins the fee arithmetic and the mint allowlist. Pure logic — needs no
// validator and no built .so; runs under `cargo test -p escrow`.
#[cfg(test)]
mod tests {
    use super::*;

    // Minimal Deal carrying just the fields the fee helpers read.
    fn deal(fee_bps: u16, buyer_bps: u16, seller_bps: u16, asym: bool, treasury_set: bool) -> Deal {
        Deal {
            version: DEAL_VERSION,
            deal_id: String::new(),
            buyer: Pubkey::default(),
            seller: Pubkey::default(),
            mint: Pubkey::default(),
            escrow_token_account: Pubkey::default(),
            total_amount: 0,
            funded_amount: 0,
            released_amount: 0,
            status: DealStatus::Created,
            milestones: vec![],
            created_at: 0,
            funded_at: 0,
            updated_at: 0,
            fee_bps,
            treasury: if treasury_set { Pubkey::new_unique() } else { Pubkey::default() },
            buyer_fee_paid: false,
            buyer_refund_ok: false,
            seller_refund_ok: false,
            bump: 0,
            creator: Pubkey::default(),
            buyer_fee_bps: buyer_bps,
            seller_fee_bps: seller_bps,
            asymmetric_fees: asym,
            _reserved: [0u8; 64],
        }
    }

    const USDC: u64 = 1_000_000; // 6 decimals

    #[test]
    fn legacy_symmetric_fee_unchanged() {
        // 1% total, split half/half. asymmetric_fees=false → half_fee path.
        let d = deal(100, 0, 0, false, true);
        assert_eq!(d.buyer_fee(1000 * USDC), 5 * USDC); // 0.5%
        assert_eq!(d.seller_fee(1000 * USDC), 5 * USDC); // 0.5%
        assert!(d.has_fee());
    }

    #[test]
    fn asymmetric_sss_creator_buyer_zero() {
        // SSS creator=buyer: buyer 0%, counterparty(seller) 1%.
        let d = deal(200, 0, 100, true, true);
        assert_eq!(d.buyer_fee(1000 * USDC), 0);
        assert_eq!(d.seller_fee(1000 * USDC), 10 * USDC);
        // has_fee must stay TRUE even though the buyer side is 0.
        assert!(d.has_fee());
    }

    #[test]
    fn asymmetric_both_zero_is_fee_free() {
        let d = deal(200, 0, 0, true, true);
        assert!(!d.has_fee());
    }

    #[test]
    fn has_fee_false_without_treasury() {
        assert!(!deal(100, 0, 0, false, false).has_fee());
    }

    #[test]
    fn side_fee_truncates_toward_payee() {
        // 0.25% of 1333 lamports = 3.3325 → 3 (truncated).
        assert_eq!(Deal::side_fee(1333, 25), 3);
        assert_eq!(Deal::side_fee(100, 25), 0); // rounds to 0
    }

    #[test]
    fn milestone_sum_checked_add() {
        // Mirrors create_deal's try_fold: overflow returns None, not a panic.
        let over = [u64::MAX, 1]
            .iter()
            .try_fold(0u64, |a, x| a.checked_add(*x));
        assert_eq!(over, None);
        let ok = [1u64, 2, 3].iter().try_fold(0u64, |a, x| a.checked_add(*x));
        assert_eq!(ok, Some(6));
    }

    fn config(mints: Vec<Pubkey>) -> Config {
        Config {
            version: CONFIG_VERSION,
            authority: Pubkey::default(),
            treasury: Pubkey::default(),
            fee_bps: 200,
            bump: 0,
            tiers: vec![],
            allowed_mints: mints,
            _reserved: [0u8; 64],
        }
    }

    #[test]
    fn mint_allowlist_behavior() {
        let usdc = Pubkey::new_unique();
        let scam = Pubkey::new_unique();
        // Empty = accept any (documented back-compat).
        assert!(config(vec![]).mint_allowed(&scam));
        // Populated = only listed mints.
        assert!(config(vec![usdc]).mint_allowed(&usdc));
        assert!(!config(vec![usdc]).mint_allowed(&scam));
    }
}

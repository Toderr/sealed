use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::error::EscrowError;
use crate::state::*;

#[derive(Accounts)]
#[instruction(deal_id: String, milestones: Vec<MilestoneInput>, total_amount: u64, creator_wallet: Pubkey)]
pub struct CreateDeal<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: Seller wallet, validated by the buyer
    pub seller: UncheckedAccount<'info>,

    #[account(
        init,
        payer = buyer,
        space = 8 + Deal::INIT_SPACE,
        seeds = [b"deal", deal_id.as_bytes()],
        bump,
    )]
    pub deal: Account<'info, Deal>,

    /// The deal's payment mint. Must be on the platform allowlist (USDC/USDT/
    /// USDG) once one is set — enforced in the handler against `config`, since
    /// the accepted set lives in Config data, not a compile-time constant (audit
    /// H-1). An empty allowlist accepts any mint (pre-fix behavior).
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = buyer,
        token::mint = mint,
        token::authority = deal,
        seeds = [b"escrow-vault", deal_id.as_bytes()],
        bump,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    /// Global platform config. REQUIRED (audit C-1): when this was optional, a
    /// hand-built tx could omit it and permanently snapshot fee_bps=0, bypassing
    /// the platform fee entirely. It is now mandatory, so the fee snapshot always
    /// reflects the real on-chain config. The config must be initialized
    /// (`init_config`) before any deal — which it is on every live deployment.
    /// A deal is still fee-FREE when the config's fee isn't active (no rate or no
    /// treasury), so the pre-config fee-free era is preserved via config state,
    /// not via omitting the account.
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    /// The deal creator's tier assignment, if they have one. Optional because
    /// ABSENCE IS THE DEFAULT — the overwhelming majority of wallets are
    /// untiered and simply have no such account. Seeds bind it to
    /// `creator_wallet`, so a caller cannot pass someone else's (cheaper) tier:
    /// the PDA derivation would not match.
    #[account(
        seeds = [b"tier", creator_wallet.as_ref()],
        bump = creator_tier.bump,
    )]
    pub creator_tier: Option<Account<'info, UserTier>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<CreateDeal>,
    deal_id: String,
    milestones: Vec<MilestoneInput>,
    total_amount: u64,
    creator_wallet: Pubkey,
) -> Result<()> {
    require!(deal_id.len() <= 32, EscrowError::DealIdTooLong);
    require!(milestones.len() <= 10, EscrowError::TooManyMilestones);

    // The creator must be one of the two parties. Without this a buyer could
    // name any wallet as "creator" — including one they know holds an SSS tier —
    // and claim its pricing for a deal that wallet has nothing to do with.
    //
    // TRUST BOUNDARY: only `buyer` signs create_deal, so `creator_wallet` is
    // ASSERTED by the buyer, not proven. This is safe for pricing because the
    // creator's discount lands on the creator's OWN side: naming the seller as
    // creator applies the seller's `creator_fee_bps` to the seller and charges
    // the buyer `counterparty_fee_bps` — so a buyer can only ever give the
    // discount away or pick a WORSE rate for themselves, never a better one, and
    // no funds move wrongly. If `creator` ever gains meaning beyond fee-side
    // selection (e.g. reputation credit), it must become signer-proven.
    require!(
        creator_wallet == ctx.accounts.buyer.key() || creator_wallet == ctx.accounts.seller.key(),
        EscrowError::InvalidCreator
    );

    // The payment mint must be on the platform allowlist (audit H-1). An empty
    // allowlist accepts any mint (pre-fix behavior); once USDC/USDT/USDG are set
    // via set_allowed_mints, anything else is rejected.
    require!(
        ctx.accounts.config.mint_allowed(&ctx.accounts.mint.key()),
        EscrowError::UnsupportedMint
    );

    // Sum milestone amounts with checked_add (audit H-2): the plain `.sum()`
    // would panic on u64 overflow. Return a clean error instead.
    let milestone_sum: u64 = milestones
        .iter()
        .try_fold(0u64, |acc, m| acc.checked_add(m.amount))
        .ok_or(EscrowError::MathOverflow)?;
    require!(
        milestone_sum == total_amount,
        EscrowError::MilestoneAmountMismatch
    );

    let deal = &mut ctx.accounts.deal;
    deal.deal_id = deal_id;
    deal.buyer = ctx.accounts.buyer.key();
    deal.seller = ctx.accounts.seller.key();
    deal.mint = ctx.accounts.mint.key();
    deal.escrow_token_account = ctx.accounts.escrow_token_account.key();
    deal.total_amount = total_amount;
    deal.funded_amount = 0;
    deal.released_amount = 0;
    deal.status = DealStatus::Created;
    deal.milestones = milestones
        .into_iter()
        .map(|m| Milestone {
            description: m.description,
            amount: m.amount,
            status: MilestoneStatus::Pending,
            confirmed_by: None,
            confirmed_at: None,
        })
        .collect();
    deal.created_at = Clock::get()?.unix_timestamp;
    deal.funded_at = 0;
    deal.updated_at = deal.created_at;
    deal.buyer_fee_paid = false;
    // No mutual-refund approvals yet (two-step refund).
    deal.buyer_refund_ok = false;
    deal.seller_refund_ok = false;
    deal.bump = ctx.bumps.deal;

    // Snapshot the current platform fee onto the deal. The fee is only "live"
    // when a rate is set AND a treasury exists — otherwise the deal is fee-free
    // (fee_bps 0 / treasury default), so deals stay fundable before the treasury
    // is configured. Later fee changes never affect this (already-created) deal.
    deal.creator = creator_wallet;

    // config is now REQUIRED (audit C-1), so read it directly. A deal is still
    // fee-free when the config's fee isn't active (no rate / no treasury) — that
    // preserves the pre-treasury era through config STATE, not by omitting the
    // account (which was the bypass).
    let config = &ctx.accounts.config;
    if config.fee_active() {
        deal.fee_bps = config.fee_bps;
        deal.treasury = config.treasury;

        // Resolve the CREATOR's tier, if any. A tier is a property of the
        // wallet that created the deal — being a counterparty on someone
        // else's deal never earns a discount.
        //
        // The tier is resolved once, here, and its rates are snapshotted
        // onto the deal like fee_bps always has been. Repricing a tier
        // later can therefore never change a deal already underway.
        let tier = ctx
            .accounts
            .creator_tier
            .as_ref()
            .filter(|t| t.wallet == creator_wallet)
            .and_then(|t| config.tier(t.tier_id));

        match tier {
            Some(t) => {
                // Map creator/counterparty onto buyer/seller for this deal.
                let creator_is_buyer = creator_wallet == deal.buyer;
                deal.buyer_fee_bps = if creator_is_buyer {
                    t.creator_fee_bps
                } else {
                    t.counterparty_fee_bps
                };
                deal.seller_fee_bps = if creator_is_buyer {
                    t.counterparty_fee_bps
                } else {
                    t.creator_fee_bps
                };
                deal.asymmetric_fees = true;
                msg!(
                    "Tier {} applied: buyer={} bps, seller={} bps",
                    t.id,
                    deal.buyer_fee_bps,
                    deal.seller_fee_bps
                );
            }
            None => {
                // Untiered: leave asymmetric_fees false so the fee helpers
                // use the symmetric half-split, byte-identical to the
                // behavior before tiers existed.
                deal.buyer_fee_bps = 0;
                deal.seller_fee_bps = 0;
                deal.asymmetric_fees = false;
            }
        }
    } else {
        deal.fee_bps = 0;
        deal.treasury = Pubkey::default();
        deal.buyer_fee_bps = 0;
        deal.seller_fee_bps = 0;
        deal.asymmetric_fees = false;
    }

    msg!("Deal created: {} (fee_bps={})", deal.deal_id, deal.fee_bps);
    Ok(())
}

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

    /// USDC mint
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

    /// Global platform config, if it exists — the deal snapshots its fee_bps +
    /// treasury. Optional so deals can still be created before init_config
    /// (they're then fee-free). Seeds-validated when provided.
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Option<Account<'info, Config>>,

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
    require!(
        creator_wallet == ctx.accounts.buyer.key() || creator_wallet == ctx.accounts.seller.key(),
        EscrowError::InvalidCreator
    );

    let milestone_sum: u64 = milestones.iter().map(|m| m.amount).sum();
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

    match &ctx.accounts.config {
        Some(config) if config.fee_active() => {
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
        }
        _ => {
            deal.fee_bps = 0;
            deal.treasury = Pubkey::default();
            deal.buyer_fee_bps = 0;
            deal.seller_fee_bps = 0;
            deal.asymmetric_fees = false;
        }
    }

    msg!("Deal created: {} (fee_bps={})", deal.deal_id, deal.fee_bps);
    Ok(())
}

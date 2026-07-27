use anchor_lang::prelude::*;

use crate::error::EscrowError;
use crate::state::{Config, UserTier};

// ── Per-wallet tier assignment ────────────────────────────────────────────────
//
// Tier RATES live in Config.tiers (one list, repriced wholesale). Tier
// MEMBERSHIP lives here, one PDA per whitelisted wallet.
//
// They can't be merged: a wallet list inside Config would grow past the account
// size limit and need a realloc every time it changed. Per-wallet PDAs scale
// indefinitely and let a single assignment be added or revoked without
// rewriting anything else.
//
// ABSENCE IS THE DEFAULT. An unwhitelisted wallet has no account at all and
// pays the standard fee, so the 99% who aren't VIPs cost nothing to support.

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct SetUserTier<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Only the config authority may assign tiers — this is the pricing
    /// control, so it must not be self-serve.
    #[account(
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority @ EscrowError::UnauthorizedAuthority,
    )]
    pub config: Account<'info, Config>,

    /// `init_if_needed` so one instruction both creates and updates an
    /// assignment; re-running with a different tier_id is a promotion or
    /// demotion rather than an error.
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + UserTier::INIT_SPACE,
        seeds = [b"tier", wallet.as_ref()],
        bump,
    )]
    pub user_tier: Account<'info, UserTier>,

    pub system_program: Program<'info, System>,
}

pub fn set_user_tier(ctx: Context<SetUserTier>, wallet: Pubkey, tier_id: u8) -> Result<()> {
    // The tier must actually exist in the config. Otherwise the assignment is a
    // silent no-op: create_deal would resolve it to None and quietly charge the
    // standard fee, with nothing to indicate the whitelist entry was junk.
    require!(
        ctx.accounts.config.tier(tier_id).is_some(),
        EscrowError::UnknownTierId
    );

    let user_tier = &mut ctx.accounts.user_tier;
    user_tier.wallet = wallet;
    user_tier.tier_id = tier_id;
    user_tier.bump = ctx.bumps.user_tier;

    msg!("Tier {} assigned to {}", tier_id, wallet);
    Ok(())
}

// ── clear_user_tier ───────────────────────────────────────────────────────────
// Revoke an assignment by closing the account; rent returns to the authority
// that paid it. The wallet reverts to untiered, which is simply the absence of
// this account.

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct ClearUserTier<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority @ EscrowError::UnauthorizedAuthority,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        close = authority,
        seeds = [b"tier", wallet.as_ref()],
        bump = user_tier.bump,
    )]
    pub user_tier: Account<'info, UserTier>,
}

pub fn clear_user_tier(_ctx: Context<ClearUserTier>, wallet: Pubkey) -> Result<()> {
    msg!("Tier cleared for {}", wallet);
    Ok(())
}

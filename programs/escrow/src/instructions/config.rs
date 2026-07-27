use anchor_lang::prelude::*;

use crate::error::EscrowError;
use crate::state::{Config, Tier};

// ── init_config ───────────────────────────────────────────────────────────────
// Creates the single global Config PDA. The caller becomes the authority. The
// fee defaults to 1% (DEFAULT_FEE_BPS) and the treasury starts UNSET
// (Pubkey::default()), so no fee is actually charged until set_treasury is
// called — the program runs fee-free until then.

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Config::INIT_SPACE,
        seeds = [b"config"],
        bump,
    )]
    pub config: Account<'info, Config>,

    pub system_program: Program<'info, System>,
}

pub fn init_config(ctx: Context<InitConfig>, fee_bps: u16) -> Result<()> {
    require!(fee_bps <= Config::MAX_FEE_BPS, EscrowError::FeeTooHigh);
    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.treasury = Pubkey::default(); // unset → fee-free until set_treasury
    config.fee_bps = fee_bps;
    config.bump = ctx.bumps.config;
    msg!("Config initialized: fee_bps={}, treasury=unset", fee_bps);
    Ok(())
}

// ── Authority-gated setters ────────────────────────────────────────────────────
// Shared account context: only the stored authority may mutate the config.

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority @ EscrowError::UnauthorizedAuthority,
    )]
    pub config: Account<'info, Config>,
}

pub fn set_fee(ctx: Context<UpdateConfig>, fee_bps: u16) -> Result<()> {
    require!(fee_bps <= Config::MAX_FEE_BPS, EscrowError::FeeTooHigh);
    ctx.accounts.config.fee_bps = fee_bps;
    msg!("Fee updated: {} bps", fee_bps);
    Ok(())
}

pub fn set_treasury(ctx: Context<UpdateConfig>, treasury: Pubkey) -> Result<()> {
    ctx.accounts.config.treasury = treasury;
    msg!("Treasury updated: {}", treasury);
    Ok(())
}

pub fn set_authority(ctx: Context<UpdateConfig>, new_authority: Pubkey) -> Result<()> {
    ctx.accounts.config.authority = new_authority;
    msg!("Authority transferred: {}", new_authority);
    Ok(())
}

// ── set_tiers ─────────────────────────────────────────────────────────────────
// Replace the whole tier table in one call (authority only). Wholesale rather
// than per-entry so the table is always internally consistent — no window where
// half the tiers are new pricing and half are old.
//
// This is what makes pricing a config change rather than a code change: adding,
// removing, or repricing a tier is a script run, never a rebuild or redeploy.
// Deals already created keep the rates they snapshotted at creation.

pub fn set_tiers(ctx: Context<UpdateConfig>, tiers: Vec<Tier>) -> Result<()> {
    require!(
        tiers.len() <= Config::MAX_TIERS,
        EscrowError::TooManyTiers
    );

    // Every rate is capped by the same ceiling as the global fee. A tier is a
    // discount mechanism; it must not become a backdoor to overcharging.
    for t in tiers.iter() {
        require!(
            t.creator_fee_bps <= Config::MAX_FEE_BPS
                && t.counterparty_fee_bps <= Config::MAX_FEE_BPS,
            EscrowError::FeeTooHigh
        );
    }

    // Duplicate ids would make `Config::tier()` resolution order-dependent, so
    // the same wallet could be priced differently depending on how the vec was
    // written. Reject rather than silently taking the first match.
    for (i, t) in tiers.iter().enumerate() {
        require!(
            !tiers.iter().skip(i + 1).any(|o| o.id == t.id),
            EscrowError::DuplicateTierId
        );
    }

    ctx.accounts.config.tiers = tiers;
    msg!("Tiers updated: {} configured", ctx.accounts.config.tiers.len());
    Ok(())
}

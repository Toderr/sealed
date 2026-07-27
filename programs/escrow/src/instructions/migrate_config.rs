use anchor_lang::prelude::*;

use crate::error::EscrowError;
use crate::state::Config;

// ── migrate_config ────────────────────────────────────────────────────────────
//
// Grows the Config PDA created BEFORE the `tiers` vec was added up to the new
// INIT_SPACE, zero-filling the appended bytes.
//
// Same problem and shape as `migrate_deal`: adding `tiers: Vec<Tier>` to Config
// lengthened the account, and Borsh does not tolerate a short buffer — so after
// the upgrade EVERY instruction that loads `Account<Config>` (set_tiers,
// set_user_tier, clear_user_tier, and create_deal's optional config) fails with
// AccountDidNotDeserialize until the account is grown. This handler therefore
// takes a raw account, not `Account<Config>` (which would hit the very failure
// it fixes), validates it by hand, and resizes.
//
// Zero-filling is exactly correct: an empty Vec serializes as a u32 length of 0,
// which is four zero bytes — so a migrated Config reads back as "no tiers
// configured", which is the truth until set_tiers runs. fee_bps, treasury, and
// authority sit BEFORE the vec and are untouched.
//
// Permissionless and idempotent: it only ever grows the account and zeroes new
// bytes, and no-ops once already at the new size.

#[derive(Accounts)]
pub struct MigrateConfig<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: raw account, not Account<Config> — an old Config is too short to
    /// deserialize, which is the whole reason we're here. Validated by hand:
    /// PDA seeds, program ownership, and the Config discriminator.
    #[account(
        mut,
        seeds = [b"config"],
        bump,
    )]
    pub config: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<MigrateConfig>) -> Result<()> {
    let info = ctx.accounts.config.to_account_info();

    require!(info.owner == ctx.program_id, EscrowError::InvalidCreator);
    {
        let data = info.try_borrow_data()?;
        require!(data.len() >= 8, EscrowError::AccountDidNotDeserialize);
        require!(
            data[..8] == *Config::DISCRIMINATOR,
            EscrowError::AccountDidNotDeserialize
        );
    }

    let new_len = 8 + Config::INIT_SPACE;
    let old_len = info.data_len();
    if old_len >= new_len {
        return Ok(());
    }

    let rent = Rent::get()?;
    let extra = rent
        .minimum_balance(new_len)
        .saturating_sub(info.lamports());
    if extra > 0 {
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.payer.to_account_info(),
                    to: info.clone(),
                },
            ),
            extra,
        )?;
    }

    info.resize(new_len)?;
    msg!("Config migrated: {} -> {} bytes", old_len, new_len);
    Ok(())
}

use anchor_lang::prelude::*;

use crate::error::EscrowError;
use crate::state::Deal;

// ── migrate_deal ──────────────────────────────────────────────────────────────
//
// Grows a Deal account created BEFORE the tier fields were added up to the new
// INIT_SPACE, zero-filling the appended tail (creator, buyer_fee_bps,
// seller_fee_bps, asymmetric_fees).
//
// Why this instruction is necessary and why it looks the way it does:
//
//   The tier upgrade lengthened the Deal struct. Borsh does not tolerate a
//   short buffer — loading an old, shorter Deal account through
//   `Account<'info, Deal>` fails with AccountDidNotDeserialize, which would
//   permanently freeze the escrow. So this handler deliberately does NOT take
//   `Account<Deal>` (that would hit the very failure it exists to fix). It takes
//   a raw account, checks the 8-byte discriminator by hand, then resizes.
//
//   Zero-filling the tail is exactly correct: creator = Pubkey::default() (=
//   "unknown", no tier), buyer/seller_fee_bps = 0, asymmetric_fees = false —
//   which routes the fee helpers through the legacy symmetric half-split, so a
//   migrated deal charges bit-for-bit what it did before the upgrade.
//
//   Permissionless on purpose. It only ever GROWS an account and zeroes new
//   bytes; it cannot change terms, move funds, or touch a deal that's already
//   the new size. Anyone can pay to unfreeze a deal — most usefully the app,
//   lazily, the first time it can't load one.

#[derive(Accounts)]
#[instruction(deal_id: String)]
pub struct MigrateDeal<'info> {
    /// Pays for the extra rent-exempt lamports the larger account needs.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: intentionally a raw account, not Account<Deal> — an old Deal is
    /// too short to deserialize, which is the whole reason we're here. Validated
    /// by hand: PDA seeds, program ownership, and the Deal discriminator.
    #[account(
        mut,
        seeds = [b"deal", deal_id.as_bytes()],
        bump,
    )]
    pub deal: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<MigrateDeal>, _deal_id: String) -> Result<()> {
    let info = ctx.accounts.deal.to_account_info();

    // Must be one of OUR Deal accounts. The seeds constraint already binds the
    // address; also confirm the program owns it and it carries the Deal
    // discriminator, so this can't be pointed at an unrelated account.
    require!(info.owner == ctx.program_id, EscrowError::InvalidCreator);
    {
        let data = info.try_borrow_data()?;
        require!(data.len() >= 8, EscrowError::AccountDidNotDeserialize);
        require!(
            data[..8] == *Deal::DISCRIMINATOR,
            EscrowError::AccountDidNotDeserialize
        );
    }

    let new_len = 8 + Deal::INIT_SPACE;
    let old_len = info.data_len();

    // Already migrated (or created fresh at the new size): nothing to do. Idempotent.
    if old_len >= new_len {
        return Ok(());
    }

    // Top up rent so the larger account stays rent-exempt, then grow it. resize
    // zero-fills the new bytes, which is exactly the legacy default we want.
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
    msg!("Deal migrated: {} -> {} bytes", old_len, new_len);
    Ok(())
}

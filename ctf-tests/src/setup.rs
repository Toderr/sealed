//! Shared challenge setup: mint, wallets, platform config.

use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Keypair;
use solana_sdk::signer::Signer;

use crate::escrow_ix::{create_deal_ix, init_config_ix, set_treasury_ix};
use crate::harness::LocalChallenge;
use crate::{ONE_USDC};

pub struct ChallengeActors {
    pub buyer: Keypair,
    pub seller: Keypair,
    pub treasury_owner: Keypair,
    pub attacker: Keypair,
    pub mint: Pubkey,
    pub buyer_ata: Pubkey,
    pub seller_ata: Pubkey,
    pub treasury_ata: Pubkey,
}

impl ChallengeActors {
    pub async fn bootstrap(challenge: &mut LocalChallenge) -> Result<Self, Box<dyn std::error::Error>> {
        let buyer = Keypair::new();
        let seller = Keypair::new();
        let treasury_owner = Keypair::new();
        let attacker = Keypair::new();

        for kp in [&buyer, &seller, &treasury_owner, &attacker] {
            challenge.airdrop_lamports(&kp.pubkey(), 10_000_000_000).await?;
        }

        let mint = challenge.challenge.add_mint().await?;
        let buyer_ata = challenge
            .challenge
            .add_token_account(&mint, &buyer.pubkey())
            .await?;
        let seller_ata = challenge
            .challenge
            .add_token_account(&mint, &seller.pubkey())
            .await?;
        let treasury_ata = challenge
            .challenge
            .add_token_account(&mint, &treasury_owner.pubkey())
            .await?;

        challenge
            .challenge
            .mint_to(100 * ONE_USDC, &mint, &buyer_ata)
            .await?;

        Ok(Self {
            buyer,
            seller,
            treasury_owner,
            attacker,
            mint,
            buyer_ata,
            seller_ata,
            treasury_ata,
        })
    }
}

/// Platform fee active: init_config(100 bps) + set_treasury.
pub async fn init_fee_platform(
    challenge: &mut LocalChallenge,
    treasury: Pubkey,
) -> Result<(), Box<dyn std::error::Error>> {
    let authority = challenge.payer().insecure_clone();
    challenge
        .challenge
        .run_ix(init_config_ix(authority.pubkey(), 100))
        .await?;
    challenge
        .challenge
        .run_ix(set_treasury_ix(authority.pubkey(), treasury))
        .await?;
    Ok(())
}

/// Create and fund a deal; returns deal id used.
pub async fn create_and_fund_deal(
    challenge: &mut LocalChallenge,
    actors: &ChallengeActors,
    deal_id: &str,
    amount: u64,
    include_config: bool,
    treasury_ata: Option<Pubkey>,
) -> Result<(), Box<dyn std::error::Error>> {
    let create_ix = create_deal_ix(
        actors.buyer.pubkey(),
        actors.seller.pubkey(),
        actors.mint,
        deal_id,
        amount,
        actors.buyer.pubkey(),
        include_config,
    );
    challenge
        .challenge
        .run_ixs_full(&[create_ix], &[&actors.buyer], &actors.buyer.pubkey())
        .await?;

    let vault = crate::escrow_ix::vault_pda(deal_id);
    let fund_ix = crate::escrow_ix::fund_escrow_ix(
        actors.buyer.pubkey(),
        deal_id,
        actors.buyer_ata,
        amount,
        vault,
        treasury_ata,
    );
    challenge
        .challenge
        .run_ixs_full(&[fund_ix], &[&actors.buyer], &actors.buyer.pubkey())
        .await?;

    Ok(())
}

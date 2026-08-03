//! Sealed escrow CTF harness — local adapter for Otter Sec sol-ctf-framework.
//!
//! The upstream framework targets TCP-based CTF servers (`ChallengeBuilder::try_from(socket)`).
//! Here we use the same `ChallengeBuilder` / `Challenge` API with in-memory I/O so challenges
//! run as `cargo test` integration tests during security review.

pub mod escrow_ix;
pub mod harness;
pub mod setup;

pub use solana_sdk::signer::Signer;

pub use escrow_ix::*;
pub use harness::*;
pub use setup::*;

/// Escrow program ID (devnet / local tests).
pub const ESCROW_PROGRAM_ID: solana_sdk::pubkey::Pubkey =
    solana_sdk::pubkey!("3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ");

pub const TOKEN_PROGRAM: solana_sdk::pubkey::Pubkey =
    solana_sdk::pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

pub const SYSTEM_PROGRAM: solana_sdk::pubkey::Pubkey =
    solana_sdk::pubkey!("11111111111111111111111111111111");

pub const RENT_SYSVAR: solana_sdk::pubkey::Pubkey =
    solana_sdk::pubkey!("SysvarRent111111111111111111111111111111111");

pub const USDC_DECIMALS: u8 = 6;
pub const ONE_USDC: u64 = 1_000_000;

//! Local challenge runner — wraps sol-ctf-framework without a TCP server.

use std::io::{empty, sink};
use std::path::PathBuf;

use sol_ctf_framework::Challenge;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Keypair;
use solana_sdk::signer::Signer;

use crate::ESCROW_PROGRAM_ID;

/// Path to the compiled escrow BPF artifact (requires `anchor build`).
pub fn escrow_so_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../target/deploy/escrow.so")
}

pub fn escrow_so_exists() -> bool {
    escrow_so_path().exists()
}

/// Challenge environment backed by sol-ctf-framework's `ProgramTest` builder.
pub struct LocalChallenge {
    pub challenge: Challenge<std::io::Empty, std::io::Sink>,
    pub program_id: Pubkey,
}

impl LocalChallenge {
    /// Spin up a fresh SVM with the escrow program loaded at the canonical ID.
    pub async fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let so_path = escrow_so_path();
        if !so_path.exists() {
            return Err(format!(
                "escrow.so not found at {} — run `anchor build` first",
                so_path.display()
            )
            .into());
        }

        let mut builder = Challenge::builder(empty(), sink());
        let loaded = builder
            .add_program(so_path.to_str().unwrap(), Some(ESCROW_PROGRAM_ID))
            .ok_or("duplicate escrow program id")?;

        assert_eq!(loaded, ESCROW_PROGRAM_ID);

        let challenge = builder.build().await;
        Ok(Self {
            challenge,
            program_id: ESCROW_PROGRAM_ID,
        })
    }

    pub fn payer(&self) -> &Keypair {
        &self.challenge.ctx.payer
    }

    pub async fn airdrop_lamports(&mut self, to: &Pubkey, lamports: u64) -> Result<(), Box<dyn std::error::Error>> {
        use solana_system_interface::instruction as system_instruction;
        self.challenge
            .run_ix(system_instruction::transfer(&self.payer().pubkey(), to, lamports))
            .await?;
        Ok(())
    }
}

/// Convenience: skip helper for integration tests when `.so` is missing.
pub fn require_escrow_so() -> Option<PathBuf> {
    if escrow_so_exists() {
        Some(escrow_so_path())
    } else {
        eprintln!(
            "SKIP: {} not found — run `anchor build` (WSL) then `cargo test -- --ignored`",
            escrow_so_path().display()
        );
        None
    }
}

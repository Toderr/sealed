use fuzz_accounts::*;
use trident_fuzz::fuzzing::*;

#[macro_use]
mod macros;
mod fuzz_accounts;
mod helpers;
mod types;

use helpers::*;
use types::escrow::{
    CancelDealInstruction, CancelDealInstructionAccounts, CancelDealInstructionData,
    SetTreasuryInstruction, SetTreasuryInstructionAccounts, SetTreasuryInstructionData,
};

macro_rules! assert_tx_success {
    ($res:expr, $label:expr) => {{
        let r = $res;
        assert!(
            r.is_success(),
            "{} failed: {:#?}",
            $label,
            r.get_result()
        );
    }};
}

macro_rules! assert_tx_failure {
    ($res:expr, $label:expr) => {{
        let r = $res;
        assert!(
            !r.is_success(),
            "{} should have failed but succeeded: {:#?}",
            $label,
            r.get_result()
        );
    }};
}

#[derive(FuzzTestMethods)]
struct FuzzTest {
    trident: Trident,
    fuzz_accounts: AccountAddresses,
}

#[flow_executor]
impl FuzzTest {
    fn new() -> Self {
        Self {
            trident: Trident::default(),
            fuzz_accounts: AccountAddresses::default(),
        }
    }

    /// Per-iteration setup: wallets, SPL mint, funded buyer ATA.
    #[init]
    fn start(&mut self) {
        setup_token_environment(&mut self.trident, &mut self.fuzz_accounts);
    }

    /// Happy path: init_config → create_deal → fund_escrow → release_milestone.
    #[flow]
    fn flow_fund_and_release(&mut self) {
        init_config_if_needed(&mut self.trident, &mut self.fuzz_accounts);

        let buyer = self.fuzz_accounts.buyer.get(&mut self.trident).expect("buyer");
        let seller = self.fuzz_accounts.seller.get(&mut self.trident).expect("seller");
        let mint = self.fuzz_accounts.mint.get(&mut self.trident).expect("mint");
        let buyer_ata = self
            .fuzz_accounts
            .buyer_token_account
            .get(&mut self.trident)
            .expect("buyer ATA");
        let seller_ata = self
            .fuzz_accounts
            .seller_token_account
            .get(&mut self.trident)
            .expect("seller ATA");

        let deal_id = "fuzz-release";
        let amount = ONE_USDC;

        let create_ix = create_deal_ix(buyer, seller, mint, deal_id, amount, buyer, false);
        assert_tx_success!(
            self.trident
                .process_transaction(&[create_ix], Some("CreateDeal")),
            "CreateDeal"
        );

        let fund_ix = fund_escrow_ix(buyer, deal_id, buyer_ata, amount, None);
        assert_tx_success!(
            self.trident
                .process_transaction(&[fund_ix], Some("FundEscrow")),
            "FundEscrow"
        );

        let release_ix = release_milestone_ix(buyer, deal_id, seller_ata, None, 0);
        assert_tx_success!(
            self.trident
                .process_transaction(&[release_ix], Some("ReleaseMilestone")),
            "ReleaseMilestone"
        );
    }

    /// create_deal → cancel_deal (unfunded).
    #[flow]
    fn flow_cancel_unfunded(&mut self) {
        let buyer = self.fuzz_accounts.buyer.get(&mut self.trident).expect("buyer");
        let seller = self.fuzz_accounts.seller.get(&mut self.trident).expect("seller");
        let mint = self.fuzz_accounts.mint.get(&mut self.trident).expect("mint");
        let buyer_ata = self
            .fuzz_accounts
            .buyer_token_account
            .get(&mut self.trident)
            .expect("buyer ATA");

        let deal_id = "fuzz-cancel";
        let amount = ONE_USDC;

        let create_ix = create_deal_ix(buyer, seller, mint, deal_id, amount, buyer, false);
        assert_tx_success!(
            self.trident
                .process_transaction(&[create_ix], Some("CreateDeal")),
            "CreateDeal"
        );

        let cancel_ix = CancelDealInstruction::data(CancelDealInstructionData::new())
            .accounts(CancelDealInstructionAccounts::new(
                buyer,
                deal_pda(deal_id),
                vault_pda(deal_id),
                buyer_ata,
            ))
            .instruction();

        assert_tx_success!(
            self.trident
                .process_transaction(&[cancel_ix], Some("CancelDeal")),
            "CancelDeal"
        );
    }

    /// create → fund → mutual approve_refund (two txs).
    #[flow]
    fn flow_mutual_refund(&mut self) {
        let buyer = self.fuzz_accounts.buyer.get(&mut self.trident).expect("buyer");
        let seller = self.fuzz_accounts.seller.get(&mut self.trident).expect("seller");
        let mint = self.fuzz_accounts.mint.get(&mut self.trident).expect("mint");
        let buyer_ata = self
            .fuzz_accounts
            .buyer_token_account
            .get(&mut self.trident)
            .expect("buyer ATA");

        let deal_id = "fuzz-refund";
        let amount = ONE_USDC;

        let create_ix = create_deal_ix(buyer, seller, mint, deal_id, amount, buyer, false);
        assert_tx_success!(
            self.trident
                .process_transaction(&[create_ix], Some("CreateDeal")),
            "CreateDeal"
        );

        let fund_ix = fund_escrow_ix(buyer, deal_id, buyer_ata, amount, None);
        assert_tx_success!(
            self.trident
                .process_transaction(&[fund_ix], Some("FundEscrow")),
            "FundEscrow"
        );

        let buyer_approve = approve_refund_ix(buyer, deal_id, buyer_ata);
        assert_tx_success!(
            self.trident.process_transaction(
                &[buyer_approve],
                Some("ApproveRefund buyer")
            ),
            "ApproveRefund buyer"
        );

        let seller_approve = approve_refund_ix(seller, deal_id, buyer_ata);
        assert_tx_success!(
            self.trident.process_transaction(
                &[seller_approve],
                Some("ApproveRefund seller")
            ),
            "ApproveRefund seller"
        );
    }

    /// Sea-level negatives from AUDIT/04: wrong vault, wrong treasury, wrong mint.
    #[flow]
    fn flow_account_substitution_attacks(&mut self) {
        init_config_if_needed(&mut self.trident, &mut self.fuzz_accounts);

        let authority = self
            .fuzz_accounts
            .authority
            .get(&mut self.trident)
            .expect("authority");
        let buyer = self.fuzz_accounts.buyer.get(&mut self.trident).expect("buyer");
        let seller = self.fuzz_accounts.seller.get(&mut self.trident).expect("seller");
        let mint = self.fuzz_accounts.mint.get(&mut self.trident).expect("mint");
        let buyer_ata = self
            .fuzz_accounts
            .buyer_token_account
            .get(&mut self.trident)
            .expect("buyer ATA");

        let deal_id = "fuzz-attack";
        let amount = ONE_USDC;

        let treasury_ata_ix =
            self.trident
                .initialize_associated_token_account(&authority, &mint, &authority);
        assert_tx_success!(
            self.trident
                .process_transaction(&[treasury_ata_ix], Some("Treasury ATA")),
            "Treasury ATA"
        );
        let treasury_ata = self
            .trident
            .get_associated_token_address(&mint, &authority, &TOKEN_PROGRAM);

        let set_treasury_ix = SetTreasuryInstruction::data(SetTreasuryInstructionData::new(
            authority,
        ))
        .accounts(SetTreasuryInstructionAccounts::new(authority, config_pda()))
        .instruction();
        assert_tx_success!(
            self.trident
                .process_transaction(&[set_treasury_ix], Some("SetTreasury")),
            "SetTreasury"
        );

        let create_ix = create_deal_ix(buyer, seller, mint, deal_id, amount, buyer, true);
        assert_tx_success!(
            self.trident
                .process_transaction(&[create_ix], Some("CreateDeal fee")),
            "CreateDeal fee"
        );

        let decoy_vault = self
            .fuzz_accounts
            .escrow_token_account
            .insert(&mut self.trident, None);
        let decoy_init = self.trident.initialize_token_account(
            &authority,
            &decoy_vault,
            &mint,
            &buyer,
        );
        assert_tx_success!(
            self.trident
                .process_transaction(&decoy_init, Some("Decoy vault")),
            "Decoy vault"
        );

        let mut wrong_vault_fund =
            fund_escrow_ix(buyer, deal_id, buyer_ata, amount, Some(treasury_ata));
        wrong_vault_fund.accounts[2] = AccountMeta::new(decoy_vault, false);

        assert_tx_failure!(
            self.trident.process_transaction(
                &[wrong_vault_fund],
                Some("Wrong vault fund")
            ),
            "Wrong vault fund"
        );

        let wrong_mint = Pubkey::new_unique();
        self.trident.airdrop(&authority, LAMPORTS_PER_SOL);
        let wrong_mint_ixs = self
            .trident
            .initialize_mint(&authority, &wrong_mint, USDC_DECIMALS, &authority, None);
        assert_tx_success!(
            self.trident
                .process_transaction(&wrong_mint_ixs, Some("Wrong mint")),
            "Wrong mint"
        );
        let wrong_buyer_ata_ix = self
            .trident
            .initialize_associated_token_account(&authority, &wrong_mint, &buyer);
        assert_tx_success!(
            self.trident.process_transaction(
                &[wrong_buyer_ata_ix],
                Some("Wrong buyer ATA")
            ),
            "Wrong buyer ATA"
        );
        let wrong_buyer_ata =
            self.trident
                .get_associated_token_address(&wrong_mint, &buyer, &TOKEN_PROGRAM);

        let wrong_mint_fund = fund_escrow_ix(
            buyer,
            deal_id,
            wrong_buyer_ata,
            amount,
            Some(treasury_ata),
        );
        assert_tx_failure!(
            self.trident.process_transaction(
                &[wrong_mint_fund],
                Some("Wrong mint fund")
            ),
            "Wrong mint fund"
        );

        let wrong_treasury_ix =
            self.trident
                .initialize_associated_token_account(&authority, &mint, &seller);
        assert_tx_success!(
            self.trident.process_transaction(
                &[wrong_treasury_ix],
                Some("Wrong treasury ATA")
            ),
            "Wrong treasury ATA"
        );
        let wrong_treasury_ata =
            self.trident
                .get_associated_token_address(&mint, &seller, &TOKEN_PROGRAM);

        let wrong_treasury_fund = fund_escrow_ix(
            buyer,
            deal_id,
            buyer_ata,
            amount,
            Some(wrong_treasury_ata),
        );
        assert_tx_failure!(
            self.trident.process_transaction(
                &[wrong_treasury_fund],
                Some("Wrong treasury fund")
            ),
            "Wrong treasury fund"
        );
    }

    #[end]
    fn end(&mut self) {}
}

fn main() {
    FuzzTest::fuzz(500, 50);
}

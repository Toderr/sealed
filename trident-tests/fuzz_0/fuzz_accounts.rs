use trident_fuzz::fuzzing::*;

/// Storage for all account addresses used in fuzz testing.
///
/// This struct serves as a centralized repository for account addresses,
/// enabling their reuse across different instruction flows and test scenarios.
///
/// Docs: https://ackee.xyz/trident/docs/latest/trident-api-macro/trident-types/fuzz-accounts/
#[derive(Default)]
pub struct AccountAddresses {
    pub buyer: AddressStorage,

    pub deal: AddressStorage,

    pub escrow_token_account: AddressStorage,

    pub buyer_token_account: AddressStorage,

    pub token_program: AddressStorage,

    pub seller: AddressStorage,

    pub mint: AddressStorage,

    pub config: AddressStorage,

    pub system_program: AddressStorage,

    pub rent: AddressStorage,

    pub treasury_token_account: AddressStorage,

    pub authority: AddressStorage,

    pub seller_token_account: AddressStorage,
}

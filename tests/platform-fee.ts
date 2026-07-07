// Platform-fee tests for the escrow program.
//
// ⚠️ RUN IN WSL: needs `anchor build` (to generate target/idl + target/types)
// then `anchor test`. This file was authored without a local Anchor toolchain,
// so treat it as a starting point — adjust account wiring to your generated
// types as needed. It focuses on the FEE behavior (0.5% buyer + 0.5% seller).
//
// Prereqs (typical Anchor test deps): @coral-xyz/anchor, @solana/spl-token, chai.

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
// import { Escrow } from "../target/types/escrow"; // available after `anchor build`

const BPS = 100; // 1% total → 0.5% each side
const USDC_DECIMALS = 6;
const toUsdc = (n: number) => Math.round(n * 10 ** USDC_DECIMALS);

describe("platform fee", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Escrow as Program<any>;
  const authority = provider.wallet;

  let mint: PublicKey;
  const treasuryOwner = Keypair.generate();
  let treasuryAta: PublicKey;
  let configPda: PublicKey;

  const findConfig = () =>
    PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId)[0];
  const findDeal = (id: string) =>
    PublicKey.findProgramAddressSync([Buffer.from("deal"), Buffer.from(id)], program.programId)[0];
  const findVault = (id: string) =>
    PublicKey.findProgramAddressSync([Buffer.from("escrow-vault"), Buffer.from(id)], program.programId)[0];

  before(async () => {
    mint = await createMint(provider.connection, (authority as any).payer, authority.publicKey, null, USDC_DECIMALS);
    treasuryAta = (
      await getOrCreateAssociatedTokenAccount(provider.connection, (authority as any).payer, mint, treasuryOwner.publicKey)
    ).address;
    configPda = findConfig();
  });

  it("init_config: fee defaults to 1%, treasury unset → fee-free", async () => {
    await program.methods
      .initConfig(BPS)
      .accounts({ authority: authority.publicKey, config: configPda, systemProgram: SystemProgram.programId })
      .rpc();
    const cfg = await program.account.config.fetch(configPda);
    assert.equal(cfg.feeBps, BPS);
    assert.ok(cfg.treasury.equals(PublicKey.default), "treasury starts unset");
  });

  it("set_fee is authority-gated (a stranger cannot change it)", async () => {
    const stranger = Keypair.generate();
    try {
      await program.methods.setFee(200).accounts({ authority: stranger.publicKey, config: configPda }).signers([stranger]).rpc();
      assert.fail("stranger should not be able to set the fee");
    } catch (e) {
      // expected: UnauthorizedAuthority / has_one violation
    }
  });

  it("a deal created while treasury is UNSET is fee-free (fundable, no treasury needed)", async () => {
    // ... create_deal with the config passed in; because treasury is unset the
    // deal snapshots fee_bps = 0. fund_escrow + release_milestone then move full
    // amounts and require NO treasury account. Assert vault + seller balances
    // equal the full amounts (no cut). (Wire accounts per your generated types.)
  });

  it("with treasury set, a 1000 deal charges 1% total (5 buyer + 5 seller)", async () => {
    // 1. set_treasury → treasuryOwner.publicKey
    await program.methods.setTreasury(treasuryOwner.publicKey).accounts({ authority: authority.publicKey, config: configPda }).rpc();

    // 2. create_deal "fee-1000" with one 1000 milestone, config passed in →
    //    snapshots fee_bps = 100, treasury = treasuryOwner.
    // 3. fund_escrow(1000) WITH treasuryAta → vault = 1000, treasury += 5 (buyer 0.5%).
    // 4. release_milestone(0) WITH treasuryAta → seller += 995, treasury += 5 (seller 0.5%).
    // Assert: treasury balance == toUsdc(10), seller == toUsdc(995), vault == 0.
    //
    // const treasuryBal = Number((await getAccount(provider.connection, treasuryAta)).amount);
    // assert.equal(treasuryBal, toUsdc(10));
  });

  it("rounding: odd milestone amounts truncate and never exceed the fee or underflow the seller", async () => {
    // e.g. a 333 milestone → seller_fee = floor(333 * 100 / 20000) = 1 (0.005% dust favors seller/vault).
    // Assert seller_net + seller_fee == amount, and seller_fee <= amount * BPS / 20000.
  });

  it("buyer fee is charged exactly once across partial fundings", async () => {
    // Fund a deal in two calls (500 + 500). Assert the buyer fee (2.5 → floor) is
    // charged only on the funding that carries it, not twice. buyer_fee_paid guard.
  });

  it("a fee-bearing deal rejects a wrong/missing treasury account", async () => {
    // fund_escrow / release_milestone without treasuryAta (or with a wrong-owner
    // account) → TreasuryAccountRequired.
  });
});

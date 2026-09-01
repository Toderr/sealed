// setup-fee.ts — initialize / turn ON the platform fee for the escrow program.
//
// Idempotent admin tooling: init_config (once) + set_fee + set_treasury, then
// prints the resulting on-chain config. Run by the config AUTHORITY (the wallet
// that will control fee settings).
//
// Requires the anchor workspace (target/idl + target/types from `anchor build`).
// Run from the program workspace root:
//
//   PROGRAM_ID=<program>            # optional; defaults to the declared program id
//   TREASURY=<treasury wallet>      # required to activate the fee
//   FEE_BPS=200                     # optional; total fee in bps (default 100 = 1%). Max 500.
//   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
//   ANCHOR_WALLET=$HOME/.config/solana/id.json \
//   npx tsx scripts/setup-fee.ts
//
// The fee is only LIVE once a treasury is set; until then the program is fee-free.

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";

// `process` is provided by Node at runtime (script run via tsx). Declared here so
// the file typechecks without pulling @types/node into the scripts folder.
declare const process: { env: Record<string, string | undefined>; exit(code: number): never };

const DEFAULT_PROGRAM_ID = "3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Escrow as anchor.Program<any>;

  const programId = new PublicKey(process.env.PROGRAM_ID ?? DEFAULT_PROGRAM_ID);
  const feeBps = Number(process.env.FEE_BPS ?? "100");
  const treasuryEnv = process.env.TREASURY;

  if (feeBps < 0 || feeBps > 500) {
    throw new Error(`FEE_BPS must be 0..500 (got ${feeBps})`);
  }

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programId
  );

  console.log("Program:   ", programId.toBase58());
  console.log("Authority: ", provider.wallet.publicKey.toBase58());
  console.log("Config PDA:", configPda.toBase58());
  console.log("");

  // init_config if missing, else set_fee
  const existing = await provider.connection.getAccountInfo(configPda);
  if (!existing) {
    console.log(`init_config(${feeBps})...`);
    await program.methods
      .initConfig(feeBps)
      .accounts({
        authority: provider.wallet.publicKey,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("  ✓ config initialized");
  } else {
    console.log(`config exists — set_fee(${feeBps})...`);
    await program.methods
      .setFee(feeBps)
      .accounts({ authority: provider.wallet.publicKey, config: configPda })
      .rpc();
    console.log("  ✓ fee set");
  }

  // set_treasury → activates the fee. Skip if none provided (stays fee-free).
  if (treasuryEnv) {
    const treasury = new PublicKey(treasuryEnv);
    console.log(`set_treasury(${treasury.toBase58()})...`);
    await program.methods
      .setTreasury(treasury)
      .accounts({ authority: provider.wallet.publicKey, config: configPda })
      .rpc();
    console.log("  ✓ treasury set — fee is now LIVE for new deals");
  } else {
    console.log("no TREASURY env — leaving treasury unset (program stays fee-free)");
  }

  // set_allowed_mints → restrict which mints a deal may use (audit H-1 / issue
  // #65 finding 3). MUST run at setup: an empty allowlist accepts ANY mint
  // (fail-open), and nothing else populates it — so without this step a fresh
  // deployment starts with H-1 open. Defaults to the cluster's USDC; override
  // with ALLOWED_MINTS (comma-separated) for USDC,USDT,USDG on mainnet.
  const USDC_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
  const USDC_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const rpc = provider.connection.rpcEndpoint;
  const defaultMint = rpc.includes("mainnet") ? USDC_MAINNET : USDC_DEVNET;
  const mints = (process.env.ALLOWED_MINTS ?? defaultMint)
    .split(",")
    .map((s) => new PublicKey(s.trim()));
  console.log(`set_allowed_mints([${mints.map((m) => m.toBase58()).join(", ")}])...`);
  await program.methods
    .setAllowedMints(mints)
    .accounts({ authority: provider.wallet.publicKey, config: configPda })
    .rpc();
  console.log("  ✓ mint allowlist set — deals restricted to these mints");

  const cfg = await program.account.config.fetch(configPda);
  const active = cfg.feeBps > 0 && !cfg.treasury.equals(PublicKey.default);
  console.log("\n── on-chain config ──────────────────────────────");
  console.log("  authority: ", cfg.authority.toBase58());
  console.log("  treasury:  ", active ? cfg.treasury.toBase58() : "(unset → fee-free)");
  console.log("  fee_bps:   ", cfg.feeBps, `(${cfg.feeBps / 100}% total, ${cfg.feeBps / 200}% each side)`);
  console.log("  fee LIVE?: ", active ? "YES" : "NO");
  console.log("─────────────────────────────────────────────────");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);

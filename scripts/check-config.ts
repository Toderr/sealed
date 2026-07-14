// check-config.ts — read + print the escrow program's on-chain Config.
//
// Shows authority, treasury, fee_bps, bump, and whether the fee is live.
// Run from the program workspace root (needs target/idl + target/types):
//
//   PROGRAM_ID=<program>           # optional; defaults to the declared program id
//   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
//   ANCHOR_WALLET=$HOME/.config/solana/id.json \
//   npx tsx scripts/check-config.ts

import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

// `process` is provided by Node at runtime (script run via tsx). Declared here so
// the file typechecks without pulling @types/node into the scripts folder.
declare const process: { env: Record<string, string | undefined>; exit(code: number): never };

const DEFAULT_PROGRAM_ID = "3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Escrow as anchor.Program<any>;

  const programId = new PublicKey(process.env.PROGRAM_ID ?? DEFAULT_PROGRAM_ID);
  const [configPda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programId
  );

  console.log("Program:    ", programId.toBase58());
  console.log("Config PDA: ", configPda.toBase58(), `(bump ${bump})`);

  const info = await provider.connection.getAccountInfo(configPda);
  if (!info) {
    console.log("\n⚠️  Config NOT initialized — the program is running FEE-FREE.");
    console.log("    Run setup-fee.ts to init_config + set_treasury.");
    return;
  }

  const cfg = await program.account.config.fetch(configPda);
  const treasurySet = !cfg.treasury.equals(PublicKey.default);
  const feeActive = cfg.feeBps > 0 && treasurySet;

  console.log("\n── on-chain Config ──────────────────────────────");
  console.log("  authority: ", cfg.authority.toBase58());
  console.log("  treasury:  ", treasurySet ? cfg.treasury.toBase58() : "(unset → no fee)");
  console.log("  fee_bps:   ", cfg.feeBps, `(${cfg.feeBps / 100}% total, ${cfg.feeBps / 200}% each side)`);
  console.log("  bump:      ", cfg.bump);
  console.log("  ─────────");
  console.log("  fee LIVE?: ", feeActive ? "YES ✓" : "NO (fee-free)");
  console.log("─────────────────────────────────────────────────");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);

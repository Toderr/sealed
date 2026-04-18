import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
  Transaction,
  Connection,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
  getAssociatedTokenAddress,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
} from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import {
  DealParams,
  USDC_DEVNET_MINT,
  USDC_MAINNET_MINT,
  usdcToLamports,
} from "./types";

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ??
    "3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ"
);

// --- PDA derivation ---

export function findDealPDA(dealId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("deal"), Buffer.from(dealId)],
    PROGRAM_ID
  );
}

export function findEscrowVaultPDA(dealId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow-vault"), Buffer.from(dealId)],
    PROGRAM_ID
  );
}

export function getUsdcMint(isDevnet = true): PublicKey {
  return new PublicKey(isDevnet ? USDC_DEVNET_MINT : USDC_MAINNET_MINT);
}

// --- Anchor instruction discriminator (first 8 bytes of sha256("global:<name>")) ---
// Pre-computed for each instruction. Will be replaced by IDL-generated client after anchor build.

async function sha256Discriminator(name: string): Promise<Buffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`global:${name}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(new Uint8Array(hash).slice(0, 8));
}

// --- Borsh serialization helpers ---

function encodeString(value: string): Buffer {
  const bytes = Buffer.from(value, "utf-8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length);
  return Buffer.concat([len, bytes]);
}

function encodeU64(value: BN): Buffer {
  return value.toArrayLike(Buffer, "le", 8);
}

function encodeU8(value: number): Buffer {
  return Buffer.from([value]);
}

function encodeMilestones(
  milestones: { description: string; amount: BN }[]
): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32LE(milestones.length);
  const parts = milestones.map((m) =>
    Buffer.concat([encodeString(m.description), encodeU64(m.amount)])
  );
  return Buffer.concat([len, ...parts]);
}

// --- Instruction builders ---

export async function buildCreateDealIx(
  buyer: PublicKey,
  params: DealParams
): Promise<TransactionInstruction> {
  const seller = new PublicKey(params.sellerWallet);
  const mint = getUsdcMint();
  const [dealPDA] = findDealPDA(params.dealId);
  const [escrowVault] = findEscrowVaultPDA(params.dealId);

  const milestones = params.milestones.map((m) => ({
    description: m.description,
    amount: new BN(usdcToLamports(m.amount)),
  }));

  const disc = await sha256Discriminator("create_deal");
  const data = Buffer.concat([
    disc,
    encodeString(params.dealId),
    encodeMilestones(milestones),
    encodeU64(new BN(usdcToLamports(params.totalAmount))),
  ]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: buyer, isSigner: true, isWritable: true },
      { pubkey: seller, isSigner: false, isWritable: false },
      { pubkey: dealPDA, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: escrowVault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export async function buildFundEscrowIx(
  buyer: PublicKey,
  dealId: string,
  amount: number
): Promise<TransactionInstruction> {
  const [dealPDA] = findDealPDA(dealId);
  const [escrowVault] = findEscrowVaultPDA(dealId);
  const mint = getUsdcMint();
  const buyerATA = await getAssociatedTokenAddress(mint, buyer);

  const disc = await sha256Discriminator("fund_escrow");
  const data = Buffer.concat([disc, encodeU64(new BN(usdcToLamports(amount)))]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: buyer, isSigner: true, isWritable: true },
      { pubkey: dealPDA, isSigner: false, isWritable: true },
      { pubkey: escrowVault, isSigner: false, isWritable: true },
      { pubkey: buyerATA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export async function buildReleaseMilestoneIx(
  buyer: PublicKey,
  dealId: string,
  milestoneIndex: number,
  sellerPubkey: PublicKey
): Promise<TransactionInstruction> {
  const [dealPDA] = findDealPDA(dealId);
  const [escrowVault] = findEscrowVaultPDA(dealId);
  const mint = getUsdcMint();
  const sellerATA = await getAssociatedTokenAddress(mint, sellerPubkey);

  const disc = await sha256Discriminator("release_milestone");
  const data = Buffer.concat([disc, encodeU8(milestoneIndex)]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: buyer, isSigner: true, isWritable: true },
      { pubkey: dealPDA, isSigner: false, isWritable: true },
      { pubkey: escrowVault, isSigner: false, isWritable: true },
      { pubkey: sellerATA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

// Mutual refund. Requires BOTH buyer and seller signatures. Used when
// parties cancel a funded deal before completion (escrow returns the
// unreleased remainder to the buyer's ATA).
export async function buildRefundIx(
  buyer: PublicKey,
  seller: PublicKey,
  dealId: string
): Promise<TransactionInstruction> {
  const [dealPDA] = findDealPDA(dealId);
  const [escrowVault] = findEscrowVaultPDA(dealId);
  const mint = getUsdcMint();
  const buyerATA = await getAssociatedTokenAddress(mint, buyer);

  const disc = await sha256Discriminator("refund");

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: buyer, isSigner: true, isWritable: true },
      { pubkey: seller, isSigner: true, isWritable: true },
      { pubkey: dealPDA, isSigner: false, isWritable: true },
      { pubkey: escrowVault, isSigner: false, isWritable: true },
      { pubkey: buyerATA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: disc,
  });
}

// --- ATA helper ---

// Idempotent create-ATA ix, safe to include unconditionally. On-chain program
// short-circuits if the ATA already exists. Prevents silent fund/release
// failures when buyer or seller has never held USDC.
export async function buildEnsureAtaIx(
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey
): Promise<TransactionInstruction> {
  const ata = await getAssociatedTokenAddress(mint, owner);
  return createAssociatedTokenAccountIdempotentInstruction(
    payer,
    ata,
    owner,
    mint,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
}

// --- Transaction helpers ---

export async function sendTx(
  connection: Connection,
  ixs: TransactionInstruction | TransactionInstruction[],
  signTransaction: (tx: Transaction) => Promise<Transaction>
): Promise<string> {
  const instructions = Array.isArray(ixs) ? ixs : [ixs];
  const tx = new Transaction();
  instructions.forEach((ix) => tx.add(ix));
  tx.feePayer = instructions[0].keys[0].pubkey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  const signed = await signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

// --- Multi-sig partial-sign handoff (used for mutual refund) ---
//
// Because mutual refund requires both buyer and seller signatures and a
// browser wallet only ever holds one key, we split the ceremony in two:
//   1. Initiator builds the tx, wallet partial-signs, tx serializes to base64
//   2. Counter-party deserializes, wallet adds their signature, broadcasts
//
// Transaction.serialize({ requireAllSignatures: false }) preserves the first
// signature so the counter-party can complete it. Both wallets must agree on
// the same recent blockhash window (~90s). After that the tx expires and a
// fresh partial-sign round is required.

export async function buildAndPartialSign(
  connection: Connection,
  ixs: TransactionInstruction[],
  feePayer: PublicKey,
  signTransaction: (tx: Transaction) => Promise<Transaction>
): Promise<string> {
  const tx = new Transaction();
  ixs.forEach((ix) => tx.add(ix));
  tx.feePayer = feePayer;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  const partial = await signTransaction(tx);
  const bytes = partial.serialize({ requireAllSignatures: false });
  return Buffer.from(bytes).toString("base64");
}

export async function coSignAndSend(
  connection: Connection,
  partialTxB64: string,
  signTransaction: (tx: Transaction) => Promise<Transaction>
): Promise<string> {
  const bytes = Buffer.from(partialTxB64, "base64");
  const tx = Transaction.from(bytes);
  const fullySigned = await signTransaction(tx);
  const sig = await connection.sendRawTransaction(fullySigned.serialize());
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

// Helper re-exports so consumers don't need @solana/spl-token directly
export { getAccount, TokenAccountNotFoundError, TokenInvalidAccountOwnerError };

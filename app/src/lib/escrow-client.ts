import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
  Transaction,
  Connection,
  SendTransactionError,
  Keypair,
  NONCE_ACCOUNT_LENGTH,
  NonceAccount,
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
  lamportsToUsdc,
  usdcToLamports,
} from "./types";
import { MOCK_CHAIN } from "./env";
import { mockEscrow } from "./mock-escrow";

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

export function findConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
}

// Total platform fee in basis points (100 = 1%), split half buyer / half seller.
// The on-chain Config is the source of truth; this mirrors the default for the
// deposit UI's line-item math when a live config isn't read.
export const DEFAULT_FEE_BPS = 100;

/** Half the fee (one side's share) of `amount` lamports, truncating. */
export function halfFeeLamports(amountLamports: number, feeBps: number): number {
  return Math.floor((amountLamports * feeBps) / 20_000);
}

export interface FeeConfig {
  feeBps: number;
  treasury: string; // "" = unset → fee-free
  /** True when a fee is actually charged (rate set AND treasury set). */
  active: boolean;
}

// Read the live platform fee. In mock mode, from the offline config; in real
// mode, decode the on-chain Config account (fee_bps u16 + treasury pubkey, after
// the 8-byte discriminator + 32-byte authority). Returns fee-free defaults if
// the config account doesn't exist yet.
export async function fetchFeeConfig(connection?: Connection): Promise<FeeConfig> {
  if (MOCK_CHAIN) {
    const c = mockEscrow.getConfig();
    return { feeBps: c.feeBps, treasury: c.treasury, active: mockEscrow.feeActive() };
  }
  try {
    if (!connection) return { feeBps: DEFAULT_FEE_BPS, treasury: "", active: false };
    const [configPDA] = findConfigPDA();
    const info = await connection.getAccountInfo(configPDA);
    if (!info) return { feeBps: DEFAULT_FEE_BPS, treasury: "", active: false };
    // Config layout: [8 disc][32 authority][32 treasury][2 fee_bps][1 bump]
    const data = info.data;
    const treasuryBytes = data.subarray(8 + 32, 8 + 32 + 32);
    const treasuryPk = new PublicKey(treasuryBytes);
    const feeBps = data.readUInt16LE(8 + 32 + 32);
    const unset = treasuryPk.equals(PublicKey.default);
    return {
      feeBps,
      treasury: unset ? "" : treasuryPk.toBase58(),
      active: feeBps > 0 && !unset,
    };
  } catch {
    return { feeBps: DEFAULT_FEE_BPS, treasury: "", active: false };
  }
}

export function getUsdcMint(): PublicKey {
  const envMint = process.env.NEXT_PUBLIC_USDC_MINT;
  if (envMint) return new PublicKey(envMint);
  const rpc = process.env.NEXT_PUBLIC_RPC_URL ?? "";
  return new PublicKey(rpc.includes("mainnet") ? USDC_MAINNET_MINT : USDC_DEVNET_MINT);
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

function encodeU16(value: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(value);
  return b;
}

function encodePubkey(value: PublicKey): Buffer {
  return Buffer.from(value.toBytes());
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

// In mock mode every instruction is discarded by sendTx, so builders return a
// trivial placeholder and skip ATA derivation (which throws for off-curve
// wallets, e.g. a manually-typed seller in the offline deal form).
function mockIx(payer: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [{ pubkey: payer, isSigner: true, isWritable: true }],
    data: Buffer.alloc(0),
  });
}

export async function buildCreateDealIx(
  buyer: PublicKey,
  params: DealParams
): Promise<TransactionInstruction> {
  if (MOCK_CHAIN) return mockIx(buyer);
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

  // Optional config account (Anchor Option<Account>): pass the Config PDA to
  // snapshot the current fee. NOTE (verify in WSL after `anchor build`): Anchor
  // signals `None` by passing the PROGRAM ID in this slot; if no config exists
  // on-chain yet, pass PROGRAM_ID here instead of configPDA so create_deal
  // treats the deal as fee-free. Once init_config is run, always pass configPDA.
  const [configPDA] = findConfigPDA();

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: buyer, isSigner: true, isWritable: true },
      { pubkey: seller, isSigner: false, isWritable: false },
      { pubkey: dealPDA, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: escrowVault, isSigner: false, isWritable: true },
      { pubkey: configPDA, isSigner: false, isWritable: false },
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
  amount: number,
  // The treasury token account, required only for fee-bearing deals. Omit for
  // fee-free deals (the None slot is filled with the program id).
  treasuryTokenAccount?: PublicKey
): Promise<TransactionInstruction> {
  if (MOCK_CHAIN) return mockIx(buyer);
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
      // Optional treasury (Anchor None = program id).
      { pubkey: treasuryTokenAccount ?? PROGRAM_ID, isSigner: false, isWritable: !!treasuryTokenAccount },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export async function buildReleaseMilestoneIx(
  buyer: PublicKey,
  dealId: string,
  milestoneIndex: number,
  sellerPubkey: PublicKey,
  // The treasury token account, required only for fee-bearing deals.
  treasuryTokenAccount?: PublicKey
): Promise<TransactionInstruction> {
  if (MOCK_CHAIN) return mockIx(buyer);
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
      // Optional treasury (Anchor None = program id).
      { pubkey: treasuryTokenAccount ?? PROGRAM_ID, isSigner: false, isWritable: !!treasuryTokenAccount },
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
  if (MOCK_CHAIN) return mockIx(buyer);
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
  // Mock mode: never sent on-chain (sendTx discards it). Skip ATA derivation,
  // which throws TokenOwnerOffCurveError for off-curve mock/manual wallets.
  if (MOCK_CHAIN) return mockIx(payer);
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
  // Mock mode: never touch the chain. Component handlers update Deal state after
  // this resolves, so returning a fake signature keeps the full flow working.
  if (MOCK_CHAIN) {
    return mockEscrow.fakeSig("send");
  }
  try {
    const instructions = Array.isArray(ixs) ? ixs : [ixs];
    const tx = new Transaction();
    instructions.forEach((ix) => tx.add(ix));
    tx.feePayer = instructions[0].keys[0].pubkey;
    const latestBlockhash = await connection.getLatestBlockhash();
    tx.recentBlockhash = latestBlockhash.blockhash;
    const signed = await signTransaction(tx);
    const sig = await connection.sendRawTransaction(signed.serialize());
    await connection.confirmTransaction(
      { signature: sig, ...latestBlockhash },
      "confirmed"
    );
    return sig;
  } catch (error) {
    if (error instanceof SendTransactionError) {
      try {
        const logs = await error.getLogs(connection);
        console.error("SendTransactionError logs:", logs);
      } catch (logsError) {
        console.error("Failed to read SendTransactionError logs:", logsError);
      }
    }
    throw error;
  }
}

export async function getUsdcBalance(
  connection: Connection,
  owner: PublicKey,
  mint = getUsdcMint()
): Promise<number> {
  if (MOCK_CHAIN) {
    return lamportsToUsdc(mockEscrow.balanceOf(owner.toBase58()));
  }
  const ata = await getAssociatedTokenAddress(mint, owner);
  try {
    const account = await getAccount(connection, ata);
    return lamportsToUsdc(Number(account.amount));
  } catch (error) {
    if (
      error instanceof TokenAccountNotFoundError ||
      error instanceof TokenInvalidAccountOwnerError
    ) {
      return 0;
    }
    throw error;
  }
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

/**
 * Build + partial-sign using a DURABLE NONCE instead of a recent blockhash.
 *
 * A recent blockhash expires in ~90s, which made the two-party handoff fail
 * almost every time: the counterparty co-signs minutes or hours later, and the
 * transaction was already dead ("Blockhash not found"). A durable nonce does not
 * expire — the partial-signed tx stays valid until the nonce is advanced — which
 * is exactly the primitive this sign-now/submit-later ceremony needs.
 *
 * The initiator pays a small rent deposit (~0.0015 SOL) for the nonce account;
 * it is reclaimed when the refund completes (see closeNonceAccount).
 *
 * Returns the base64 partial tx AND the nonce account pubkey (the counterparty
 * doesn't need the latter to co-sign, but it's stored so the rent can be
 * reclaimed and stale requests cleaned up).
 */
export async function buildAndPartialSign(
  connection: Connection,
  ixs: TransactionInstruction[],
  feePayer: PublicKey,
  signTransaction: (tx: Transaction) => Promise<Transaction>
): Promise<{ partialTx: string; nonceAccount: string; nonce: string }> {
  if (MOCK_CHAIN) {
    return { partialTx: "mock-partial-tx-blob", nonceAccount: "mock-nonce", nonce: "mock-nonce-value" };
  }

  // 1. Create + initialize a nonce account owned by the initiator.
  const nonceKeypair = Keypair.generate();
  const rent = await connection.getMinimumBalanceForRentExemption(NONCE_ACCOUNT_LENGTH);
  const createTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: feePayer,
      newAccountPubkey: nonceKeypair.publicKey,
      lamports: rent,
      space: NONCE_ACCOUNT_LENGTH,
      programId: SystemProgram.programId,
    }),
    SystemProgram.nonceInitialize({
      noncePubkey: nonceKeypair.publicKey,
      authorizedPubkey: feePayer,
    })
  );
  createTx.feePayer = feePayer;
  createTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  // The new account must sign its own creation; the wallet signs as payer.
  createTx.partialSign(nonceKeypair);
  const signedCreate = await signTransaction(createTx);
  const createSig = await connection.sendRawTransaction(signedCreate.serialize());
  await connection.confirmTransaction(createSig, "confirmed");

  // 2. Read the nonce value now stored in that account.
  const nonceInfo = await connection.getAccountInfo(nonceKeypair.publicKey);
  if (!nonceInfo) throw new Error("Nonce account was not created");
  const nonceAccount = NonceAccount.fromAccountData(nonceInfo.data);

  // 3. Build the real tx against the durable nonce. The advanceNonce instruction
  //    MUST be first; the nonce value takes the place of a recent blockhash.
  const tx = new Transaction();
  tx.add(
    SystemProgram.nonceAdvance({
      noncePubkey: nonceKeypair.publicKey,
      authorizedPubkey: feePayer,
    })
  );
  ixs.forEach((ix) => tx.add(ix));
  tx.feePayer = feePayer;
  tx.recentBlockhash = nonceAccount.nonce;

  const partial = await signTransaction(tx);
  const bytes = partial.serialize({ requireAllSignatures: false });
  return {
    partialTx: Buffer.from(bytes).toString("base64"),
    nonceAccount: nonceKeypair.publicKey.toBase58(),
    nonce: nonceAccount.nonce,
  };
}

/**
 * Reclaim the nonce account's rent once the refund is done (or abandoned).
 * Best-effort: only the nonce authority (the initiator) can call this.
 */
export async function closeNonceAccount(
  connection: Connection,
  nonceAccountPubkey: string,
  authority: PublicKey,
  signTransaction: (tx: Transaction) => Promise<Transaction>
): Promise<void> {
  if (MOCK_CHAIN) return;
  const tx = new Transaction().add(
    SystemProgram.nonceWithdraw({
      noncePubkey: new PublicKey(nonceAccountPubkey),
      authorizedPubkey: authority,
      toPubkey: authority,
      lamports: await connection.getMinimumBalanceForRentExemption(NONCE_ACCOUNT_LENGTH),
    })
  );
  tx.feePayer = authority;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  const signed = await signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(sig, "confirmed");
}

export async function coSignAndSend(
  connection: Connection,
  partialTxB64: string,
  signTransaction: (tx: Transaction) => Promise<Transaction>
): Promise<string> {
  if (MOCK_CHAIN) {
    return mockEscrow.fakeSig("cosign");
  }
  const bytes = Buffer.from(partialTxB64, "base64");
  const tx = Transaction.from(bytes);
  // NOTE: do NOT refresh recentBlockhash here — it carries the durable nonce,
  // and overwriting it would invalidate the initiator's existing signature.
  const fullySigned = await signTransaction(tx);
  try {
    const sig = await connection.sendRawTransaction(fullySigned.serialize());
    await connection.confirmTransaction(sig, "confirmed");
    return sig;
  } catch (err) {
    // Surface the REAL reason. SendTransactionError carries the program logs,
    // which say exactly what failed (missing signature, wrong account, consumed
    // nonce, insufficient funds…) — log them rather than guessing.
    let logs: string[] | null = null;
    if (err instanceof SendTransactionError) {
      try { logs = await err.getLogs(connection); } catch { /* logs unavailable */ }
    }
    console.error("[coSignAndSend] refund broadcast failed:", err, logs);

    const msg = err instanceof Error ? err.message : String(err);
    const joined = `${msg} ${logs?.join(" ") ?? ""}`;
    // Only claim "no longer valid" for a genuinely consumed/advanced nonce.
    if (/nonce|blockhash not found/i.test(joined)) {
      throw new Error(
        "This refund request is no longer valid (its nonce was already used) — ask the other party to start a new one."
      );
    }
    if (/signature verification|missing signature|not enough signers/i.test(joined)) {
      throw new Error("The refund transaction is missing a signature. Ask the other party to start a new request.");
    }
    if (/insufficient/i.test(joined)) {
      throw new Error("Not enough SOL to cover the transaction fee.");
    }
    throw new Error(logs?.length ? `Refund failed: ${logs[logs.length - 1]}` : `Refund failed: ${msg}`);
  }
}

// Helper re-exports so consumers don't need @solana/spl-token directly
export { getAccount, getAssociatedTokenAddress, TokenAccountNotFoundError, TokenInvalidAccountOwnerError };

// --- New instructions: cancel, timeout refund, close ---

// Cancel an unfunded (or partially funded) deal. Buyer-only. Returns any
// partial funding to buyer and closes both the escrow vault and deal PDA.
export async function buildCancelDealIx(
  buyer: PublicKey,
  dealId: string
): Promise<TransactionInstruction> {
  if (MOCK_CHAIN) return mockIx(buyer);
  const [dealPDA] = findDealPDA(dealId);
  const [escrowVault] = findEscrowVaultPDA(dealId);
  const mint = getUsdcMint();
  const buyerATA = await getAssociatedTokenAddress(mint, buyer);
  const disc = await sha256Discriminator("cancel_deal");
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: buyer, isSigner: true, isWritable: true },
      { pubkey: dealPDA, isSigner: false, isWritable: true },
      { pubkey: escrowVault, isSigner: false, isWritable: true },
      { pubkey: buyerATA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: disc,
  });
}

// Unilateral refund after 30-day timeout. Buyer-only, no seller signature
// required. Closes escrow vault and deal PDA.
export async function buildBuyerTimeoutRefundIx(
  buyer: PublicKey,
  dealId: string
): Promise<TransactionInstruction> {
  if (MOCK_CHAIN) return mockIx(buyer);
  const [dealPDA] = findDealPDA(dealId);
  const [escrowVault] = findEscrowVaultPDA(dealId);
  const mint = getUsdcMint();
  const buyerATA = await getAssociatedTokenAddress(mint, buyer);
  const disc = await sha256Discriminator("buyer_timeout_refund");
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: buyer, isSigner: true, isWritable: true },
      { pubkey: dealPDA, isSigner: false, isWritable: true },
      { pubkey: escrowVault, isSigner: false, isWritable: true },
      { pubkey: buyerATA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: disc,
  });
}

// Close a completed or refunded deal, reclaiming escrow vault rent.
// Buyer-only. Call after status == Completed or Refunded.
export async function buildCloseDealIx(
  buyer: PublicKey,
  dealId: string
): Promise<TransactionInstruction> {
  const [dealPDA] = findDealPDA(dealId);
  const [escrowVault] = findEscrowVaultPDA(dealId);
  const disc = await sha256Discriminator("close_deal");
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: buyer, isSigner: true, isWritable: true },
      { pubkey: dealPDA, isSigner: false, isWritable: true },
      { pubkey: escrowVault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: disc,
  });
}

// ── Platform config (fee) instructions — authority-gated ───────────────────────
// Admin-only. Used by the platform fee panel. MOCK_CHAIN builds no-op these
// (the offline fee config is managed directly in mock-data).

// Initialize the global Config PDA once. Caller becomes the authority. fee_bps
// defaults on-chain; treasury starts unset (fee-free until set_treasury).
export async function buildInitConfigIx(
  authority: PublicKey,
  feeBps: number
): Promise<TransactionInstruction> {
  if (MOCK_CHAIN) return mockIx(authority);
  const [configPDA] = findConfigPDA();
  const disc = await sha256Discriminator("init_config");
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: configPDA, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([disc, encodeU16(feeBps)]),
  });
}

export async function buildSetFeeIx(
  authority: PublicKey,
  feeBps: number
): Promise<TransactionInstruction> {
  if (MOCK_CHAIN) return mockIx(authority);
  const [configPDA] = findConfigPDA();
  const disc = await sha256Discriminator("set_fee");
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: configPDA, isSigner: false, isWritable: true },
    ],
    data: Buffer.concat([disc, encodeU16(feeBps)]),
  });
}

export async function buildSetTreasuryIx(
  authority: PublicKey,
  treasury: PublicKey
): Promise<TransactionInstruction> {
  if (MOCK_CHAIN) return mockIx(authority);
  const [configPDA] = findConfigPDA();
  const disc = await sha256Discriminator("set_treasury");
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: configPDA, isSigner: false, isWritable: true },
    ],
    data: Buffer.concat([disc, encodePubkey(treasury)]),
  });
}

export async function buildSetAuthorityIx(
  authority: PublicKey,
  newAuthority: PublicKey
): Promise<TransactionInstruction> {
  if (MOCK_CHAIN) return mockIx(authority);
  const [configPDA] = findConfigPDA();
  const disc = await sha256Discriminator("set_authority");
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: configPDA, isSigner: false, isWritable: true },
    ],
    data: Buffer.concat([disc, encodePubkey(newAuthority)]),
  });
}

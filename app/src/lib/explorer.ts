// Solana explorer link helpers (N3 / N8). Links the escrow account (Deal PDA)
// and individual transactions to explorer.solana.com, with the right ?cluster.

import { findDealPDA } from "@/lib/escrow-client";

// Cluster inferred from the configured RPC. Mainnet URLs carry no cluster param.
function clusterParam(): string {
  const rpc = (process.env.NEXT_PUBLIC_RPC_URL ?? "").toLowerCase();
  if (rpc.includes("mainnet")) return "";
  if (rpc.includes("testnet")) return "?cluster=testnet";
  // Default to devnet (the project's current target).
  return "?cluster=devnet";
}

const BASE = "https://explorer.solana.com";

/** Explorer URL for the deal's on-chain escrow account (Deal PDA), or null. */
export function escrowAccountUrl(dealId: string): string | null {
  try {
    const [pda] = findDealPDA(dealId);
    return `${BASE}/address/${pda.toBase58()}${clusterParam()}`;
  } catch {
    return null;
  }
}

/** Explorer URL for a transaction signature, or null if there's no signature. */
export function txUrl(signature: string | null | undefined): string | null {
  if (!signature) return null;
  return `${BASE}/tx/${signature}${clusterParam()}`;
}

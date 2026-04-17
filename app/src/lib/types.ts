import { PublicKey } from "@solana/web3.js";

// --- Enums matching programs/escrow/src/state.rs ---

export enum DealStatus {
  Created = "Created",
  Funded = "Funded",
  InProgress = "InProgress",
  Completed = "Completed",
  Refunded = "Refunded",
  Disputed = "Disputed",
}

export enum MilestoneStatus {
  Pending = "Pending",
  Completed = "Completed",
  Released = "Released",
}

// --- Account types matching on-chain state ---

export interface Milestone {
  description: string;
  amount: number; // USDC lamports (6 decimals)
  status: MilestoneStatus;
  confirmedBy: PublicKey | null;
  confirmedAt: number | null; // unix timestamp
}

export interface Deal {
  dealId: string;
  buyer: PublicKey;
  seller: PublicKey;
  mint: PublicKey;
  escrowTokenAccount: PublicKey;
  totalAmount: number;
  fundedAmount: number;
  releasedAmount: number;
  status: DealStatus;
  milestones: Milestone[];
  createdAt: number;
  updatedAt: number;
  bump: number;
}

// --- AI Agent types ---

export interface MilestoneInput {
  description: string;
  amount: number; // USDC (human readable, e.g. 1000 = 1000 USDC)
}

export interface DealParams {
  dealId: string;
  sellerWallet: string;
  totalAmount: number; // USDC human readable
  milestones: MilestoneInput[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  dealParams?: DealParams; // parsed deal if agent returned structured JSON
  timestamp: number;
}

// --- USDC constants ---

export const USDC_DECIMALS = 6;
export const USDC_DEVNET_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
export const USDC_MAINNET_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// --- Helpers ---

export function usdcToLamports(amount: number): number {
  return Math.round(amount * 10 ** USDC_DECIMALS);
}

export function lamportsToUsdc(lamports: number): number {
  return lamports / 10 ** USDC_DECIMALS;
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function formatUsdc(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

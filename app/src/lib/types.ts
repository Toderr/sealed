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

export type ProofType = "image" | "url" | "text";

export interface VerifierReview {
  confidence: number; // 0-1
  recommendation: "approve" | "reject" | "request_clarification";
  notes: string;
  reviewedAt: number;
}

export interface MilestoneProof {
  proofType: ProofType;
  // For image: base64 data URL. For url/text: the raw string.
  proofData: string;
  note?: string; // seller's optional comment
  submittedAt: number;
  review?: VerifierReview;
}

export interface Milestone {
  description: string;
  amount: number; // USDC lamports (6 decimals)
  status: MilestoneStatus;
  confirmedBy: PublicKey | null;
  confirmedAt: number | null; // unix timestamp
  proof?: MilestoneProof;
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

// ── New feature types ─────────────────────────────────────────────────────────

export interface AgentTemplate {
  id: string;
  wallet: string;
  name: string;
  deal_types: string[];
  negotiation_style: "firm" | "flexible" | "collaborative";
  price_floor_pct: number;
  auto_approve_if: string[];
  escalate_after_rounds: number;
  agent_intro_message: string;
  active: boolean;
  created_at: string;
}

export interface Reputation {
  wallet: string;
  deals_total: number;
  deals_successful: number;
  deals_failed: number;
  avg_rating: number;
}

export interface Rating {
  id: string;
  deal_id: string;
  rater_wallet: string;
  ratee_wallet: string;
  stars: number;
  review_text: string;
  revealed: boolean;
  submitted_at: string;
}

export interface NotificationPrefs {
  deal_review_needed: boolean;
  milestone_due: boolean;
  deal_accepted: boolean;
  deal_declined: boolean;
  new_deal_invite: boolean;
}

export interface SealedUser {
  wallet: string;
  handle: string;
  email: string | null;
  email_verified: boolean;
  telegram_username: string | null;
  notify_on: NotificationPrefs;
  kyc_status: "none" | "pending" | "approved" | "rejected";
  verified_at: string | null;
  member_since: string;
}

export interface PublicProfile {
  handle: string;
  deals_total: number;
  deals_successful: number;
  avg_rating: number;
  is_verified: boolean;
  member_since: string;
}

export interface DealCardData {
  deal_id: string;
  title: string;
  amount_usdc: number;
  show_amount: boolean;
  duration_days: number;
  milestones_total: number;
  milestones_done: number;
  party_a_handle: string;
  party_b_handle: string;
  avg_rating: number;
  completed_at: string;
}

// Negotiation data model — per ARCHITECTURE.md.
// A Proposal carries the full history of Revisions between two agents.

import type { DealParams } from "@/lib/types";
import type { AgentRole, OnBehalfOf } from "@/agents/types";
import type { NegotiationBoundaries } from "@/memory/types";

export type ProposalOrigin = "manual" | "scout_matched";

export type ProposalStatus =
  | "negotiating"
  | "agreed"
  | "rejected"
  | "expired"
  | "escalated";

export type RevisionAction = "open" | "counter" | "accept" | "reject";

export interface Revision {
  round: number; // 1-indexed
  by: AgentRole;
  onBehalfOf: OnBehalfOf;
  action: RevisionAction;
  proposedTerms: DealParams;
  reasoning: string;
  concessions: string[]; // what this side gave up vs previous offer
  asks: string[]; // what this side is still asking for
  timestamp: number;
}

export interface NegotiationSummary {
  pros: string[];
  cons: string[];
  keyConcessions: Array<{
    party: OnBehalfOf;
    item: string;
    rationale: string;
  }>;
  riskFlags: string[];
  confidenceScore: number; // 0-1
  recommendation: "accept" | "reject" | "renegotiate";
  recommendationReasoning: string;
}

export interface Proposal {
  id: string;
  origin: ProposalOrigin;
  buyerWallet: string;
  sellerWallet: string;
  initialTerms: DealParams; // what the buyer originally offered
  revisions: Revision[];
  status: ProposalStatus;
  finalTerms?: DealParams;
  summary?: NegotiationSummary;
  buyerBoundaries: NegotiationBoundaries;
  sellerBoundaries: NegotiationBoundaries;
  createdAt: number;
  updatedAt: number;
}

// Default boundaries for the simulated seller agent. In production each seller
// would set their own via Settings; for the hackathon demo we ship defaults
// that favor typical seller interests so negotiation feels realistic.
export function defaultSellerBoundaries(): NegotiationBoundaries {
  return {
    maxPriceIncrease: 5, // sellers rarely agree to pay more
    maxPriceDecrease: 8, // will accept up to 8% cut
    maxTimelineExtensionDays: 7, // tighter timeline preference
    minMilestones: 2,
    maxMilestones: 4, // prefer fewer checkpoints
    maxFrontLoadPercent: 60, // want more upfront
    acceptedPaymentTerms: ["upfront_50", "upfront_100", "milestone_based"],
    redLines: [
      "No payment after delivery only",
      "No milestones over 45 days without partial release",
    ],
    autoApproveBelowUsdc: 500,
    requireApprovalAboveUsdc: 25000,
    maxNegotiationRounds: 5,
    negotiationStyle: "balanced",
  };
}

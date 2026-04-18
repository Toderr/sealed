// BusinessMemory: per-wallet preferences, history, and negotiation boundaries.
// User-settable via Settings UI; Negotiator agent consumes this as constraints.

export type NegotiationStyle = "conservative" | "balanced" | "aggressive";

export type PaymentTerm =
  | "upfront_100"
  | "upfront_50"
  | "milestone_based"
  | "net_7"
  | "net_30";

export interface NegotiationBoundaries {
  // Price flexibility (percentage, 0-100)
  // How much the agent is allowed to move off the user's initial number.
  maxPriceIncrease: number; // buyer: max % over initial offer
  maxPriceDecrease: number; // seller: max % under initial ask

  // Timeline
  maxTimelineExtensionDays: number;

  // Milestones
  minMilestones: number;
  maxMilestones: number;
  maxFrontLoadPercent: number; // max % of total allowed in milestone 1

  // Payment terms the agent is authorized to accept
  acceptedPaymentTerms: PaymentTerm[];

  // Deal breakers. Auto-reject if proposal violates any of these (free text).
  redLines: string[];

  // Autonomy envelope
  autoApproveBelowUsdc: number; // agent signs alone below this deal size
  requireApprovalAboveUsdc: number; // must escalate above this
  maxNegotiationRounds: number; // hard cap before escalating to user
  negotiationStyle: NegotiationStyle;
}

export interface SourcingProfile {
  categories: string[];
  budgetRange: { min: number; max: number };
  qualityRequirements: string;
  preferredSuppliers?: string[];
  blacklist?: string[];
  autoPilot: boolean;
}

export interface SalesProfile {
  productsOffered: string[];
  capacity: number;
  priceFloor: number;
  preferredBuyers?: string[];
  targetIndustries?: string[];
  autoPilot: boolean;
}

export interface BusinessMemory {
  walletAddress: string;

  // History (derived from past deals, updated post-deal)
  completedDeals: number;
  avgDealSize: number;
  typicalMilestoneCount: number;

  // User-settable preferences
  boundaries: NegotiationBoundaries;

  // Scout-update forward-compat (unused until Scout agents ship)
  sourcingProfile?: SourcingProfile;
  salesProfile?: SalesProfile;
  activeListings?: string[];

  // Metadata
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_BOUNDARIES: NegotiationBoundaries = {
  maxPriceIncrease: 10,
  maxPriceDecrease: 10,
  maxTimelineExtensionDays: 14,
  minMilestones: 2,
  maxMilestones: 6,
  maxFrontLoadPercent: 40,
  acceptedPaymentTerms: ["milestone_based", "upfront_50"],
  redLines: [],
  autoApproveBelowUsdc: 1000,
  requireApprovalAboveUsdc: 50000,
  maxNegotiationRounds: 5,
  negotiationStyle: "balanced",
};

export function createDefaultMemory(wallet: string): BusinessMemory {
  const now = Math.floor(Date.now() / 1000);
  return {
    walletAddress: wallet,
    completedDeals: 0,
    avgDealSize: 0,
    typicalMilestoneCount: 0,
    boundaries: { ...DEFAULT_BOUNDARIES, redLines: [] },
    createdAt: now,
    updatedAt: now,
  };
}

// Human-readable labels for UI
export const PAYMENT_TERM_LABELS: Record<PaymentTerm, string> = {
  upfront_100: "100% upfront",
  upfront_50: "50% upfront, 50% on delivery",
  milestone_based: "Milestone-based release",
  net_7: "Net 7 days",
  net_30: "Net 30 days",
};

export const NEGOTIATION_STYLE_DESCRIPTIONS: Record<NegotiationStyle, string> = {
  conservative: "Hold firm on terms. Prefer walking away over bad deals.",
  balanced: "Seek fair middle ground. Trade concessions of similar value.",
  aggressive: "Push hard for best outcome. Accept more risk to close.",
};

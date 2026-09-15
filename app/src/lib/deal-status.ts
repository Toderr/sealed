// Canonical off-chain deal-status vocabulary. The mirror DB rows, the PATCH
// route's writable set, and every UI status branch share this module —
// previously five ad-hoc copies drifted (e.g. two omitted "manual-chat",
// and the PATCH normalizer had a no-op .replace chain that dropped the
// "inprogress" alias).
//
// On-chain status is a separate, narrower enum — see lib/escrow-client.ts.

export const DEAL_STATUSES = [
  "draft",
  "seller-ready",
  "seller-agreed",
  "manual-chat",
  "proposed",
  "escalated",
  "funded",
  "in_progress",
  "completed",
  "refunded",
  "disputed",
] as const;

export type MirrorDealStatus = (typeof DEAL_STATUSES)[number];

const DEAL_STATUS_SET: ReadonlySet<string> = new Set(DEAL_STATUSES);

/** Statuses where escrow is not yet on-chain, so terms may still change. */
export const PRE_ESCROW_STATUSES: ReadonlySet<string> = new Set([
  "draft",
  "seller-ready",
  "seller-agreed",
  "manual-chat",
  "proposed",
  "escalated",
]);

// External aliases accepted by the normalizer. Add real producers here, not
// speculative spellings.
const STATUS_ALIASES: Record<string, MirrorDealStatus> = {
  created: "draft",
  inprogress: "in_progress",
};

/**
 * Strict normalization for writes: unknown values return null so the caller
 * can reject them instead of persisting drift. Handles camelCase ("InProgress")
 * and bare-alias ("inprogress", "created") inputs.
 */
export function normalizeDealStatus(status: unknown): MirrorDealStatus | null {
  if (typeof status !== "string") return null;
  const snake = status
    .trim()
    .replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)
    .replace(/^_/, "")
    .toLowerCase();
  const value = STATUS_ALIASES[snake] ?? snake;
  return DEAL_STATUS_SET.has(value) ? (value as MirrorDealStatus) : null;
}

export function isMilestoneDone(status: string | undefined): boolean {
  const s = status?.toLowerCase();
  return s === "released" || s === "completed";
}

/**
 * Lenient read-path key: milestones-all-done forces "completed", otherwise the
 * normalized status, falling back to the raw lowercased value so unknown
 * statuses still group under themselves in the UI.
 */
export function dealStatusKey(deal: {
  status?: string | null;
  milestones?: { status?: string }[] | null;
}): string {
  const milestones = deal.milestones ?? [];
  if (milestones.length > 0 && milestones.every((m) => isMilestoneDone(m.status))) {
    return "completed";
  }
  return normalizeDealStatus(deal.status) ?? (deal.status ?? "").toLowerCase();
}

/** Sort order for deal lists; unknown statuses sort last. */
export const DEAL_STATUS_RANK: Record<string, number> = {
  draft: 0,
  "seller-ready": 1,
  "seller-agreed": 2,
  escalated: 3,
  proposed: 3,
  "manual-chat": 3,
  funded: 4,
  in_progress: 5,
  completed: 6,
  refunded: 7,
  disputed: 8,
};

export function dealStatusRank(key: string): number {
  return DEAL_STATUS_RANK[key] ?? 99;
}

/** Shared UI labels. Pages that need a contextual label (e.g. "Awaiting
 *  counterparty" for draft) should extend this map locally rather than
 *  re-declaring the full table. */
export const DEAL_STATUS_LABELS: Record<MirrorDealStatus, string> = {
  draft: "Draft",
  "seller-ready": "Counterparty reviewing",
  "seller-agreed": "Ready to fund",
  "manual-chat": "Manual negotiation",
  proposed: "Ready to sign",
  escalated: "Renegotiation requested",
  funded: "Funded",
  in_progress: "In progress",
  completed: "Sealed",
  refunded: "Refunded",
  disputed: "Disputed",
};

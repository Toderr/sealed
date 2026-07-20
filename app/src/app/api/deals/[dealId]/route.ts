import { supabase, table } from "@/lib/supabase";
import { incrementDeal } from "@/lib/reputation";
import { queueNotification } from "@/lib/notify";
import { requireWallet } from "@/lib/auth";
import { HttpError, json, withRoute } from "@/lib/api-error";

type DealMilestone = {
  description: string;
  amount: number;
  status?: string;
  release_tx?: string;
  proof_by?: "seller" | "buyer";
};

const DEAL_STATUSES = new Set([
  "draft",
  "seller-ready",
  "seller-agreed",
  "manual-chat",
  "escalated",
  "proposed",
  "funded",
  "in_progress",
  "completed",
  "refunded",
  "disputed",
]);

const PATCH_FIELDS = new Set([
  "seller_wallet",
  "buyer_wallet",
  "status",
  "milestones",
  "title",
  "description",
  "total_amount_usdc",
  "funded_at",
]);

function normalizeDealStatus(status: unknown): string | null {
  if (typeof status !== "string") return null;
  const normalized = status.trim().replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
  const lower = normalized
    .replace(/^_/, "")
    .replace("in_progress", "in_progress")
    .replace("created", "draft")
    .replace("funded", "funded")
    .replace("completed", "completed")
    .replace("refunded", "refunded")
    .replace("disputed", "disputed");
  return DEAL_STATUSES.has(lower) ? lower : null;
}

function sanitizeMilestones(value: unknown): DealMilestone[] | null {
  if (!Array.isArray(value)) return null;

  const milestones: DealMilestone[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const milestone = item as Record<string, unknown>;
    if (typeof milestone.description !== "string" || typeof milestone.amount !== "number") {
      return null;
    }
    const next: DealMilestone = {
      description: milestone.description,
      amount: milestone.amount,
    };
    if (typeof milestone.status === "string") next.status = milestone.status;
    // Preserve the on-chain release tx signature (N3/N8) so it survives PATCH.
    if (typeof milestone.release_tx === "string") next.release_tx = milestone.release_tx;
    // Preserve who's responsible for uploading this milestone's proof (#11) so
    // it isn't stripped on every milestone PATCH.
    if (milestone.proof_by === "seller" || milestone.proof_by === "buyer") {
      next.proof_by = milestone.proof_by;
    }
    milestones.push(next);
  }

  return milestones;
}

function allMilestonesReleased(milestones: DealMilestone[]) {
  return (
    milestones.length > 0 &&
    milestones.every((m) => m.status === "Released")
  );
}

export const GET = withRoute<{ params: Promise<{ dealId: string }> }>(
  async (_req, { params }) => {
    const { dealId } = await params;

    const { data, error } = await supabase
      .from(table("deals"))
      .select("*")
      .eq("deal_id", dealId)
      .single();

    if (error || !data) {
      throw new HttpError(404, "Deal not found");
    }
    return json({ deal: data });
  }
);

// Statuses where escrow is NOT yet on-chain — the only deals that may be
// deleted (bug #15). Once a deal is funded/in-progress/etc. it holds real
// on-chain state and must never be removed from the mirror.
const PRE_ESCROW_STATUSES = new Set([
  "draft",
  "seller-ready",
  "seller-agreed",
  "manual-chat",
  "proposed",
  "escalated",
]);

export const DELETE = withRoute<{ params: Promise<{ dealId: string }> }>(
  async (req, { params }) => {
    const wallet = requireWallet(req);
    const { dealId } = await params;

    const { data: existing } = await supabase
      .from(table("deals"))
      .select("buyer_wallet, seller_wallet, status")
      .eq("deal_id", dealId)
      .single();

    if (!existing) throw new HttpError(404, "Deal not found");

    // Only a party to the deal may delete it.
    if (existing.buyer_wallet !== wallet && existing.seller_wallet !== wallet) {
      throw new HttpError(403, "Forbidden");
    }

    // Hard guard: reject deletion once escrow exists on-chain. The client hides
    // the button for these, but never trust the client for a destructive action.
    const status = normalizeDealStatus(existing.status) ?? existing.status;
    if (!PRE_ESCROW_STATUSES.has(status)) {
      throw new HttpError(409, "This deal has funds in escrow and can't be deleted");
    }

    const { error } = await supabase
      .from(table("deals"))
      .delete()
      .eq("deal_id", dealId);

    if (error) throw new HttpError(500, error.message);
    return json({ ok: true, deleted: dealId });
  }
);

export const PATCH = withRoute<{ params: Promise<{ dealId: string }> }>(
  async (req, { params }) => {
  const wallet = requireWallet(req);

  const { dealId } = await params;

  const { data: existing } = await supabase
    .from(table("deals"))
    .select("buyer_wallet, seller_wallet, status, milestones")
    .eq("deal_id", dealId)
    .single();

  if (!existing) {
    throw new HttpError(404, "Deal not found");
  }

  const body = (await req.json()) as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.some((key) => !PATCH_FIELDS.has(key))) {
    throw new HttpError(400, "Unsupported deal update field");
  }

  // Validate + block reassigning either party slot to a DIFFERENT wallet, while
  // allowing idempotent re-set (same wallet) so onAgree can send the slot again.
  for (const field of ["seller_wallet", "buyer_wallet"] as const) {
    const val = body[field];
    if (val && (typeof val !== "string" || val.length < 32)) {
      throw new HttpError(400, field === "seller_wallet" ? "Invalid seller wallet" : "Invalid buyer wallet");
    }
    const current = existing[field as "seller_wallet" | "buyer_wallet"];
    if (val && current && val !== current) {
      throw new HttpError(409, "Counterparty already assigned");
    }
  }

  // Allow a new wallet to join into an EMPTY party slot (buyer or seller) when
  // they're setting their own wallet. They may also set status/milestones in the
  // same request (e.g. when Supabase sync lagged). Generalized so a seller-as-
  // inviter deal lets the joiner fill the empty buyer slot too.
  const joinAllowedFields = new Set([
    "seller_wallet",
    "buyer_wallet",
    "status",
    "milestones",
    "total_amount_usdc",
  ]);
  const isJoiningParty =
    ((!existing.seller_wallet && body.seller_wallet === wallet) ||
      (!existing.buyer_wallet && body.buyer_wallet === wallet)) &&
    Object.keys(body).every((k) => joinAllowedFields.has(k));

  if (!isJoiningParty && existing.buyer_wallet !== wallet && existing.seller_wallet !== wallet) {
    throw new HttpError(403, "Forbidden");
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.seller_wallet === "string") patch.seller_wallet = body.seller_wallet;
  if (typeof body.buyer_wallet === "string") patch.buyer_wallet = body.buyer_wallet;

  // Reject-and-recycle (#19): a party may explicitly CLEAR the OTHER slot (set to
  // null) to release the current counterparty and reopen the deal for a new
  // joiner via the same invite link. Only the deal owner's own slot must stay;
  // clearing your own slot is not allowed. Only valid pre-escrow.
  for (const field of ["seller_wallet", "buyer_wallet"] as const) {
    if (body[field] === null) {
      const mine = existing.buyer_wallet === wallet ? "buyer_wallet" : "seller_wallet";
      if (field === mine) {
        throw new HttpError(400, "You can't clear your own slot");
      }
      if (!PRE_ESCROW_STATUSES.has(normalizeDealStatus(existing.status) ?? existing.status)) {
        throw new HttpError(409, "Can't change parties once escrow exists");
      }
      patch[field] = null;
    }
  }

  // The two parties must stay distinct. Compute the resulting slots (patched
  // value wins, else the existing one) and reject a collapse — e.g. a joiner
  // filling both empty slots with their own wallet, or setting one slot to the
  // wallet already in the other. A single-wallet deal breaks join/notify logic.
  const resultingBuyer =
    typeof body.buyer_wallet === "string" ? body.buyer_wallet : existing.buyer_wallet;
  const resultingSeller =
    typeof body.seller_wallet === "string" ? body.seller_wallet : existing.seller_wallet;
  if (resultingBuyer && resultingSeller && resultingBuyer === resultingSeller) {
    throw new HttpError(400, "Buyer and seller must be different wallets");
  }

  if (body.status !== undefined) {
    const nextStatus = normalizeDealStatus(body.status);
    if (!nextStatus) {
      throw new HttpError(400, "Invalid deal status");
    }
    patch.status = nextStatus;
  }

  if (body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim().length === 0) {
      throw new HttpError(400, "Invalid title");
    }
    patch.title = body.title;
  }

  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== "string") {
      throw new HttpError(400, "Invalid description");
    }
    patch.description = body.description;
  }

  if (body.total_amount_usdc !== undefined) {
    if (typeof body.total_amount_usdc !== "number" || !Number.isFinite(body.total_amount_usdc)) {
      throw new HttpError(400, "Invalid total amount");
    }
    patch.total_amount_usdc = body.total_amount_usdc;
  }

  if (body.funded_at !== undefined) {
    if (body.funded_at !== null && typeof body.funded_at !== "string") {
      throw new HttpError(400, "Invalid funded_at");
    }
    patch.funded_at = body.funded_at;
  }

  const nextMilestones =
    body.milestones === undefined
      ? ((existing.milestones ?? []) as DealMilestone[])
      : sanitizeMilestones(body.milestones);

  if (nextMilestones === null) {
    throw new HttpError(400, "Invalid milestones");
  }

  if (body.milestones !== undefined) {
    patch.milestones = nextMilestones;
  }

  if (allMilestonesReleased(nextMilestones)) {
    patch.status = "completed";
  }

  if (patch.status === "completed" && !allMilestonesReleased(nextMilestones)) {
    throw new HttpError(400, "All milestones must be released before completing a deal");
  }

  const { data, error } = await supabase
    .from(table("deals"))
    .update(patch)
    .eq("deal_id", dealId)
    .select()
    .single();

  if (error) throw new HttpError(500, error.message);

  const wasCompleted = normalizeDealStatus(existing.status) === "completed";
  const isCompleted = normalizeDealStatus(data.status) === "completed";
  if (!wasCompleted && isCompleted) {
    const wallets = [data.buyer_wallet, data.seller_wallet].filter(Boolean) as string[];
    try {
      await Promise.all(wallets.map((partyWallet) => incrementDeal(partyWallet, "success")));
    } catch (error) {
      console.error("Failed to increment reputation for completed deal", error);
    }
  }

  // On a fresh escalation (renegotiation reopened), notify the OTHER party out
  // of band — the caller (`wallet`) is the one who requested it. Without this an
  // away-from-app counterparty learns nothing until they next open the app.
  const wasEscalated = normalizeDealStatus(existing.status) === "escalated";
  const isEscalated = normalizeDealStatus(data.status) === "escalated";
  if (!wasEscalated && isEscalated) {
    const counterparty = [data.buyer_wallet, data.seller_wallet]
      .filter(Boolean)
      .find((w) => w !== wallet) as string | undefined;
    if (counterparty) {
      try {
        await queueNotification(counterparty, "renegotiation_escalated", { deal_id: dealId });
      } catch (error) {
        console.error("Failed to queue renegotiation notification", error);
      }
    }
  }

  return json({ deal: data });
  }
);

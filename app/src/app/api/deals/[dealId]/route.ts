import { supabase, table } from "@/lib/supabase";
import { incrementDeal } from "@/lib/reputation";
import { queueNotification } from "@/lib/notify";
import { requireWallet } from "@/lib/auth";
import { HttpError, json, withRoute } from "@/lib/api-error";

type DealMilestone = {
  description: string;
  amount: number;
  status?: string;
};

const DEAL_STATUSES = new Set([
  "draft",
  "seller-ready",
  "seller-agreed",
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
  "status",
  "milestones",
  "title",
  "description",
  "total_amount_usdc",
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

  // Block changing seller_wallet to a DIFFERENT wallet, but allow idempotent re-set
  // (same wallet) so onAgree can send { seller_wallet, status } without a 409.
  if (
    body.seller_wallet &&
    (typeof body.seller_wallet !== "string" || body.seller_wallet.length < 32)
  ) {
    throw new HttpError(400, "Invalid seller wallet");
  }

  if (body.seller_wallet && existing.seller_wallet && body.seller_wallet !== existing.seller_wallet) {
    throw new HttpError(409, "Counterparty already assigned");
  }

  // Allow a new wallet to join as seller when the slot is empty and they're
  // setting their own wallet. They may also set status in the same request
  // (e.g. seller_wallet + status: "seller-agreed" when Supabase sync lagged).
  const sellerJoinAllowedFields = new Set([
    "seller_wallet",
    "status",
    "milestones",
    "total_amount_usdc",
  ]);
  const isJoiningAsSeller =
    !existing.seller_wallet &&
    body.seller_wallet === wallet &&
    Object.keys(body).every((k) => sellerJoinAllowedFields.has(k));

  if (!isJoiningAsSeller && existing.buyer_wallet !== wallet && existing.seller_wallet !== wallet) {
    throw new HttpError(403, "Forbidden");
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.seller_wallet === "string") patch.seller_wallet = body.seller_wallet;

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

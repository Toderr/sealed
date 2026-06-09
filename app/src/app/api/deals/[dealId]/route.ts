import { NextRequest } from "next/server";
import { supabase, table } from "@/lib/supabase";
import { incrementDeal } from "@/lib/reputation";
import { walletOrError } from "@/lib/auth";

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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  const { dealId } = await params;

  const { data, error } = await supabase
    .from(table("deals"))
    .select("*")
    .eq("deal_id", dealId)
    .single();

  if (error || !data) {
    return Response.json({ error: "Deal not found" }, { status: 404 });
  }
  return Response.json({ deal: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  const wallet = walletOrError(req);
  if (wallet instanceof Response) return wallet;

  const { dealId } = await params;

  const { data: existing } = await supabase
    .from(table("deals"))
    .select("buyer_wallet, seller_wallet, status, milestones")
    .eq("deal_id", dealId)
    .single();

  if (!existing) {
    return Response.json({ error: "Deal not found" }, { status: 404 });
  }

  const body = (await req.json()) as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.some((key) => !PATCH_FIELDS.has(key))) {
    return Response.json({ error: "Unsupported deal update field" }, { status: 400 });
  }

  // Block changing seller_wallet to a DIFFERENT wallet, but allow idempotent re-set
  // (same wallet) so onAgree can send { seller_wallet, status } without a 409.
  if (
    body.seller_wallet &&
    (typeof body.seller_wallet !== "string" || body.seller_wallet.length < 32)
  ) {
    return Response.json({ error: "Invalid seller wallet" }, { status: 400 });
  }

  if (body.seller_wallet && existing.seller_wallet && body.seller_wallet !== existing.seller_wallet) {
    return Response.json({ error: "Counterparty already assigned" }, { status: 409 });
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
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.seller_wallet === "string") patch.seller_wallet = body.seller_wallet;

  if (body.status !== undefined) {
    const nextStatus = normalizeDealStatus(body.status);
    if (!nextStatus) {
      return Response.json({ error: "Invalid deal status" }, { status: 400 });
    }
    patch.status = nextStatus;
  }

  if (body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim().length === 0) {
      return Response.json({ error: "Invalid title" }, { status: 400 });
    }
    patch.title = body.title;
  }

  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== "string") {
      return Response.json({ error: "Invalid description" }, { status: 400 });
    }
    patch.description = body.description;
  }

  if (body.total_amount_usdc !== undefined) {
    if (typeof body.total_amount_usdc !== "number" || !Number.isFinite(body.total_amount_usdc)) {
      return Response.json({ error: "Invalid total amount" }, { status: 400 });
    }
    patch.total_amount_usdc = body.total_amount_usdc;
  }

  const nextMilestones =
    body.milestones === undefined
      ? ((existing.milestones ?? []) as DealMilestone[])
      : sanitizeMilestones(body.milestones);

  if (nextMilestones === null) {
    return Response.json({ error: "Invalid milestones" }, { status: 400 });
  }

  if (body.milestones !== undefined) {
    patch.milestones = nextMilestones;
  }

  if (allMilestonesReleased(nextMilestones)) {
    patch.status = "completed";
  }

  if (patch.status === "completed" && !allMilestonesReleased(nextMilestones)) {
    return Response.json(
      { error: "All milestones must be released before completing a deal" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from(table("deals"))
    .update(patch)
    .eq("deal_id", dealId)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

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

  return Response.json({ deal: data });
}

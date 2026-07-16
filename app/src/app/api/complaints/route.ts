import { supabase, table } from "@/lib/supabase";
import { requireWallet } from "@/lib/auth";
import { requireAdmin } from "@/lib/admin";
import { HttpError, json, withRoute } from "@/lib/api-error";

// User-reported problems. POST: any authenticated user files a complaint (about
// a deal or general). GET: admin-only list for the dashboard. Mediate-only —
// filing a complaint does not touch escrow; the team reviews and nudges.

const CATEGORIES = new Set(["non_delivery", "quality", "communication", "payment", "account", "other"]);

// POST /api/complaints — file a complaint. Optionally reports an account
// (reported_wallet + category "account") rather than only a deal.
export const POST = withRoute(async (request) => {
  const wallet = requireWallet(request);
  const body = (await request.json()) as {
    deal_id?: string | null;
    reported_wallet?: string | null;
    category?: string;
    message?: string;
  };

  const message = (body.message ?? "").trim();
  if (!message) throw new HttpError(400, "message required");
  if (message.length > 4000) throw new HttpError(400, "message too long");
  const category = CATEGORIES.has(body.category ?? "") ? body.category : "other";

  const reportedWallet = (body.reported_wallet ?? "").trim() || null;
  if (reportedWallet && reportedWallet === wallet) {
    throw new HttpError(400, "cannot report your own account");
  }

  const { data, error } = await supabase
    .from(table("complaints"))
    .insert({
      deal_id: body.deal_id ?? null,
      reporter_wallet: wallet,
      reported_wallet: reportedWallet,
      category,
      message,
      status: "open",
    })
    .select()
    .single();

  if (error) throw new HttpError(500, error.message);
  return json({ complaint: data });
});

// GET /api/complaints — admin-only list, newest first, optional status filter.
export const GET = withRoute(async (request) => {
  const guard = requireAdmin(request);
  if (guard) return guard;

  const params = request.nextUrl.searchParams;
  const statuses = params
    .getAll("status")
    .flatMap((s) => s.split(","))
    .map((s) => s.trim())
    .filter(Boolean);
  const limit = Math.min(Number(params.get("limit")) || 100, 200);
  const offset = Math.max(Number(params.get("offset")) || 0, 0);

  let query = supabase
    .from(table("complaints"))
    .select("id, deal_id, reporter_wallet, reported_wallet, category, message, status, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (statuses.length > 0) query = query.in("status", statuses);

  const { data, error, count } = await query;
  if (error) throw new HttpError(500, error.message);
  return json({ complaints: data ?? [], count: count ?? 0, limit, offset });
});

// PATCH /api/complaints — admin-only status update.
export const PATCH = withRoute(async (request) => {
  const guard = requireAdmin(request);
  if (guard) return guard;

  const body = (await request.json()) as { id?: string; status?: string };
  const STATUSES = new Set(["open", "reviewing", "resolved", "dismissed"]);
  if (!body.id || !STATUSES.has(body.status ?? "")) {
    throw new HttpError(400, "id and valid status required");
  }

  const { error } = await supabase
    .from(table("complaints"))
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq("id", body.id);
  if (error) throw new HttpError(500, error.message);
  return json({ ok: true });
});

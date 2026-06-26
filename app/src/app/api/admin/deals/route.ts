import { supabase, table } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin";
import { HttpError, json, withRoute } from "@/lib/api-error";

// Admin-only, READ-ONLY listing of every deal in the off-chain mirror. Gated by
// the ADMIN_WALLETS allowlist (lib/admin.ts) like /api/admin/kyc. Supports
// status filtering, a free-text search over deal_id / title / party wallets, and
// offset pagination so we never ship the whole table to the client.

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

export const GET = withRoute(async (request) => {
  const wallet = request.headers.get("x-wallet");
  const guard = requireAdmin(wallet);
  if (guard) return guard;

  const params = request.nextUrl.searchParams;
  const status = params.get("status")?.trim() || null;
  const q = params.get("q")?.trim() || null;
  const limit = Math.min(Number(params.get("limit")) || DEFAULT_LIMIT, MAX_LIMIT);
  const offsetRaw = Number(params.get("offset")) || 0;
  const offset = offsetRaw > 0 ? offsetRaw : 0;

  let query = supabase
    .from(table("deals"))
    .select(
      "deal_id, buyer_wallet, seller_wallet, title, total_amount_usdc, status, milestones, created_at, updated_at",
      { count: "exact" }
    )
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("status", status);
  if (q) {
    // Match the search term against the deal id, title, or either party wallet.
    query = query.or(
      `deal_id.ilike.%${q}%,title.ilike.%${q}%,buyer_wallet.ilike.%${q}%,seller_wallet.ilike.%${q}%`
    );
  }

  const { data, error, count } = await query;
  if (error) throw new HttpError(500, error.message);

  // Derive a compact milestone summary so the client table doesn't have to walk
  // the JSONB array itself.
  const deals = (data ?? []).map((d) => {
    const milestones = Array.isArray(d.milestones) ? d.milestones : [];
    const done = milestones.filter(
      (m: { status?: string }) =>
        m?.status === "Released" || m?.status === "Completed"
    ).length;
    return {
      deal_id: d.deal_id,
      buyer_wallet: d.buyer_wallet,
      seller_wallet: d.seller_wallet,
      title: d.title,
      total_amount_usdc: d.total_amount_usdc,
      status: d.status,
      milestones_total: milestones.length,
      milestones_done: done,
      created_at: d.created_at,
      updated_at: d.updated_at,
    };
  });

  return json({ deals, count: count ?? deals.length, limit, offset });
});

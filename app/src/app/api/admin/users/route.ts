import { supabase, table } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin";
import { HttpError, json, withRoute } from "@/lib/api-error";

// Admin-only, READ-ONLY listing of every user, with their reputation aggregate
// joined in. Gated by ADMIN_WALLETS (lib/admin.ts). Supports a KYC-status filter,
// a free-text search over wallet / handle / display_name / email, and offset
// pagination. Reputation lives in a separate table (sealed_reputation, keyed by
// wallet), so we batch-fetch it for the page of users rather than rely on a DB
// foreign-key join.

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

export const GET = withRoute(async (request) => {
  const guard = await requireAdmin(request);
  if (guard) return guard;

  const params = request.nextUrl.searchParams;
  // kyc may be repeated (?kyc=approved&kyc=pending) or comma-separated.
  const kycStatuses = params
    .getAll("kyc")
    .flatMap((s) => s.split(","))
    .map((s) => s.trim())
    .filter(Boolean);
  const q = params.get("q")?.trim() || null;
  // emailVerified: "true" → only verified, "false" → only unverified, else any.
  const emailVerified = params.get("emailVerified")?.trim() || null;
  const limit = Math.min(Number(params.get("limit")) || DEFAULT_LIMIT, MAX_LIMIT);
  const offsetRaw = Number(params.get("offset")) || 0;
  const offset = offsetRaw > 0 ? offsetRaw : 0;

  let query = supabase
    .from(table("users"))
    .select(
      "wallet, handle, display_name, email, email_verified, kyc_status, member_since",
      { count: "exact" }
    )
    .order("member_since", { ascending: false })
    .range(offset, offset + limit - 1);

  if (kycStatuses.length > 0) query = query.in("kyc_status", kycStatuses);
  if (emailVerified === "true") query = query.eq("email_verified", true);
  else if (emailVerified === "false") query = query.eq("email_verified", false);
  if (q) {
    query = query.or(
      `wallet.ilike.%${q}%,handle.ilike.%${q}%,display_name.ilike.%${q}%,email.ilike.%${q}%`
    );
  }

  const { data: users, error, count } = await query;
  if (error) throw new HttpError(500, error.message);

  // Batch-fetch reputation aggregates for just this page of wallets.
  const wallets = (users ?? []).map((u) => u.wallet);
  const repByWallet: Record<string, { deals_total: number; deals_successful: number; avg_rating: number }> = {};
  if (wallets.length > 0) {
    const { data: reps } = await supabase
      .from(table("reputation"))
      .select("wallet, deals_total, deals_successful, avg_rating")
      .in("wallet", wallets);
    for (const r of reps ?? []) {
      repByWallet[r.wallet] = {
        deals_total: r.deals_total ?? 0,
        deals_successful: r.deals_successful ?? 0,
        avg_rating: r.avg_rating ?? 0,
      };
    }
  }

  const rows = (users ?? []).map((u) => ({
    wallet: u.wallet,
    handle: u.handle,
    display_name: u.display_name,
    email: u.email,
    email_verified: u.email_verified,
    kyc_status: u.kyc_status,
    member_since: u.member_since,
    reputation: repByWallet[u.wallet] ?? { deals_total: 0, deals_successful: 0, avg_rating: 0 },
  }));

  return json({ users: rows, count: count ?? rows.length, limit, offset });
});

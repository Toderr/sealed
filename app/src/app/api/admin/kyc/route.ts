import { supabase, table } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin";
import { HttpError, json, withRoute } from "@/lib/api-error";

export const GET = withRoute(async (request) => {
  const guard = await requireAdmin(request);
  if (guard) return guard;

  const { data, error } = await supabase
    .from(table("users"))
    .select("wallet, handle, email, kyc_status, kyc_document_url, kyc_submitted_at")
    .in("kyc_status", ["pending", "approved", "rejected"])
    .order("kyc_submitted_at", { ascending: false })
    .limit(100);

  if (error) throw new HttpError(500, error.message);
  return json({ submissions: data ?? [] });
});

export const POST = withRoute(async (request) => {
  const guard = await requireAdmin(request);
  if (guard) return guard;

  const body = await request.json();
  const { target_wallet, decision } = body as {
    target_wallet?: string;
    decision?: "approved" | "rejected";
  };

  if (!target_wallet || (decision !== "approved" && decision !== "rejected")) {
    throw new HttpError(400, "target_wallet and decision (approved|rejected) required");
  }

  const update: Record<string, unknown> = { kyc_status: decision };
  if (decision === "approved") {
    update.verified_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from(table("users"))
    .update(update)
    .eq("wallet", target_wallet);

  if (error) throw new HttpError(500, error.message);
  return json({ ok: true, target_wallet, status: decision });
});

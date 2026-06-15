import { supabase, table } from "@/lib/supabase";
import { HttpError, json, withRoute } from "@/lib/api-error";

export const GET = withRoute(async (request) => {
  const dealId = request.nextUrl.searchParams.get("deal_id");
  if (!dealId) throw new HttpError(400, "Missing deal_id");

  const { data, error } = await supabase
    .from(table("deliverables"))
    .select("id, filename, content_type, size_bytes, submitter_wallet, storage_key, milestone_index, created_at, scan_status")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false });

  if (error) return json({ deliverables: [] });
  return json({ deliverables: data ?? [] });
});

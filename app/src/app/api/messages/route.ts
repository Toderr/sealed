import { supabase, table } from "@/lib/supabase";
import { HttpError, json, withRoute } from "@/lib/api-error";

export const GET = withRoute(async (request) => {
  const dealId = request.nextUrl.searchParams.get("deal_id");
  if (!dealId) throw new HttpError(400, "Missing deal_id");

  const { data, error } = await supabase
    .from(table("messages"))
    .select("id, role, content, wallet, metadata, created_at")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: true });

  if (error) return json({ messages: [] });
  return json({ messages: data ?? [] });
});

export const POST = withRoute(async (request) => {
  const body = await request.json();
  const { deal_id, role, content, wallet, metadata } = body;

  if (!deal_id || !role || !content) {
    throw new HttpError(400, "Missing fields");
  }

  if (!["user", "assistant", "system", "tool"].includes(role)) {
    throw new HttpError(400, "Invalid role");
  }

  const safeMetadata =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata
      : {};

  const { data, error } = await supabase
    .from(table("messages"))
    .insert({ deal_id, role, content, wallet, metadata: safeMetadata })
    .select()
    .single();

  if (error) throw new HttpError(500, error.message);
  return json({ message: data });
});

import { NextRequest } from "next/server";
import { insforge, table } from "@/lib/insforge";

export async function GET(request: NextRequest) {
  const dealId = request.nextUrl.searchParams.get("deal_id");
  if (!dealId) return Response.json({ error: "Missing deal_id" }, { status: 400 });

  const { data, error } = await insforge.database
    .from(table("deliverables"))
    .select("id, filename, content_type, size_bytes, submitter_wallet, storage_key, created_at, scan_status")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ deliverables: [] });
  return Response.json({ deliverables: data ?? [] });
}

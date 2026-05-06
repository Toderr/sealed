import { supabase, table } from "@/lib/supabase";

export async function GET(
  _req: Request,
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
  req: Request,
  { params }: { params: Promise<{ dealId: string }> }
) {
  const { dealId } = await params;
  const body = await req.json();

  const { data, error } = await supabase
    .from(table("deals"))
    .update(body)
    .eq("deal_id", dealId)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ deal: data });
}

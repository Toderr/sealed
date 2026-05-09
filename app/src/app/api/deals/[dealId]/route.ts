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

  // If setting seller_wallet, only allow it when the deal has no seller yet
  if (body.seller_wallet) {
    const { data: existing } = await supabase
      .from(table("deals"))
      .select("seller_wallet")
      .eq("deal_id", dealId)
      .single();

    if (existing?.seller_wallet) {
      return Response.json({ error: "Counterparty already assigned" }, { status: 409 });
    }
  }

  const { data, error } = await supabase
    .from(table("deals"))
    .update(body)
    .eq("deal_id", dealId)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ deal: data });
}

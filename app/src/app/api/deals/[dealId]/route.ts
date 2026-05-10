import { NextRequest } from "next/server";
import { supabase, table } from "@/lib/supabase";

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
  const wallet = req.headers.get("x-wallet");
  if (!wallet) {
    return Response.json({ error: "Missing x-wallet header" }, { status: 401 });
  }

  const { dealId } = await params;

  const { data: existing } = await supabase
    .from(table("deals"))
    .select("buyer_wallet, seller_wallet")
    .eq("deal_id", dealId)
    .single();

  if (!existing) {
    return Response.json({ error: "Deal not found" }, { status: 404 });
  }

  const body = await req.json();

  // Block changing seller_wallet to a DIFFERENT wallet, but allow idempotent re-set
  // (same wallet) so onAgree can send { seller_wallet, status } without a 409.
  if (body.seller_wallet && existing.seller_wallet && body.seller_wallet !== existing.seller_wallet) {
    return Response.json({ error: "Counterparty already assigned" }, { status: 409 });
  }

  // Allow a new wallet to join as seller when the slot is empty and they're
  // setting their own wallet. They may also set status in the same request
  // (e.g. seller_wallet + status: "seller-agreed" when Supabase sync lagged).
  const sellerJoinAllowedFields = new Set(["seller_wallet", "status"]);
  const isJoiningAsSeller =
    !existing.seller_wallet &&
    body.seller_wallet === wallet &&
    Object.keys(body).every((k) => sellerJoinAllowedFields.has(k));

  if (!isJoiningAsSeller && existing.buyer_wallet !== wallet && existing.seller_wallet !== wallet) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
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

import { NextRequest } from "next/server";
import { supabase, table } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const wallet = request.headers.get("x-wallet");
  if (!wallet) {
    return Response.json({ error: "Missing x-wallet header" }, { status: 401 });
  }

  const body = await request.json();
  const {
    deal_id,
    seller_wallet,
    title,
    description,
    total_amount_usdc,
    milestones,
    tx_signature,
    status: bodyStatus,
  } = body as {
    deal_id?: string;
    seller_wallet?: string;
    title?: string;
    description?: string;
    total_amount_usdc?: number;
    milestones?: Array<{ description: string; amount: number; status?: string }>;
    tx_signature?: string;
    status?: string;
  };

  if (
    !deal_id ||
    !title ||
    typeof total_amount_usdc !== "number" ||
    !Array.isArray(milestones)
  ) {
    return Response.json(
      { error: "deal_id, title, total_amount_usdc, milestones required" },
      { status: 400 }
    );
  }

  // If deal already exists, verify the caller is the original buyer
  const { data: existing } = await supabase
    .from(table("deals"))
    .select("buyer_wallet")
    .eq("deal_id", deal_id)
    .maybeSingle();

  if (existing && existing.buyer_wallet !== wallet) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from(table("deals"))
    .upsert(
      {
        deal_id,
        buyer_wallet: wallet,
        seller_wallet: seller_wallet ?? null,
        title,
        description: description ?? null,
        total_amount_usdc,
        milestones,
        status: bodyStatus ?? "draft",
      },
      { onConflict: "deal_id" }
    )
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (tx_signature) {
    await supabase.from(table("messages")).insert({
      deal_id,
      role: "system",
      content: `Deal created on-chain. Tx: ${tx_signature}`,
      wallet,
      metadata: { tx_signature },
    });
  }

  return Response.json({ ok: true, deal: data });
}

export async function GET(request: NextRequest) {
  const wallet = request.headers.get("x-wallet");
  if (!wallet) {
    return Response.json({ error: "Missing x-wallet header" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from(table("deals"))
    .select("*")
    .or(`buyer_wallet.eq.${wallet},seller_wallet.eq.${wallet}`)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ deals: data ?? [] });
}

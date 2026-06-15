import { supabase, table } from "@/lib/supabase";
import { requireWallet } from "@/lib/auth";
import { HttpError, json, withRoute } from "@/lib/api-error";

export const POST = withRoute(async (request) => {
  const wallet = requireWallet(request);

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
    throw new HttpError(400, "deal_id, title, total_amount_usdc, milestones required");
  }

  // If deal already exists, verify the caller is the original buyer
  const { data: existing } = await supabase
    .from(table("deals"))
    .select("buyer_wallet")
    .eq("deal_id", deal_id)
    .maybeSingle();

  if (existing && existing.buyer_wallet !== wallet) {
    throw new HttpError(403, "Forbidden");
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
    throw new HttpError(500, error.message);
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

  return json({ ok: true, deal: data });
});

export const GET = withRoute(async (request) => {
  const wallet = requireWallet(request);

  const { data, error } = await supabase
    .from(table("deals"))
    .select("*")
    .or(`buyer_wallet.eq.${wallet},seller_wallet.eq.${wallet}`)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new HttpError(500, error.message);
  return json({ deals: data ?? [] });
});

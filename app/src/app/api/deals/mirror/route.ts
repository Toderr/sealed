import { supabase, table } from "@/lib/supabase";
import { requireWallet } from "@/lib/auth";
import { HttpError, json, withRoute } from "@/lib/api-error";

export const POST = withRoute(async (request) => {
  const wallet = requireWallet(request);

  const body = await request.json();
  const {
    deal_id,
    buyer_wallet: bodyBuyer,
    seller_wallet,
    creator_role,
    title,
    description,
    total_amount_usdc,
    milestones,
    tx_signature,
    status: bodyStatus,
  } = body as {
    deal_id?: string;
    buyer_wallet?: string | null;
    seller_wallet?: string | null;
    creator_role?: "buyer" | "seller";
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

  // Resolve the two slots. The creator (`wallet`) is bound to the slot matching
  // their chosen role; the other slot is the counterparty (may be null until they
  // join). Back-compat: a legacy caller that sends no buyer_wallet/creator_role
  // is treated as the buyer (today's behavior).
  const buyer_wallet =
    creator_role === "seller"
      ? (bodyBuyer ?? null)
      : (bodyBuyer ?? wallet);
  const resolvedSeller =
    creator_role === "seller"
      ? wallet
      : (seller_wallet ?? null);

  // The caller must actually be one of the two parties they're creating.
  if (wallet !== buyer_wallet && wallet !== resolvedSeller) {
    throw new HttpError(403, "Forbidden");
  }

  // The two parties must be distinct. A caller can collapse the deal by feeding
  // their own wallet into both slots (e.g. creator_role:"seller" + buyer_wallet:self);
  // a single-wallet deal has no counterparty and breaks downstream join/notify logic.
  if (buyer_wallet && resolvedSeller && buyer_wallet === resolvedSeller) {
    throw new HttpError(400, "Buyer and seller must be different wallets");
  }

  // If the deal already exists, the caller must be an existing party (buyer OR
  // seller) to mutate it — prevents a third party from overwriting the row.
  const { data: existing } = await supabase
    .from(table("deals"))
    .select("buyer_wallet, seller_wallet")
    .eq("deal_id", deal_id)
    .maybeSingle();

  if (
    existing &&
    existing.buyer_wallet !== wallet &&
    existing.seller_wallet !== wallet
  ) {
    throw new HttpError(403, "Forbidden");
  }

  const { data, error } = await supabase
    .from(table("deals"))
    .upsert(
      {
        deal_id,
        buyer_wallet,
        seller_wallet: resolvedSeller,
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

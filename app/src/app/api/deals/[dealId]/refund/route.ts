import { supabase, table } from "@/lib/supabase";
import { requireWallet } from "@/lib/auth";
import { HttpError, json, withRoute } from "@/lib/api-error";

// Mutual-refund handoff relay. The buyer partial-signs a refund transaction and
// POSTs it here; the seller GETs it, co-signs, broadcasts, then DELETEs (or the
// route marks it completed). Caller must be a party to the deal (buyer/seller).
//
// One open request per deal (deal_id is the PK). Read-only stores the base64
// partial tx — no keys, no signing happens server-side.

type Ctx = { params: Promise<{ dealId: string }> };

async function assertParty(dealId: string, wallet: string) {
  const { data: deal } = await supabase
    .from(table("deals"))
    .select("buyer_wallet, seller_wallet")
    .eq("deal_id", dealId)
    .maybeSingle();
  if (!deal) throw new HttpError(404, "Deal not found");
  if (deal.buyer_wallet !== wallet && deal.seller_wallet !== wallet) {
    throw new HttpError(403, "Forbidden");
  }
  return deal;
}

// GET — fetch the pending refund request for this deal (or null).
export const GET = withRoute<Ctx>(async (request, { params }) => {
  const wallet = requireWallet(request);
  const { dealId } = await params;
  await assertParty(dealId, wallet);

  const { data } = await supabase
    .from(table("refund_requests"))
    .select("*")
    .eq("deal_id", dealId)
    .eq("status", "pending")
    .maybeSingle();

  return json({ request: data ?? null });
});

// POST — the initiator stores their partially-signed refund tx.
export const POST = withRoute<Ctx>(async (request, { params }) => {
  const wallet = requireWallet(request);
  const { dealId } = await params;
  await assertParty(dealId, wallet);

  const body = (await request.json()) as {
    partial_tx?: string;
    blockhash?: string;
    nonce_account?: string;
  };
  if (!body.partial_tx || typeof body.partial_tx !== "string") {
    throw new HttpError(400, "partial_tx required");
  }

  const { data, error } = await supabase
    .from(table("refund_requests"))
    .upsert(
      {
        deal_id: dealId,
        requested_by: wallet,
        partial_tx: body.partial_tx,
        // With durable nonces `blockhash` holds the nonce VALUE, and
        // nonce_account the account that issued it (needed to reclaim rent).
        blockhash: body.blockhash ?? null,
        ...(body.nonce_account ? { nonce_account: body.nonce_account } : {}),
        status: "pending",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "deal_id" }
    )
    .select()
    .single();

  if (error) throw new HttpError(500, error.message);
  return json({ request: data });
});

// DELETE — clear/cancel the request (either party, or after it's broadcast).
export const DELETE = withRoute<Ctx>(async (request, { params }) => {
  const wallet = requireWallet(request);
  const { dealId } = await params;
  await assertParty(dealId, wallet);

  const completed = request.nextUrl.searchParams.get("completed") === "1";
  const { error } = await supabase
    .from(table("refund_requests"))
    .update({ status: completed ? "completed" : "cancelled", updated_at: new Date().toISOString() })
    .eq("deal_id", dealId);

  if (error) throw new HttpError(500, error.message);
  return json({ ok: true });
});

import { supabase, table } from "@/lib/supabase";
import { requireWallet } from "@/lib/auth";
import { HttpError, json, withRoute } from "@/lib/api-error";

// Accept a deal invite as the AUTHENTICATED joiner (session identity). Replaces
// the old client flow that upserted the deal "as the inviter" (impersonation),
// which signed sessions forbid. Here the server fills the joiner's slot from
// their session, and creates the deal row from the invite payload if the
// inviter's original mirror call never landed.
//
// Body: the invite payload fields the client already has:
//   { inviter, inviterRole, dealTitle, description, amount, milestones }
// The joiner's wallet comes from the session, never the body.

type Ctx = { params: Promise<{ dealId: string }> };

export const POST = withRoute<Ctx>(async (request, { params }) => {
  const joiner = await requireWallet(request);
  const { dealId } = await params;

  const body = (await request.json()) as {
    inviter?: string;
    inviterRole?: "buyer" | "seller";
    dealTitle?: string;
    description?: string | null;
    amount?: number;
    milestones?: Array<{ description: string; amount: number }>;
  };

  const inviter = body.inviter;
  const inviterRole = body.inviterRole === "seller" ? "seller" : "buyer";
  if (!inviter) throw new HttpError(400, "Missing inviter");

  // The two parties must differ — no self-accept collapse.
  if (inviter === joiner) {
    throw new HttpError(400, "You can't accept your own invite");
  }

  // Resolve slots: inviter keeps their role; the joiner takes the opposite.
  const buyer_wallet = inviterRole === "buyer" ? inviter : joiner;
  const seller_wallet = inviterRole === "buyer" ? joiner : inviter;
  const myField = joiner === seller_wallet ? "seller_wallet" : "buyer_wallet";

  const { data: existing } = await supabase
    .from(table("deals"))
    .select("buyer_wallet, seller_wallet")
    .eq("deal_id", dealId)
    .maybeSingle();

  if (existing) {
    // The joiner's target slot must be empty (or already them). The other slot
    // must be the inviter — guards against joining a deal you weren't invited to.
    const otherField = myField === "seller_wallet" ? "buyer_wallet" : "seller_wallet";
    const mySlot = existing[myField as "buyer_wallet" | "seller_wallet"];
    const otherSlot = existing[otherField as "buyer_wallet" | "seller_wallet"];

    if (mySlot && mySlot !== joiner) {
      throw new HttpError(409, "That side of the deal is already taken");
    }
    if (otherSlot && otherSlot !== inviter) {
      throw new HttpError(403, "This invite doesn't match the deal");
    }
    if (joiner === otherSlot) {
      throw new HttpError(400, "Buyer and seller must be different wallets");
    }

    const { data, error } = await supabase
      .from(table("deals"))
      .update({ [myField]: joiner, updated_at: new Date().toISOString() })
      .eq("deal_id", dealId)
      .select()
      .single();
    if (error) throw new HttpError(500, error.message);
    return json({ deal: data });
  }

  // Deal row doesn't exist (the inviter's mirror never landed) — create it now
  // from the invite payload, with both slots set.
  const { data, error } = await supabase
    .from(table("deals"))
    .insert({
      deal_id: dealId,
      buyer_wallet,
      seller_wallet,
      title: body.dealTitle ?? dealId,
      description: body.description ?? null,
      total_amount_usdc: body.amount ?? 0,
      milestones: (body.milestones ?? []).map((m) => ({ ...m, status: "Pending" })),
      status: "draft",
    })
    .select()
    .single();
  if (error) throw new HttpError(500, error.message);
  return json({ deal: data });
});

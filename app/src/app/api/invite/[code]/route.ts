// Short invite links: resolve `/i/{code}` → deal, and mint a code for a deal.
//
// The dynamic segment means different things per method, which is worth being
// explicit about:
//   GET  /api/invite/{code}    — public. Resolves an invite code to the payload
//                                the invite page renders. No wallet required:
//                                holding the link IS the authorization, exactly
//                                as it was for the old base64 links.
//   POST /api/invite/{dealId}  — party-only. Mints (or returns) that deal's
//                                code. Keyed by deal_id, not by code — you can't
//                                know the code before it exists.
//
// Codes are minted lazily so old deals cost nothing until someone actually
// shares them.
import { supabase, table } from "@/lib/supabase";
import { requireWallet } from "@/lib/auth";
import { HttpError, json, withRoute } from "@/lib/api-error";
import { getPublicProfile } from "@/lib/sealed-users";
import {
  generateInviteCode,
  inferInviterWallet,
  isInviteCode,
  payloadFromDeal,
} from "@/lib/invite-link";

const DEAL_FIELDS =
  "deal_id, title, description, total_amount_usdc, milestones, buyer_wallet, seller_wallet, status, invite_code";

export const GET = withRoute<{ params: Promise<{ code: string }> }>(
  async (_req, { params }) => {
    const { code } = await params;

    // Reject malformed codes before querying — a 404 either way, but this keeps
    // junk (and injection attempts) off the DB.
    if (!isInviteCode(code)) {
      throw new HttpError(404, "Invite link not found");
    }

    const { data: deal, error } = await supabase
      .from(table("deals"))
      .select(DEAL_FIELDS)
      .eq("invite_code", code)
      .single();

    if (error || !deal) {
      throw new HttpError(404, "Invite link not found");
    }

    // Decorate with the inviter's public profile so the page can render their
    // name/bio without a second round trip. Best-effort: an inviter with no
    // profile row still yields a usable invite.
    const inviterWallet = inferInviterWallet(deal);
    let inviterName: string | null = null;
    let inviterBio: string | null = null;
    if (inviterWallet) {
      try {
        const profile = await getPublicProfile(inviterWallet);
        inviterName = profile?.display_name ?? null;
        inviterBio = profile?.bio ?? null;
      } catch (e) {
        console.error("Failed to load inviter profile for invite", e);
      }
    }

    return json({
      payload: payloadFromDeal(deal, { name: inviterName, bio: inviterBio }),
      deal,
    });
  }
);

export const POST = withRoute<{ params: Promise<{ code: string }> }>(
  async (req, { params }) => {
    const wallet = requireWallet(req);
    // On POST the segment carries the deal_id (see the note at the top).
    const { code: dealId } = await params;

    const { data: existing } = await supabase
      .from(table("deals"))
      .select("deal_id, buyer_wallet, seller_wallet, invite_code")
      .eq("deal_id", dealId)
      .single();

    if (!existing) throw new HttpError(404, "Deal not found");

    // Only a party to the deal may mint its invite code. Without this any wallet
    // could mint a link to someone else's deal and read its terms through GET.
    if (existing.buyer_wallet !== wallet && existing.seller_wallet !== wallet) {
      throw new HttpError(403, "Forbidden");
    }

    // Already minted — reuse it. A stable code means a link stays valid once
    // shared, and re-copying it doesn't invalidate what's already in a chat.
    if (existing.invite_code) {
      return json({ invite_code: existing.invite_code });
    }

    // Retry on the (astronomically unlikely) unique-violation collision rather
    // than trusting a single draw. 23505 is Postgres' unique_violation.
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateInviteCode();
      const { data, error } = await supabase
        .from(table("deals"))
        .update({ invite_code: candidate })
        .eq("deal_id", dealId)
        // Only claim the slot if it's still empty, so two concurrent mints
        // can't overwrite each other's code.
        .is("invite_code", null)
        .select("invite_code")
        .maybeSingle();

      if (!error && data?.invite_code) {
        return json({ invite_code: data.invite_code });
      }

      // No row updated and no error ⇒ another request minted one first; read it.
      if (!error && !data) {
        const { data: raced } = await supabase
          .from(table("deals"))
          .select("invite_code")
          .eq("deal_id", dealId)
          .single();
        if (raced?.invite_code) return json({ invite_code: raced.invite_code });
      }

      if (error && error.code !== "23505") {
        throw new HttpError(500, error.message);
      }
    }

    throw new HttpError(500, "Could not generate an invite code");
  }
);

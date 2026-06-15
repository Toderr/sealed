import { submitRating } from "@/lib/reputation";
import { supabase, table } from "@/lib/supabase";
import { requireWallet } from "@/lib/auth";
import { HttpError, withRoute, json, requireString } from "@/lib/api-error";

type RatingMilestone = { status?: string };

function isDealCompleted(status: unknown, milestones: RatingMilestone[] | null) {
  if (typeof status === "string" && status.toLowerCase() === "completed") return true;
  return (
    Array.isArray(milestones) &&
    milestones.length > 0 &&
    milestones.every((m) => m.status === "Released" || m.status === "Completed")
  );
}

async function getDealForRating(dealId: string) {
  const { data, error } = await supabase
    .from(table("deals"))
    .select("deal_id, buyer_wallet, seller_wallet, status, milestones")
    .eq("deal_id", dealId)
    .single();

  if (error || !data) return null;
  return data as {
    deal_id: string;
    buyer_wallet: string;
    seller_wallet: string | null;
    status: string;
    milestones: RatingMilestone[];
  };
}

function counterpartyFor(deal: Awaited<ReturnType<typeof getDealForRating>>, wallet: string) {
  if (!deal?.seller_wallet) return null;
  if (deal.buyer_wallet === wallet) return deal.seller_wallet;
  if (deal.seller_wallet === wallet) return deal.buyer_wallet;
  return null;
}

export const GET = withRoute(async (request) => {
  const raterWallet = requireWallet(request);
  const dealId = requireString(request.nextUrl.searchParams.get("deal_id"), "deal_id");

  const deal = await getDealForRating(dealId);
  if (!deal) throw new HttpError(404, "Deal not found");

  const rateeWallet = counterpartyFor(deal, raterWallet);
  if (!rateeWallet) throw new HttpError(403, "Forbidden");

  const { data: rating } = await supabase
    .from(table("ratings"))
    .select("id, stars, review_text, revealed, submitted_at, ratee_wallet")
    .eq("deal_id", dealId)
    .eq("rater_wallet", raterWallet)
    .maybeSingle();

  return json({
    rating: rating ?? null,
    canRate: isDealCompleted(deal.status, deal.milestones) && !rating,
    ratee_wallet: rateeWallet,
  });
});

export const POST = withRoute(async (request) => {
  const rater_wallet = requireWallet(request);

  const body = await request.json();
  const { deal_id, ratee_wallet, stars, review_text } = body;

  if (!deal_id || !ratee_wallet || !stars) {
    throw new HttpError(400, "Missing required fields");
  }

  if (typeof deal_id !== "string" || typeof ratee_wallet !== "string") {
    throw new HttpError(400, "Invalid rating payload");
  }

  if (rater_wallet === ratee_wallet) {
    throw new HttpError(400, "Cannot rate yourself");
  }

  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    throw new HttpError(400, "Stars must be between 1 and 5");
  }

  if (review_text !== undefined && typeof review_text !== "string") {
    throw new HttpError(400, "Review text must be a string");
  }

  try {
    const deal = await getDealForRating(deal_id);
    if (!deal) throw new HttpError(404, "Deal not found");

    const expectedRatee = counterpartyFor(deal, rater_wallet);
    if (!expectedRatee || expectedRatee !== ratee_wallet) {
      throw new HttpError(403, "Forbidden");
    }

    if (!isDealCompleted(deal.status, deal.milestones)) {
      throw new HttpError(400, "Deal must be completed before rating");
    }

    const result = await submitRating(
      deal_id,
      rater_wallet,
      ratee_wallet,
      stars,
      (review_text ?? "").slice(0, 500)
    );

    return json({ ok: true, revealed: result.revealed });
  } catch (e) {
    if (e instanceof HttpError) throw e; // preserve 404/403/400 above
    const err = e as Error;
    if (err.message?.includes("unique") || err.message?.includes("23505")) {
      throw new HttpError(409, "Already rated this deal");
    }
    throw new HttpError(500, "Failed to submit rating");
  }
});

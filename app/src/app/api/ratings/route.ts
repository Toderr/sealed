import { NextRequest } from "next/server";
import { submitRating } from "@/lib/reputation";
import { supabase, table } from "@/lib/supabase";

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

export async function GET(request: NextRequest) {
  const raterWallet = request.headers.get("x-wallet");
  if (!raterWallet) {
    return Response.json({ error: "Missing x-wallet header" }, { status: 401 });
  }

  const dealId = request.nextUrl.searchParams.get("deal_id");
  if (!dealId) {
    return Response.json({ error: "Missing deal_id" }, { status: 400 });
  }

  const deal = await getDealForRating(dealId);
  if (!deal) {
    return Response.json({ error: "Deal not found" }, { status: 404 });
  }

  const rateeWallet = counterpartyFor(deal, raterWallet);
  if (!rateeWallet) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: rating } = await supabase
    .from(table("ratings"))
    .select("id, stars, review_text, revealed, submitted_at, ratee_wallet")
    .eq("deal_id", dealId)
    .eq("rater_wallet", raterWallet)
    .maybeSingle();

  return Response.json({
    rating: rating ?? null,
    canRate: isDealCompleted(deal.status, deal.milestones) && !rating,
    ratee_wallet: rateeWallet,
  });
}

export async function POST(request: NextRequest) {
  const rater_wallet = request.headers.get("x-wallet");
  if (!rater_wallet) {
    return Response.json({ error: "Missing x-wallet header" }, { status: 401 });
  }

  const body = await request.json();
  const { deal_id, ratee_wallet, stars, review_text } = body;

  if (!deal_id || !ratee_wallet || !stars) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (typeof deal_id !== "string" || typeof ratee_wallet !== "string") {
    return Response.json({ error: "Invalid rating payload" }, { status: 400 });
  }

  if (rater_wallet === ratee_wallet) {
    return Response.json({ error: "Cannot rate yourself" }, { status: 400 });
  }

  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return Response.json({ error: "Stars must be between 1 and 5" }, { status: 400 });
  }

  if (review_text !== undefined && typeof review_text !== "string") {
    return Response.json({ error: "Review text must be a string" }, { status: 400 });
  }

  try {
    const deal = await getDealForRating(deal_id);
    if (!deal) {
      return Response.json({ error: "Deal not found" }, { status: 404 });
    }

    const expectedRatee = counterpartyFor(deal, rater_wallet);
    if (!expectedRatee || expectedRatee !== ratee_wallet) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!isDealCompleted(deal.status, deal.milestones)) {
      return Response.json({ error: "Deal must be completed before rating" }, { status: 400 });
    }

    const result = await submitRating(
      deal_id,
      rater_wallet,
      ratee_wallet,
      stars,
      (review_text ?? "").slice(0, 500)
    );

    return Response.json({ ok: true, revealed: result.revealed });
  } catch (e) {
    const err = e as Error;
    if (err.message?.includes("unique") || err.message?.includes("23505")) {
      return Response.json({ error: "Already rated this deal" }, { status: 409 });
    }
    return Response.json({ error: "Failed to submit rating" }, { status: 500 });
  }
}

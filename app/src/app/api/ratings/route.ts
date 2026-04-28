import { NextRequest } from "next/server";
import { submitRating } from "@/lib/reputation";
import { queueNotification } from "@/lib/notify";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { deal_id, rater_wallet, ratee_wallet, stars, review_text } = body;

  if (!deal_id || !rater_wallet || !ratee_wallet || !stars) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (stars < 1 || stars > 5) {
    return Response.json({ error: "Stars must be between 1 and 5" }, { status: 400 });
  }

  try {
    const result = await submitRating(
      deal_id,
      rater_wallet,
      ratee_wallet,
      stars,
      review_text ?? ""
    );

    if (result.revealed) {
      await queueNotification(ratee_wallet, "deal_accepted", { deal_id });
    }

    return Response.json({ ok: true, revealed: result.revealed });
  } catch (e) {
    const err = e as Error;
    if (err.message?.includes("unique") || err.message?.includes("23505")) {
      return Response.json({ error: "Already rated this deal" }, { status: 409 });
    }
    return Response.json({ error: "Failed to submit rating" }, { status: 500 });
  }
}

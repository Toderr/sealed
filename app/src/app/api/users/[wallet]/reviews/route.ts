import { supabase, table } from "@/lib/supabase";
import { withRoute, json, HttpError } from "@/lib/api-error";

// Public list of reviews RECEIVED by a wallet — the individual star ratings +
// review text behind the aggregate "Avg rating" (bug #6). Only REVEALED reviews
// are returned: a rating stays hidden until both parties have rated (the
// double-blind guarantee), so unrevealed rows must never leak here.

type ReviewRow = {
  id: string;
  deal_id: string;
  rater_wallet: string;
  stars: number;
  review_text: string | null;
  submitted_at: string;
};

export const GET = withRoute<{ params: Promise<{ wallet: string }> }>(
  async (_req, { params }) => {
    const { wallet } = await params;
    if (!wallet) throw new HttpError(400, "wallet required");

    const { data: rows, error } = await supabase
      .from(table("ratings"))
      .select("id, deal_id, rater_wallet, stars, review_text, submitted_at")
      .eq("ratee_wallet", wallet)
      .eq("revealed", true) // never expose unrevealed (double-blind) reviews
      .order("submitted_at", { ascending: false })
      .limit(100);

    if (error) throw new HttpError(500, error.message);
    const reviews = (rows ?? []) as ReviewRow[];

    if (reviews.length === 0) {
      return json({ reviews: [], count: 0, average: 0 });
    }

    // Batch-resolve reviewer handles + deal titles so the client shows names and
    // which deal each review came from, not raw wallets / slugs.
    const reviewerWallets = [...new Set(reviews.map((r) => r.rater_wallet))];
    const dealIds = [...new Set(reviews.map((r) => r.deal_id))];

    const [{ data: users }, { data: deals }] = await Promise.all([
      supabase
        .from(table("users"))
        .select("wallet, handle, display_name")
        .in("wallet", reviewerWallets),
      supabase
        .from(table("deals"))
        .select("deal_id, title")
        .in("deal_id", dealIds),
    ]);

    const userByWallet = new Map(
      (users ?? []).map((u) => [u.wallet, u as { wallet: string; handle: string | null; display_name: string | null }])
    );
    const titleByDeal = new Map((deals ?? []).map((d) => [d.deal_id, d.title as string | null]));

    const out = reviews.map((r) => {
      const u = userByWallet.get(r.rater_wallet);
      return {
        id: r.id,
        stars: r.stars,
        review_text: r.review_text ?? "",
        submitted_at: r.submitted_at,
        deal_id: r.deal_id,
        deal_title: titleByDeal.get(r.deal_id) ?? r.deal_id,
        reviewer: {
          wallet: r.rater_wallet,
          handle: u?.handle ?? null,
          display_name: u?.display_name ?? null,
        },
      };
    });

    const average =
      out.reduce((s, r) => s + r.stars, 0) / (out.length || 1);

    return json({ reviews: out, count: out.length, average: Math.round(average * 10) / 10 });
  }
);

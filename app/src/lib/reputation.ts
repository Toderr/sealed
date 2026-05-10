import { supabase, table } from "@/lib/supabase";
import type { Reputation } from "@/lib/types";

export async function getReputation(wallet: string): Promise<Reputation | null> {
  const { data, error } = await supabase
    .from(table("reputation"))
    .select("*")
    .eq("wallet", wallet)
    .single();

  if (error || !data) return null;
  return data as Reputation;
}

export async function upsertReputation(wallet: string): Promise<void> {
  await supabase
    .from(table("reputation"))
    .upsert({ wallet }, { onConflict: "wallet", ignoreDuplicates: true });
}

export async function incrementDeal(
  wallet: string,
  outcome: "success" | "failure"
): Promise<void> {
  await supabase.rpc("increment_deal", { p_wallet: wallet, p_outcome: outcome });
}

export async function recalculateAvgRating(wallet: string): Promise<void> {
  const { data } = await supabase
    .from(table("ratings"))
    .select("stars")
    .eq("ratee_wallet", wallet)
    .eq("revealed", true);

  if (!data || data.length === 0) return;

  const avg =
    (data as { stars: number }[]).reduce((sum, r) => sum + r.stars, 0) /
    data.length;

  await supabase
    .from(table("reputation"))
    .update({
      avg_rating: Math.round(avg * 100) / 100,
      updated_at: new Date().toISOString(),
    })
    .eq("wallet", wallet);
}

export async function submitRating(
  dealId: string,
  raterWallet: string,
  rateeWallet: string,
  stars: number,
  reviewText: string
): Promise<{ revealed: boolean }> {
  await supabase.from(table("ratings")).insert({
    deal_id: dealId,
    rater_wallet: raterWallet,
    ratee_wallet: rateeWallet,
    stars,
    review_text: reviewText,
    revealed: false,
  });

  // Check if the other party has already rated
  const { data: counterRating } = await supabase
    .from(table("ratings"))
    .select("id")
    .eq("deal_id", dealId)
    .eq("rater_wallet", rateeWallet)
    .eq("ratee_wallet", raterWallet)
    .single();

  if (counterRating) {
    // Both submitted — reveal all ratings for this deal
    await supabase
      .from(table("ratings"))
      .update({ revealed: true })
      .eq("deal_id", dealId);

    await recalculateAvgRating(raterWallet);
    await recalculateAvgRating(rateeWallet);
    return { revealed: true };
  }

  return { revealed: false };
}

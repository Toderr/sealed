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
  const { error } = await supabase
    .from(table("reputation"))
    .upsert({ wallet }, { onConflict: "wallet", ignoreDuplicates: true });
  if (error) throw new Error(`upsertReputation: ${error.message}`);
}

export async function incrementDeal(
  wallet: string,
  outcome: "success" | "failure"
): Promise<void> {
  const { error } = await supabase.rpc("increment_deal", { p_wallet: wallet, p_outcome: outcome });
  if (error) throw new Error(`incrementDeal: ${error.message}`);
}

export async function recalculateAvgRating(wallet: string): Promise<void> {
  const { data, error } = await supabase
    .from(table("ratings"))
    .select("stars")
    .eq("ratee_wallet", wallet)
    .eq("revealed", true);

  if (error) throw new Error(`recalculateAvgRating read: ${error.message}`);
  if (!data || data.length === 0) return;

  const avg =
    (data as { stars: number }[]).reduce((sum, r) => sum + r.stars, 0) /
    data.length;

  const { error: upsertError } = await supabase
    .from(table("reputation"))
    .upsert(
      {
        wallet,
        avg_rating: Math.round(avg * 100) / 100,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "wallet" }
    );
  if (upsertError) throw new Error(`recalculateAvgRating write: ${upsertError.message}`);
}

// Double-blind: a rating stays hidden (revealed=false) until the counterparty
// has also rated this deal. Returns whether the rating is now visible.
export async function submitRating(
  dealId: string,
  raterWallet: string,
  rateeWallet: string,
  stars: number,
  reviewText: string
): Promise<{ revealed: boolean }> {
  const { error } = await supabase.from(table("ratings")).insert({
    deal_id: dealId,
    rater_wallet: raterWallet,
    ratee_wallet: rateeWallet,
    stars,
    review_text: reviewText,
    revealed: false,
  });
  if (error) throw new Error(error.message);

  const { data: reciprocal, error: reciprocalError } = await supabase
    .from(table("ratings"))
    .select("deal_id")
    .eq("deal_id", dealId)
    .eq("rater_wallet", rateeWallet)
    .eq("ratee_wallet", raterWallet)
    .maybeSingle();
  if (reciprocalError) throw new Error(reciprocalError.message);

  if (!reciprocal) return { revealed: false };

  const { error: revealError } = await supabase
    .from(table("ratings"))
    .update({ revealed: true })
    .eq("deal_id", dealId)
    .or(`rater_wallet.eq.${raterWallet},rater_wallet.eq.${rateeWallet}`);
  if (revealError) throw new Error(revealError.message);

  // Both directions just became visible — refresh both averages.
  await recalculateAvgRating(rateeWallet);
  await recalculateAvgRating(raterWallet);
  return { revealed: true };
}

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
    .upsert(
      {
        wallet,
        avg_rating: Math.round(avg * 100) / 100,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "wallet" }
    );
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
    revealed: true,
  });

  await recalculateAvgRating(rateeWallet);
  return { revealed: true };
}

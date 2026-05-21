import { randomInt } from "crypto";
import { supabase, table } from "@/lib/supabase";
import type { SealedUser, NotificationPrefs, PublicProfile } from "@/lib/types";
import { getReputation } from "@/lib/reputation";

type ProfileDeal = {
  status: string;
  milestones: Array<{ status?: string }> | null;
};

function isSuccessfulDeal(deal: ProfileDeal) {
  return (
    deal.status === "completed" ||
    (Array.isArray(deal.milestones) &&
      deal.milestones.length > 0 &&
      deal.milestones.every((m) => {
        const status = m.status?.toLowerCase();
        return status === "released" || status === "completed";
      }))
  );
}

async function getReputationFallback(wallet: string) {
  const [{ data: deals }, { data: ratings }] = await Promise.all([
    supabase
      .from(table("deals"))
      .select("status, milestones")
      .or(`buyer_wallet.eq.${wallet},seller_wallet.eq.${wallet}`),
    supabase
      .from(table("ratings"))
      .select("stars")
      .eq("ratee_wallet", wallet)
      .eq("revealed", true),
  ]);

  const dealRows = (deals ?? []) as ProfileDeal[];
  const dealsSuccessful = dealRows.filter(isSuccessfulDeal).length;
  const dealsFailed = dealRows.filter(
    (d) => d.status === "refunded" || d.status === "disputed"
  ).length;
  const ratingRows = (ratings ?? []) as { stars: number }[];
  const avgRating =
    ratingRows.length > 0
      ? Math.round(
          (ratingRows.reduce((sum, rating) => sum + rating.stars, 0) /
            ratingRows.length) *
            100
        ) / 100
      : 0;

  return {
    deals_total: dealsSuccessful + dealsFailed,
    deals_successful: dealsSuccessful,
    avg_rating: avgRating,
  };
}

export async function upsertUser(
  wallet: string,
  handle: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from(table("users"))
    .upsert({ wallet, handle }, { onConflict: "wallet", ignoreDuplicates: false });

  if (error) {
    if (error.message?.includes("unique") || error.code === "23505") {
      return { ok: false, error: "Handle already taken" };
    }
    return { ok: false, error: error.message };
  }

  // Ensure reputation row exists
  await supabase
    .from(table("reputation"))
    .upsert({ wallet }, { onConflict: "wallet", ignoreDuplicates: true });

  return { ok: true };
}

export async function getUser(wallet: string): Promise<SealedUser | null> {
  const { data, error } = await supabase
    .from(table("users"))
    .select("*")
    .eq("wallet", wallet)
    .single();

  if (error || !data) return null;
  return data as SealedUser;
}

export async function getUserByHandle(
  handle: string
): Promise<SealedUser | null> {
  const { data, error } = await supabase
    .from(table("users"))
    .select("*")
    .eq("handle", handle)
    .single();

  if (error || !data) return null;
  return data as SealedUser;
}

export async function getPublicProfile(
  wallet: string
): Promise<PublicProfile | null> {
  const user = await getUser(wallet);
  if (!user) return null;

  const rep = await getReputation(wallet);
  const fallback = await getReputationFallback(wallet);

  return {
    handle: user.handle,
    deals_total: Math.max(rep?.deals_total ?? 0, fallback.deals_total),
    deals_successful: Math.max(rep?.deals_successful ?? 0, fallback.deals_successful),
    avg_rating: fallback.avg_rating > 0 ? fallback.avg_rating : rep?.avg_rating ?? 0,
    is_verified: !!user.verified_at,
    member_since: user.member_since,
    display_name: user.display_name ?? null,
    bio: user.bio ?? null,
    avatar_url: user.avatar_url ?? null,
    website: user.website ?? null,
    twitter_handle: user.twitter_handle ?? null,
    linkedin_url: user.linkedin_url ?? null,
    instagram_handle: user.instagram_handle ?? null,
    telegram_handle: user.telegram_handle ?? null,
    company_file_url: user.company_file_url ?? null,
    company_file_name: user.company_file_name ?? null,
  };
}

export async function updateUserProfile(
  wallet: string,
  fields: {
    handle: string;
    display_name?: string;
    bio?: string;
    avatar_url?: string;
    website?: string;
    twitter_handle?: string;
    linkedin_url?: string;
    instagram_handle?: string;
    telegram_handle?: string;
    company_file_url?: string;
    company_file_name?: string;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from(table("users"))
    .upsert(
      { wallet, ...fields },
      { onConflict: "wallet", ignoreDuplicates: false }
    );

  if (error) {
    if (error.message?.includes("unique") || error.code === "23505") {
      return { ok: false, error: "Handle already taken" };
    }
    return { ok: false, error: error.message };
  }

  await supabase
    .from(table("reputation"))
    .upsert({ wallet }, { onConflict: "wallet", ignoreDuplicates: true });

  return { ok: true };
}

export async function updateNotifications(
  wallet: string,
  prefs: NotificationPrefs
): Promise<void> {
  await supabase
    .from(table("users"))
    .update({ notify_on: prefs })
    .eq("wallet", wallet);
}

export async function updateEmail(
  wallet: string,
  email: string
): Promise<string> {
  const otp = randomInt(100000, 1000000).toString();
  await supabase
    .from(table("users"))
    .update({ email, email_verified: false, email_otp: otp })
    .eq("wallet", wallet);
  return otp;
}

export async function verifyEmail(
  wallet: string,
  otp: string
): Promise<boolean> {
  const user = await getUser(wallet);
  if (!user || (user as unknown as { email_otp: string }).email_otp !== otp)
    return false;

  await supabase
    .from(table("users"))
    .update({ email_verified: true, email_otp: null })
    .eq("wallet", wallet);
  return true;
}

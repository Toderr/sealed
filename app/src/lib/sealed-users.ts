import { randomInt } from "crypto";
import { supabase, table } from "@/lib/supabase";
import type { SealedUser, NotificationPrefs, PublicProfile } from "@/lib/types";
import { getReputation } from "@/lib/reputation";

type ProfileDeal = {
  status: string;
  milestones: Array<{ status?: string }> | null;
};

type SupabaseErrorLike = {
  code?: string;
  message?: string;
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

function missingSchemaColumn(error: SupabaseErrorLike | null) {
  const message = error?.message ?? "";
  const match = message.match(/'([^']+)' column/);
  return message.includes("schema cache") ? match?.[1] ?? null : null;
}

async function upsertUserRecord(payload: Record<string, unknown>) {
  const nextPayload = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );

  for (let attempt = 0; attempt < 10; attempt++) {
    const { error } = await supabase
      .from(table("users"))
      .upsert(nextPayload, { onConflict: "wallet", ignoreDuplicates: false });

    if (!error) return { ok: true as const };

    const missingColumn = missingSchemaColumn(error);
    if (
      missingColumn &&
      missingColumn !== "wallet" &&
      missingColumn !== "handle" &&
      Object.prototype.hasOwnProperty.call(nextPayload, missingColumn)
    ) {
      delete nextPayload[missingColumn];
      continue;
    }

    if (error.message?.includes("unique") || error.code === "23505") {
      return { ok: false as const, error: "Handle already taken" };
    }
    return { ok: false as const, error: error.message };
  }

  return { ok: false as const, error: "Unable to save profile" };
}

export async function upsertUser(
  wallet: string,
  handle: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await upsertUserRecord({ wallet, handle });
  if (!result.ok) return result;

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
  const normalized = handle.trim().replace(/^@/, "");
  if (!normalized) return null;

  const { data, error } = await supabase
    .from(table("users"))
    .select("*")
    .ilike("handle", normalized)
    .maybeSingle();

  if (error) return null;
  if (data) return data as SealedUser;

  const { data: generated } = await supabase
    .from(table("users"))
    .select("*")
    .ilike("handle", `${normalized}-%`)
    .order("member_since", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!generated) return null;
  return generated as SealedUser;
}

export async function getPublicProfile(
  wallet: string
): Promise<PublicProfile | null> {
  const [user, rep, fallback] = await Promise.all([
    getUser(wallet),
    getReputation(wallet),
    getReputationFallback(wallet),
  ]);

  return {
    handle: user?.handle ?? null,
    deals_total: Math.max(rep?.deals_total ?? 0, fallback.deals_total),
    deals_successful: Math.max(rep?.deals_successful ?? 0, fallback.deals_successful),
    avg_rating: fallback.avg_rating > 0 ? fallback.avg_rating : rep?.avg_rating ?? 0,
    is_verified: !!user?.verified_at,
    member_since: user?.member_since ?? null,
    display_name: user?.display_name ?? null,
    bio: user?.bio ?? null,
    avatar_url: user?.avatar_url ?? null,
    website: user?.website ?? null,
    twitter_handle: user?.twitter_handle ?? null,
    linkedin_url: user?.linkedin_url ?? null,
    instagram_handle: user?.instagram_handle ?? null,
    telegram_handle: user?.telegram_handle ?? null,
    company_file_url: user?.company_file_url ?? null,
    company_file_name: user?.company_file_name ?? null,
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
  const result = await upsertUserRecord({ wallet, ...fields });
  if (!result.ok) return result;

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

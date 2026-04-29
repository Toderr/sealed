import { supabase, table } from "@/lib/supabase";
import type { SealedUser, NotificationPrefs, PublicProfile } from "@/lib/types";
import { getReputation } from "@/lib/reputation";

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

  return {
    handle: user.handle,
    deals_total: rep?.deals_total ?? 0,
    deals_successful: rep?.deals_successful ?? 0,
    avg_rating: rep?.avg_rating ?? 0,
    is_verified: !!user.verified_at,
    member_since: user.member_since,
  };
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
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
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

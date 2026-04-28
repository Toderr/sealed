import { getPublicProfile, getUser } from "@/lib/sealed-users";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ wallet: string }> }
) {
  const { wallet } = await params;
  const profile = await getPublicProfile(wallet);

  if (!profile) {
    // User not in DB yet — return empty profile
    return Response.json({
      handle: null,
      deals_total: 0,
      deals_successful: 0,
      avg_rating: 0,
      is_verified: false,
      member_since: null,
      notify_on: null,
      email: null,
      email_verified: false,
    });
  }

  // Include private fields only when request comes from the same wallet
  // (basic check via query param — production would use session/JWT)
  const url = new URL(req.url);
  const includePrivate = url.searchParams.get("self") === "1";

  if (includePrivate) {
    const user = await getUser(wallet);
    return Response.json({
      ...profile,
      notify_on: user?.notify_on ?? null,
      email: user?.email ?? null,
      email_verified: user?.email_verified ?? false,
    });
  }

  return Response.json(profile);
}

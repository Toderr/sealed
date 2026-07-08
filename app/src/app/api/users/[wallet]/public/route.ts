import { getPublicProfile, getUser } from "@/lib/sealed-users";
import { getWallet } from "@/lib/auth";
import { withRoute, json } from "@/lib/api-error";

export const GET = withRoute<{ params: Promise<{ wallet: string }> }>(
  async (req, { params }) => {
    const { wallet } = await params;
    const profile = await getPublicProfile(wallet);

    if (!profile) {
      // User not in DB yet — return empty profile
      return json({
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

    // Include private fields only when the AUTHENTICATED session wallet is the
    // profile owner (?self=1 alone is not enough — it was spoofable).
    const url = new URL(req.url);
    const sessionWallet = await getWallet(req);
    const includePrivate =
      url.searchParams.get("self") === "1" && sessionWallet === wallet;

    if (includePrivate) {
      const user = await getUser(wallet);
      return json({
        ...profile,
        notify_on: user?.notify_on ?? null,
        email: user?.email ?? null,
        email_verified: user?.email_verified ?? false,
        kyc_status: user?.kyc_status ?? "none",
      });
    }

    return json(profile);
  }
);

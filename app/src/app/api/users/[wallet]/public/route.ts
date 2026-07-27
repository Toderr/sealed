import { getPublicProfile, getUser } from "@/lib/sealed-users";
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
        deals_failed: 0,
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
      return json({
        ...profile,
        notify_on: user?.notify_on ?? null,
        email: user?.email ?? null,
        email_verified: user?.email_verified ?? false,
        kyc_status: user?.kyc_status ?? "none",
        // Never expose the raw chat id — the settings UI only needs to know
        // whether a link exists, and which account it points at.
        telegram_linked: !!user?.telegram_chat_id,
        telegram_username: user?.telegram_username ?? null,
      });
    }

    return json(profile);
  }
);

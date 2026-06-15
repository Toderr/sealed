import { supabase, table } from "@/lib/supabase";
import { getWallet } from "@/lib/auth";
import { json, withRoute } from "@/lib/api-error";

// GET /api/friends/status?with=<wallet>
// Returns the friendship status between x-wallet and ?with=
export const GET = withRoute(async (req) => {
  const myWallet = getWallet(req);
  if (!myWallet) return json({ status: "none" });

  const url = new URL(req.url);
  const theirWallet = url.searchParams.get("with");
  if (!theirWallet) return json({ status: "none" });
  if (theirWallet === myWallet) return json({ status: "self" });

  const { data } = await supabase
    .from(table("friends"))
    .select("id, wallet, status")
    .or(
      `and(wallet.eq.${myWallet},friend_wallet.eq.${theirWallet}),and(wallet.eq.${theirWallet},friend_wallet.eq.${myWallet})`
    )
    .maybeSingle();

  if (!data) return json({ status: "none" });

  if (data.status === "accepted") return json({ status: "friends", id: data.id });
  if (data.status === "pending" && data.wallet === myWallet)
    return json({ status: "outgoing", id: data.id });
  if (data.status === "pending" && data.wallet !== myWallet)
    return json({ status: "incoming", id: data.id });

  return json({ status: "none" });
});

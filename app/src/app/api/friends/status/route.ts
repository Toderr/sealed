import { NextRequest } from "next/server";
import { supabase, table } from "@/lib/supabase";

// GET /api/friends/status?with=<wallet>
// Returns the friendship status between x-wallet and ?with=
export async function GET(req: NextRequest) {
  const myWallet = req.headers.get("x-wallet");
  if (!myWallet) return Response.json({ status: "none" });

  const url = new URL(req.url);
  const theirWallet = url.searchParams.get("with");
  if (!theirWallet) return Response.json({ status: "none" });
  if (theirWallet === myWallet) return Response.json({ status: "self" });

  const { data } = await supabase
    .from(table("friends"))
    .select("id, wallet, status")
    .or(
      `and(wallet.eq.${myWallet},friend_wallet.eq.${theirWallet}),and(wallet.eq.${theirWallet},friend_wallet.eq.${myWallet})`
    )
    .maybeSingle();

  if (!data) return Response.json({ status: "none" });

  if (data.status === "accepted") return Response.json({ status: "friends", id: data.id });
  if (data.status === "pending" && data.wallet === myWallet)
    return Response.json({ status: "outgoing", id: data.id });
  if (data.status === "pending" && data.wallet !== myWallet)
    return Response.json({ status: "incoming", id: data.id });

  return Response.json({ status: "none" });
}

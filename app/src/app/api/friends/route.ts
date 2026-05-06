import { NextRequest } from "next/server";
import { supabase, table } from "@/lib/supabase";
import { getPublicProfile } from "@/lib/sealed-users";

type FriendRow = {
  id: string;
  wallet: string;
  friend_wallet: string;
  status: string;
  created_at: string;
};

async function enrichRow(row: FriendRow, cpWallet: string) {
  const profile = await getPublicProfile(cpWallet).catch(() => null);
  return { ...row, counterpartyWallet: cpWallet, profile };
}

export async function GET(req: NextRequest) {
  const wallet = req.headers.get("x-wallet");
  if (!wallet) return Response.json({ error: "Missing x-wallet" }, { status: 401 });

  const { data, error } = await supabase
    .from(table("friends"))
    .select("*")
    .or(`wallet.eq.${wallet},friend_wallet.eq.${wallet}`)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as FriendRow[];

  const accepted = rows.filter((r) => r.status === "accepted");
  const incoming = rows.filter((r) => r.status === "pending" && r.friend_wallet === wallet);
  const outgoing = rows.filter((r) => r.status === "pending" && r.wallet === wallet);

  const [friends, pendingIn, pendingOut] = await Promise.all([
    Promise.all(accepted.map((r) => enrichRow(r, r.wallet === wallet ? r.friend_wallet : r.wallet))),
    Promise.all(incoming.map((r) => enrichRow(r, r.wallet))),
    Promise.all(outgoing.map((r) => enrichRow(r, r.friend_wallet))),
  ]);

  return Response.json({ friends, incoming: pendingIn, outgoing: pendingOut });
}

export async function POST(req: NextRequest) {
  const wallet = req.headers.get("x-wallet");
  if (!wallet) return Response.json({ error: "Missing x-wallet" }, { status: 401 });

  const { friendWallet } = (await req.json()) as { friendWallet?: string };
  if (!friendWallet) return Response.json({ error: "friendWallet required" }, { status: 400 });
  if (friendWallet === wallet) return Response.json({ error: "Cannot add yourself" }, { status: 400 });

  // If they already sent us a request, auto-accept it
  const { data: reverse } = await supabase
    .from(table("friends"))
    .select("id, status")
    .eq("wallet", friendWallet)
    .eq("friend_wallet", wallet)
    .maybeSingle();

  if (reverse) {
    if (reverse.status === "accepted") {
      return Response.json({ ok: true, status: "already_friends" });
    }
    await supabase
      .from(table("friends"))
      .update({ status: "accepted" })
      .eq("id", reverse.id);
    return Response.json({ ok: true, status: "accepted" });
  }

  const { data, error } = await supabase
    .from(table("friends"))
    .upsert(
      { wallet, friend_wallet: friendWallet, status: "pending" },
      { onConflict: "wallet,friend_wallet" }
    )
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, status: "pending", id: data.id });
}

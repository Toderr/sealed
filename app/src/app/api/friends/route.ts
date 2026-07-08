import { supabase, table } from "@/lib/supabase";
import { getPublicProfile, getUserByHandle } from "@/lib/sealed-users";
import { requireWallet } from "@/lib/auth";
import { HttpError, json, withRoute } from "@/lib/api-error";

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

export const GET = withRoute(async (req) => {
  const wallet = await requireWallet(req);

  const { data, error } = await supabase
    .from(table("friends"))
    .select("*")
    .or(`wallet.eq.${wallet},friend_wallet.eq.${wallet}`)
    .order("created_at", { ascending: false });

  if (error) throw new HttpError(500, error.message);

  const rows = (data ?? []) as FriendRow[];

  const accepted = rows.filter((r) => r.status === "accepted");
  const incoming = rows.filter((r) => r.status === "pending" && r.friend_wallet === wallet);
  const outgoing = rows.filter((r) => r.status === "pending" && r.wallet === wallet);

  const [friends, pendingIn, pendingOut] = await Promise.all([
    Promise.all(accepted.map((r) => enrichRow(r, r.wallet === wallet ? r.friend_wallet : r.wallet))),
    Promise.all(incoming.map((r) => enrichRow(r, r.wallet))),
    Promise.all(outgoing.map((r) => enrichRow(r, r.friend_wallet))),
  ]);

  return json({ friends, incoming: pendingIn, outgoing: pendingOut });
});

export const POST = withRoute(async (req) => {
  const wallet = await requireWallet(req);

  const { friendWallet, friendHandle } = (await req.json()) as {
    friendWallet?: string;
    friendHandle?: string;
  };

  let resolvedFriendWallet = friendWallet?.trim();
  if (!resolvedFriendWallet && friendHandle?.trim()) {
    const handle = friendHandle.trim().replace(/^@/, "");
    const friend = await getUserByHandle(handle);
    if (!friend) {
      throw new HttpError(404, "Username not found");
    }
    resolvedFriendWallet = friend.wallet;
  }

  if (!resolvedFriendWallet) {
    throw new HttpError(400, "Username required");
  }

  const friendWalletValue = resolvedFriendWallet;
  if (friendWalletValue === wallet) throw new HttpError(400, "Cannot add yourself");

  // If they already sent us a request, auto-accept it
  const { data: reverse } = await supabase
    .from(table("friends"))
    .select("id, status")
    .eq("wallet", friendWalletValue)
    .eq("friend_wallet", wallet)
    .maybeSingle();

  if (reverse) {
    if (reverse.status === "accepted") {
      return json({ ok: true, status: "already_friends" });
    }
    await supabase
      .from(table("friends"))
      .update({ status: "accepted" })
      .eq("id", reverse.id);
    return json({ ok: true, status: "accepted" });
  }

  const { data, error } = await supabase
    .from(table("friends"))
    .upsert(
      { wallet, friend_wallet: friendWalletValue, status: "pending" },
      { onConflict: "wallet,friend_wallet" }
    )
    .select()
    .single();

  if (error) throw new HttpError(500, error.message);
  return json({ ok: true, status: "pending", id: data.id });
});

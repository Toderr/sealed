import { supabase, table } from "@/lib/supabase";
import { getPublicProfile, getUserByHandle } from "@/lib/sealed-users";
import { requireWallet } from "@/lib/auth";
import { queueNotification } from "@/lib/notify";
import { HttpError, json, withRoute, isMissingTableError } from "@/lib/api-error";

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

/** Best-effort friend notification. A queue failure must never fail the friend
 *  request itself — the row is already written by the time we get here.
 *  Mirrors the deal PATCH handler's renegotiation_escalated call. */
async function notifyFriendEvent(
  recipientWallet: string,
  senderWallet: string,
  eventType: "friend_request" | "friend_request_accepted"
) {
  try {
    const sender = await getPublicProfile(senderWallet).catch(() => null);
    const senderName =
      sender?.display_name?.trim() ||
      (sender?.handle ? `@${sender.handle}` : null) ||
      `${senderWallet.slice(0, 4)}…${senderWallet.slice(-4)}`;

    const message =
      eventType === "friend_request"
        ? `${senderName} sent you a friend request.`
        : `${senderName} accepted your friend request.`;

    await queueNotification(recipientWallet, eventType, {
      from_wallet: senderWallet,
      message,
      href: `/profile/${senderWallet}`,
    });
  } catch (error) {
    console.error(`Failed to queue ${eventType} notification`, error);
  }
}

export const GET = withRoute(async (req) => {
  const wallet = requireWallet(req);

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
  const wallet = requireWallet(req);

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
    // Their pending request just became a friendship — tell them it was accepted
    // rather than sending a "friend request" back to the original requester.
    await notifyFriendEvent(friendWalletValue, wallet, "friend_request_accepted");
    return json({ ok: true, status: "accepted" });
  }

  // Already have a row in OUR direction? Don't re-request — the upsert below
  // (onConflict wallet,friend_wallet) would otherwise overwrite an accepted
  // friendship back to "pending", so clicking a friend again re-sent a request.
  const { data: forward } = await supabase
    .from(table("friends"))
    .select("id, status")
    .eq("wallet", wallet)
    .eq("friend_wallet", friendWalletValue)
    .maybeSingle();

  if (forward) {
    return json({
      ok: true,
      status: forward.status === "accepted" ? "already_friends" : "pending",
      id: forward.id,
    });
  }

  const { data, error } = await supabase
    .from(table("friends"))
    .upsert(
      { wallet, friend_wallet: friendWalletValue, status: "pending" },
      { onConflict: "wallet,friend_wallet" }
    )
    .select()
    .single();

  if (error) {
    // The friends table missing from this database (schema not applied) surfaced
    // the raw Postgres error in the UI. Return a clean, honest message instead.
    if (isMissingTableError(error)) {
      throw new HttpError(503, "Friends isn't set up on this server yet.");
    }
    throw new HttpError(500, error.message);
  }

  // Best-effort: the request row is committed above, so a notify failure is
  // logged and swallowed rather than surfaced as a failed friend request.
  await notifyFriendEvent(friendWalletValue, wallet, "friend_request");

  return json({ ok: true, status: "pending", id: data.id });
});

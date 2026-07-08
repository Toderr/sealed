import { supabase, table } from "@/lib/supabase";
import { requireWallet } from "@/lib/auth";
import { HttpError, json, withRoute } from "@/lib/api-error";

export const PATCH = withRoute<{ params: Promise<{ friendWallet: string }> }>(
  async (req, { params }) => {
  const wallet = await requireWallet(req);

  const { friendWallet } = await params;
  const { action } = (await req.json()) as { action?: "accept" | "decline" };
  if (!action) throw new HttpError(400, "action required");

  // Find the incoming request (they sent to us)
  const { data: row, error: findErr } = await supabase
    .from(table("friends"))
    .select("id")
    .eq("wallet", friendWallet)
    .eq("friend_wallet", wallet)
    .eq("status", "pending")
    .maybeSingle();

  if (findErr) throw new HttpError(500, findErr.message);
  if (!row) throw new HttpError(404, "Request not found");

  if (action === "accept") {
    const { error } = await supabase
      .from(table("friends"))
      .update({ status: "accepted" })
      .eq("id", row.id);
    if (error) throw new HttpError(500, error.message);
    return json({ ok: true, status: "accepted" });
  }

  // decline — delete the row
  const { error } = await supabase.from(table("friends")).delete().eq("id", row.id);
  if (error) throw new HttpError(500, error.message);
  return json({ ok: true, status: "declined" });
  }
);

export const DELETE = withRoute<{ params: Promise<{ friendWallet: string }> }>(
  async (req, { params }) => {
  const wallet = await requireWallet(req);

  const { friendWallet } = await params;

  // Delete either direction
  const { error } = await supabase
    .from(table("friends"))
    .delete()
    .or(
      `and(wallet.eq.${wallet},friend_wallet.eq.${friendWallet}),and(wallet.eq.${friendWallet},friend_wallet.eq.${wallet})`
    );

  if (error) throw new HttpError(500, error.message);
  return json({ ok: true });
  }
);

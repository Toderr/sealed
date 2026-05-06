import { NextRequest } from "next/server";
import { supabase, table } from "@/lib/supabase";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ friendWallet: string }> }
) {
  const wallet = req.headers.get("x-wallet");
  if (!wallet) return Response.json({ error: "Missing x-wallet" }, { status: 401 });

  const { friendWallet } = await params;
  const { action } = (await req.json()) as { action?: "accept" | "decline" };
  if (!action) return Response.json({ error: "action required" }, { status: 400 });

  // Find the incoming request (they sent to us)
  const { data: row, error: findErr } = await supabase
    .from(table("friends"))
    .select("id")
    .eq("wallet", friendWallet)
    .eq("friend_wallet", wallet)
    .eq("status", "pending")
    .maybeSingle();

  if (findErr) return Response.json({ error: findErr.message }, { status: 500 });
  if (!row) return Response.json({ error: "Request not found" }, { status: 404 });

  if (action === "accept") {
    const { error } = await supabase
      .from(table("friends"))
      .update({ status: "accepted" })
      .eq("id", row.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, status: "accepted" });
  }

  // decline — delete the row
  const { error } = await supabase.from(table("friends")).delete().eq("id", row.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, status: "declined" });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ friendWallet: string }> }
) {
  const wallet = req.headers.get("x-wallet");
  if (!wallet) return Response.json({ error: "Missing x-wallet" }, { status: 401 });

  const { friendWallet } = await params;

  // Delete either direction
  const { error } = await supabase
    .from(table("friends"))
    .delete()
    .or(
      `and(wallet.eq.${wallet},friend_wallet.eq.${friendWallet}),and(wallet.eq.${friendWallet},friend_wallet.eq.${wallet})`
    );

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

import { NextRequest } from "next/server";
import { supabase, table } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin";

export async function GET(request: NextRequest) {
  const wallet = request.headers.get("x-wallet");
  const guard = requireAdmin(wallet);
  if (guard) return guard;

  const { data, error } = await supabase
    .from(table("users"))
    .select("wallet, handle, email, kyc_status, kyc_document_url, kyc_submitted_at")
    .in("kyc_status", ["pending", "approved", "rejected"])
    .order("kyc_submitted_at", { ascending: false })
    .limit(100);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ submissions: data ?? [] });
}

export async function POST(request: NextRequest) {
  const wallet = request.headers.get("x-wallet");
  const guard = requireAdmin(wallet);
  if (guard) return guard;

  const body = await request.json();
  const { target_wallet, decision } = body as {
    target_wallet?: string;
    decision?: "approved" | "rejected";
  };

  if (!target_wallet || (decision !== "approved" && decision !== "rejected")) {
    return Response.json(
      { error: "target_wallet and decision (approved|rejected) required" },
      { status: 400 }
    );
  }

  const update: Record<string, unknown> = { kyc_status: decision };
  if (decision === "approved") {
    update.verified_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from(table("users"))
    .update(update)
    .eq("wallet", target_wallet);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, target_wallet, status: decision });
}

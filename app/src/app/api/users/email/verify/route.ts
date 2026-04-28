import { NextRequest } from "next/server";
import { verifyEmail } from "@/lib/sealed-users";

export async function POST(request: NextRequest) {
  const { wallet, otp } = await request.json();
  if (!wallet || !otp) return Response.json({ error: "Missing fields" }, { status: 400 });

  const ok = await verifyEmail(wallet, otp);
  if (!ok) return Response.json({ error: "Invalid or expired code" }, { status: 400 });

  return Response.json({ ok: true });
}

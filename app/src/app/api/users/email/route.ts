import { NextRequest } from "next/server";
import { updateEmail } from "@/lib/sealed-users";
import { sendEmail } from "@/lib/notify";

export async function POST(request: NextRequest) {
  const { wallet, email } = await request.json();
  if (!wallet || !email) return Response.json({ error: "Missing fields" }, { status: 400 });

  const otp = await updateEmail(wallet, email);

  await sendEmail(
    email,
    "Your Sealed Agent verification code",
    `<div style="font-family:system-ui,sans-serif;padding:24px;">
      <p style="font-size:16px;margin-bottom:8px;"><strong>Sealed Agent</strong></p>
      <p style="font-size:14px;color:#666;">Your verification code:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#22C55E;margin:16px 0;">${otp}</p>
      <p style="font-size:12px;color:#999;">Expires in 10 minutes. If you didn't request this, ignore it.</p>
    </div>`
  );

  return Response.json({ ok: true });
}

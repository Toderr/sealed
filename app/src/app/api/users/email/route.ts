import { updateEmail } from "@/lib/sealed-users";
import { sendEmail } from "@/lib/notify";
import { withRoute, json, HttpError } from "@/lib/api-error";

export const POST = withRoute(async (request) => {
  const { wallet, email } = await request.json();
  if (!wallet || !email) throw new HttpError(400, "Missing fields");

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

  return json({ ok: true });
});

import { verifyEmail } from "@/lib/sealed-users";
import { withRoute, json, HttpError } from "@/lib/api-error";

export const POST = withRoute(async (request) => {
  const { wallet, otp } = await request.json();
  if (!wallet || !otp) throw new HttpError(400, "Missing fields");

  const ok = await verifyEmail(wallet, otp);
  if (!ok) throw new HttpError(400, "Invalid or expired code");

  return json({ ok: true });
});

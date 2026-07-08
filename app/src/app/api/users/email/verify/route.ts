import { verifyEmail } from "@/lib/sealed-users";
import { requireWallet } from "@/lib/auth";
import { withRoute, json, HttpError } from "@/lib/api-error";

export const POST = withRoute(async (request) => {
  const wallet = await requireWallet(request);
  const { otp } = await request.json();
  if (!otp) throw new HttpError(400, "Missing code");

  const ok = await verifyEmail(wallet, otp);
  if (!ok) throw new HttpError(400, "Invalid or expired code");

  return json({ ok: true });
});

import { updateNotifications } from "@/lib/sealed-users";
import type { NotificationPrefs } from "@/lib/types";
import { requireWallet } from "@/lib/auth";
import { withRoute, json, HttpError } from "@/lib/api-error";

export const PATCH = withRoute(async (request) => {
  const wallet = await requireWallet(request);
  const { notify_on } = await request.json();
  if (!notify_on) throw new HttpError(400, "Missing notify_on");

  await updateNotifications(wallet, notify_on as NotificationPrefs);
  return json({ ok: true });
});

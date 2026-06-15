import { updateNotifications } from "@/lib/sealed-users";
import type { NotificationPrefs } from "@/lib/types";
import { withRoute, json, HttpError } from "@/lib/api-error";

export const PATCH = withRoute(async (request) => {
  const { wallet, notify_on } = await request.json();
  if (!wallet || !notify_on) throw new HttpError(400, "Missing fields");

  await updateNotifications(wallet, notify_on as NotificationPrefs);
  return json({ ok: true });
});

import { NextRequest } from "next/server";
import { updateNotifications } from "@/lib/sealed-users";
import type { NotificationPrefs } from "@/lib/types";

export async function PATCH(request: NextRequest) {
  const { wallet, notify_on } = await request.json();
  if (!wallet || !notify_on) return Response.json({ error: "Missing fields" }, { status: 400 });

  await updateNotifications(wallet, notify_on as NotificationPrefs);
  return Response.json({ ok: true });
}

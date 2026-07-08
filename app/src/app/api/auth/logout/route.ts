import { json, withRoute } from "@/lib/api-error";
import { clearSessionCookie } from "@/lib/session";

// POST /api/auth/logout — clears the session cookie.
export const POST = withRoute(async () => {
  const res = json({ ok: true });
  res.headers.set("Set-Cookie", clearSessionCookie());
  return res;
});

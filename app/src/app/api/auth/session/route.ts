import { json, withRoute } from "@/lib/api-error";
import { walletFromRequest } from "@/lib/session";

// GET /api/auth/session — returns the authenticated wallet from the session
// cookie, or null. Used by the SignInGate to decide whether to prompt sign-in.
export const GET = withRoute(async (req) => {
  const wallet = await walletFromRequest(req);
  return json({ wallet });
});

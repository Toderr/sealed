import { requireWallet } from "@/lib/auth";
import { HttpError, json, withRoute } from "@/lib/api-error";
import { authConfigured, issueNonce } from "@/lib/session";

// GET /api/auth/nonce — issue a stateless sign-in nonce for the given wallet.
// The wallet is taken from the x-wallet header here (this is the pre-session
// step). The nonce is HMAC-signed and short-lived; no storage.
export const GET = withRoute(async (req) => {
  if (!authConfigured()) throw new HttpError(503, "Auth is not configured");
  const wallet = requireWallet(req);
  return json({ nonce: issueNonce(wallet) });
});

import { HttpError, json, withRoute } from "@/lib/api-error";
import { authConfigured, issueNonce } from "@/lib/session";

// Solana pubkey: base58 charset (no 0, O, I, l), 32–44 chars.
const BASE58_PUBKEY = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// GET /api/auth/nonce — issue a stateless sign-in nonce for the wallet named in
// the x-wallet header. This is the PRE-session step (you don't have a session
// yet), so it reads the header directly rather than requiring an auth session.
export const GET = withRoute(async (req) => {
  if (!authConfigured()) throw new HttpError(503, "Auth is not configured");
  const wallet = req.headers.get("x-wallet");
  if (!wallet || !BASE58_PUBKEY.test(wallet)) {
    throw new HttpError(400, "A valid x-wallet header is required");
  }
  return json({ nonce: issueNonce(wallet) });
});

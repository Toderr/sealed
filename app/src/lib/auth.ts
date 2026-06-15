// Accepts both NextRequest and the standard Request (route handlers use either).
// We only read `.headers.get`, which both provide.
import { HttpError } from "@/lib/api-error";

type HeaderReq = Pick<Request, "headers">;

// Solana pubkey: base58 charset (no 0, O, I, l), 32–44 chars.
const BASE58_PUBKEY = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Read + validate the `x-wallet` header. Throws HttpError on failure (caught by
 * withRoute → Response). Use inside a withRoute()-wrapped handler.
 *   - missing header    → 401 (you didn't identify yourself)
 *   - malformed address → 400 (you sent something, but it isn't a wallet)
 *
 * NOTE: this currently TRUSTS the header — there is no signature proof yet.
 * TODO(security): replace header trust with signed-message verification.
 */
export function requireWallet(req: HeaderReq): string {
  const wallet = req.headers.get("x-wallet");
  if (!wallet) {
    throw new HttpError(401, "Missing x-wallet header");
  }
  if (!BASE58_PUBKEY.test(wallet)) {
    throw new HttpError(400, "Invalid wallet address");
  }
  return wallet;
}

/**
 * Non-throwing variant: returns the wallet if present + valid, else null.
 * For routes where the wallet is optional (e.g. personalization) or where
 * absence is a normal, non-error case.
 */
export function getWallet(req: HeaderReq): string | null {
  const wallet = req.headers.get("x-wallet");
  return wallet && BASE58_PUBKEY.test(wallet) ? wallet : null;
}

/**
 * Early-return variant that fits the existing route style without try/catch.
 * Returns either the validated wallet or a ready-to-return error Response:
 *
 *   const auth = walletOrError(req);
 *   if (auth instanceof Response) return auth;
 *   const wallet = auth;  // validated string
 *
 *   - missing header    → 401 { error: "Missing x-wallet header" }
 *   - malformed address → 400 { error: "Invalid wallet address" }
 */
export function walletOrError(req: HeaderReq): string | Response {
  const wallet = req.headers.get("x-wallet");
  if (!wallet) {
    return Response.json({ error: "Missing x-wallet header" }, { status: 401 });
  }
  if (!BASE58_PUBKEY.test(wallet)) {
    return Response.json({ error: "Invalid wallet address" }, { status: 400 });
  }
  return wallet;
}

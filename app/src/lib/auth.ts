// Server-side identity resolution. Reads the wallet from the SIGNED SESSION
// cookie first (sign-in-with-Solana); falls back to the legacy unsigned
// `x-wallet` header only when AUTH_ALLOW_HEADER_FALLBACK=true (migration escape
// hatch). Once every route + client is on sessions, set the flag to false to
// close the spoofing hole entirely.
//
// All three helpers are async (session verification is async). Call sites use
// `await requireWallet(req)` etc.
import { HttpError } from "@/lib/api-error";
import { walletFromRequest, authConfigured } from "@/lib/session";
import { MOCK_DATA } from "@/lib/env";

// Solana pubkey: base58 charset (no 0, O, I, l), 32–44 chars.
const BASE58_PUBKEY = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function headerFallbackEnabled(): boolean {
  // Offline dev mode can't produce a real signature (mock signMessage returns
  // zeros), so it always uses the x-wallet header. MOCK_DATA is hard-forced
  // false in production builds (see env.ts), so this can never weaken prod.
  if (MOCK_DATA) return true;
  // Default OFF once auth is configured; the flag re-enables the header path
  // during migration. If auth isn't configured at all, always allow the header
  // (so the app keeps working before AUTH_JWT_SECRET is set).
  if (!authConfigured()) return true;
  return process.env.AUTH_ALLOW_HEADER_FALLBACK === "true";
}

/** The authenticated wallet: session cookie, or (if allowed) the x-wallet header. */
async function resolveWallet(req: Request): Promise<string | null> {
  const fromSession = await walletFromRequest(req);
  if (fromSession) return fromSession;
  if (headerFallbackEnabled()) {
    const h = req.headers.get("x-wallet");
    if (h && BASE58_PUBKEY.test(h)) return h;
  }
  return null;
}

/**
 * Require an authenticated wallet. Throws HttpError (caught by withRoute).
 *   - not authenticated → 401
 */
export async function requireWallet(req: Request): Promise<string> {
  const wallet = await resolveWallet(req);
  if (!wallet) throw new HttpError(401, "Not authenticated — sign in first");
  return wallet;
}

/** Non-throwing: the authenticated wallet, or null. */
export async function getWallet(req: Request): Promise<string | null> {
  return resolveWallet(req);
}

/**
 * Early-return variant: the validated wallet, or a ready-to-return 401 Response.
 *
 *   const auth = await walletOrError(req);
 *   if (auth instanceof Response) return auth;
 *   const wallet = auth;
 */
export async function walletOrError(req: Request): Promise<string | Response> {
  const wallet = await resolveWallet(req);
  if (!wallet) return Response.json({ error: "Not authenticated" }, { status: 401 });
  return wallet;
}

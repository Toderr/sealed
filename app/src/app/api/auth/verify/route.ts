import { HttpError, json, withRoute } from "@/lib/api-error";
import {
  authConfigured,
  issueSession,
  sessionCookie,
  signInMessage,
  verifyNonce,
  verifyWalletSignature,
} from "@/lib/session";

// POST /api/auth/verify — complete the handshake. Verifies the nonce (that we
// issued it, unexpired) and the wallet's ed25519 signature over the sign-in
// message, then issues a session JWT in an httpOnly cookie.
export const POST = withRoute(async (req) => {
  if (!authConfigured()) throw new HttpError(503, "Auth is not configured");

  const body = (await req.json()) as {
    wallet?: string;
    signature?: string;
    nonce?: string;
  };
  const { wallet, signature, nonce } = body;
  if (!wallet || !signature || !nonce) {
    throw new HttpError(400, "wallet, signature and nonce are required");
  }

  if (!verifyNonce(wallet, nonce)) {
    throw new HttpError(401, "Nonce is invalid or expired — request a fresh one");
  }
  if (!verifyWalletSignature(wallet, signInMessage(wallet, nonce), signature)) {
    throw new HttpError(401, "Signature does not match the wallet");
  }

  const token = await issueSession(wallet);
  const res = json({ ok: true, wallet });
  res.headers.set("Set-Cookie", sessionCookie(token));
  return res;
});

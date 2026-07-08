// Sign-in-with-Solana core (Phase 1 foundation — additive, no behavior change).
//
// The handshake: server issues a short-lived, STATELESS nonce (an HMAC-signed
// token — no DB row); the wallet signs a human-readable message containing it;
// the server verifies the ed25519 signature + the nonce's HMAC, then issues a
// session JWT stored in an httpOnly cookie. Because the nonce is self-verifying,
// there is no nonce table — the tiny replay window is bounded by a ~2-min TTL.

import { SignJWT, jwtVerify } from "jose";
import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";
import { createHmac, timingSafeEqual } from "crypto";

const secretStr = process.env.AUTH_JWT_SECRET ?? "";
const SECRET = new TextEncoder().encode(secretStr);

export const SESSION_COOKIE = "sealed_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24h
const NONCE_TTL_MS = 2 * 60 * 1000; // 2 minutes

/** True when auth is configured (a JWT secret is present). */
export function authConfigured(): boolean {
  return secretStr.length >= 16;
}

// ── Nonce (stateless, HMAC-signed) ────────────────────────────────────────────

/** Issue a nonce bound to `wallet`, valid for NONCE_TTL_MS. Format: "<exp>.<mac>". */
export function issueNonce(wallet: string): string {
  const exp = Date.now() + NONCE_TTL_MS;
  const mac = nonceMac(wallet, exp);
  return `${exp}.${mac}`;
}

/** Verify a nonce belongs to `wallet` and hasn't expired. */
export function verifyNonce(wallet: string, nonce: string): boolean {
  const dot = nonce.indexOf(".");
  if (dot < 0) return false;
  const exp = Number(nonce.slice(0, dot));
  const mac = nonce.slice(dot + 1);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = nonceMac(wallet, exp);
  try {
    const a = Buffer.from(mac, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function nonceMac(wallet: string, exp: number): string {
  return createHmac("sha256", secretStr).update(`${wallet}:${exp}`).digest("hex");
}

// ── The message the wallet signs ──────────────────────────────────────────────

export function signInMessage(wallet: string, nonce: string): string {
  return [
    "Sign in to Sealed",
    "",
    "This proves you own this wallet. It is free and does not create a transaction.",
    "",
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

// ── ed25519 signature verification ────────────────────────────────────────────

/** Verify `signatureB64` is `wallet`'s signature over `message`. */
export function verifyWalletSignature(
  wallet: string,
  message: string,
  signatureB64: string
): boolean {
  try {
    const pub = new PublicKey(wallet).toBytes();
    const sig = Buffer.from(signatureB64, "base64");
    const msg = new TextEncoder().encode(message);
    return nacl.sign.detached.verify(msg, sig, pub);
  } catch {
    return false;
  }
}

// ── Session JWT (httpOnly cookie payload) ─────────────────────────────────────

export async function issueSession(wallet: string): Promise<string> {
  return new SignJWT({ sub: wallet })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(SECRET);
}

/** The wallet inside a valid session token, or null. */
export async function walletFromSession(token: string | undefined): Promise<string | null> {
  if (!token || !authConfigured()) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Build the Set-Cookie header value for the session (Secure only in prod). */
export function sessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

/** Clear the session cookie. */
export function clearSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=0`;
}

/** Read a cookie value from a request. */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

/** The authenticated wallet from a request's session cookie, or null. */
export async function walletFromRequest(req: Request): Promise<string | null> {
  return walletFromSession(readCookie(req, SESSION_COOKIE));
}

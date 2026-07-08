// Admin access control for the admin dashboard.
//
// A request is admin if EITHER:
//   1. the AUTHENTICATED session wallet (sign-in-with-Solana) is on the
//      ADMIN_WALLETS allowlist — the strong, signed path, OR
//   2. its x-admin-passcode matches ADMIN_PASSCODE — a fallback shared secret.
//
// With signed sessions, path (1) is no longer spoofable (an attacker can't get
// a session for an allowlisted wallet without its private key). The passcode is
// kept as a convenience/fallback; unset ADMIN_PASSCODE disables it.
//
// `requireAdmin` is async because reading the session is async.

import { getWallet } from "@/lib/auth";

export function isAdminWallet(wallet: string | null | undefined): boolean {
  if (!wallet) return false;
  const list = process.env.ADMIN_WALLETS ?? "";
  const allowed = list
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean);
  return allowed.includes(wallet);
}

/** True only when a non-empty ADMIN_PASSCODE is configured and matches. */
export function isAdminPasscode(passcode: string | null | undefined): boolean {
  const expected = (process.env.ADMIN_PASSCODE ?? "").trim();
  if (!expected) return false; // passcode path disabled when unset
  return typeof passcode === "string" && passcode === expected;
}

/** A request is admin if the (session) wallet is allowlisted OR the passcode matches. */
export async function isAdminRequest(req: Request): Promise<boolean> {
  const wallet = await getWallet(req); // session-first (header fallback per auth.ts)
  if (isAdminWallet(wallet)) return true;
  return isAdminPasscode(req.headers.get("x-admin-passcode"));
}

/**
 * Guard for admin route handlers. Returns a 403 Response to return early, or
 * null when access is allowed.
 *
 *   const guard = await requireAdmin(request);
 *   if (guard) return guard;
 */
export async function requireAdmin(req: Request): Promise<Response | null> {
  if (!(await isAdminRequest(req))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

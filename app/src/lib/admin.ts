// Admin access control for the read-only admin dashboard.
//
// A request is allowed if EITHER:
//   1. its x-wallet is on the ADMIN_WALLETS allowlist, OR
//   2. its x-admin-passcode matches ADMIN_PASSCODE.
//
// The passcode path is a convenience fallback so an operator who isn't on the
// wallet allowlist can still get in with the shared secret. If ADMIN_PASSCODE
// is unset/empty, the passcode path is DISABLED (no blank-passcode bypass) and
// access is wallet-only.
//
// NOTE (security): both factors travel in plain request headers (the wallet is
// unsigned — see lib/auth.ts TODO; the passcode is a shared secret). This is an
// acceptable stopgap for a READ-ONLY internal tool over HTTPS, and a real
// improvement over wallet-address-only. It is NOT a basis for any privileged/
// mutating admin action — that should wait for wallet-signed sessions.

type HeaderReq = Pick<Request, "headers">;

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

/** A request is admin if the wallet is allowlisted OR the passcode matches. */
export function isAdminRequest(req: HeaderReq): boolean {
  const wallet = req.headers.get("x-wallet");
  const passcode = req.headers.get("x-admin-passcode");
  return isAdminWallet(wallet) || isAdminPasscode(passcode);
}

/**
 * Guard for admin route handlers. Returns a 403 Response to return early, or
 * null when access is allowed.
 *
 *   const guard = requireAdmin(request);
 *   if (guard) return guard;
 */
export function requireAdmin(req: HeaderReq): Response | null {
  if (!isAdminRequest(req)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

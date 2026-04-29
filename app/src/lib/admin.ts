export function isAdminWallet(wallet: string | null | undefined): boolean {
  if (!wallet) return false;
  const list = process.env.ADMIN_WALLETS ?? "";
  const allowed = list
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean);
  return allowed.includes(wallet);
}

export function requireAdmin(wallet: string | null | undefined): Response | null {
  if (!isAdminWallet(wallet)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

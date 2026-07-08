"use client";

// Client-side sign-in-with-Solana handshake. Runs: get nonce → wallet signs the
// message → post signature to /api/auth/verify (which sets the session cookie).
// The message format MUST match lib/session.ts `signInMessage`.

import { apiFetch } from "./api-client";

function signInMessage(wallet: string, nonce: string): string {
  return [
    "Sign in to Sealed",
    "",
    "This proves you own this wallet. It is free and does not create a transaction.",
    "",
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(bytes).toString("base64");
}

/** Returns the current session wallet, or null. */
export async function getSessionWallet(): Promise<string | null> {
  const { wallet } = await apiFetch<{ wallet: string | null }>("/api/auth/session");
  return wallet;
}

/** Run the full sign-in handshake. Throws on failure. */
export async function signIn(
  wallet: string,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
): Promise<void> {
  const { nonce } = await apiFetch<{ nonce: string }>("/api/auth/nonce", { wallet });
  const message = new TextEncoder().encode(signInMessage(wallet, nonce));
  const signature = await signMessage(message);
  await apiFetch("/api/auth/verify", {
    method: "POST",
    body: { wallet, signature: toBase64(signature), nonce },
  });
}

export async function signOut(): Promise<void> {
  await apiFetch("/api/auth/logout", { method: "POST" });
}

// Short invite links (`/i/{code}`) and the shared payload shape behind them.
//
// The old links were `/invite/{base64}` with the entire deal JSON encoded into
// the URL — 800-1000+ chars, growing unbounded with milestone text, and broken
// by chat apps that wrap or truncate long URLs. A short link carries only an
// 8-char lookup key; the invite page fetches everything else from the DB, which
// it already did anyway (it has always preferred DB data over the payload).
//
// Old links must keep resolving — they live in people's chat history — so
// `encodeInvite`/`decodeInvite` in profile-store.ts stay exactly as they are and
// `/invite/[token]` still decodes them.

import { InvitePayload } from "@/lib/profile-store";

/** base62: unambiguous-enough, URL-safe with no escaping, case-sensitive. */
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Length of a minted invite code. 62^8 ≈ 2.2e14 (~48 bits). */
export const INVITE_CODE_LENGTH = 8;

/** Matches a well-formed invite code. Used to reject junk before hitting the DB. */
export const INVITE_CODE_PATTERN = /^[0-9A-Za-z]{8}$/;

export function isInviteCode(value: unknown): value is string {
  return typeof value === "string" && INVITE_CODE_PATTERN.test(value);
}

/**
 * Mint a random invite code. Server-side only.
 *
 * Uses crypto.getRandomValues, never Math.random: the code IS the capability to
 * view a deal's terms, so a guessable/predictable code is a disclosure bug.
 * 256 is not a multiple of 62, so a plain `byte % 62` would favour the first
 * four letters of the alphabet; the loop rejection-samples instead.
 */
export function generateInviteCode(length = INVITE_CODE_LENGTH): string {
  // Largest multiple of 62 that fits in a byte (248). Bytes at or above it would
  // skew the first 8 characters of the alphabet, so we redraw those.
  const limit = 256 - (256 % BASE62.length);
  let out = "";
  while (out.length < length) {
    const bytes = new Uint8Array(length - out.length);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b >= limit) continue; // rejection sample — keeps the draw uniform
      out += BASE62[b % BASE62.length];
      if (out.length === length) break;
    }
  }
  return out;
}

/** Absolute URL for a short invite link. `origin` has no trailing slash. */
export function shortInviteUrl(origin: string, code: string): string {
  return `${origin}/i/${code}`;
}

/**
 * Which side does the INVITER hold? On a draft only one party slot is filled —
 * the inviter's — so the populated slot names their role. A seller-created deal
 * has seller_wallet set and buyer_wallet empty, and vice versa.
 *
 * Falls back to "buyer", matching the back-compat rule for old links that
 * predate `inviterRole` (absent ⇒ inviter is the buyer).
 *
 * This same inference was inlined at invite/[token]/page.tsx (resolveInviterWallet)
 * and in the two invite-link generators; it lives here now so they agree.
 */
export function inferInviterRole(deal: {
  buyer_wallet?: string | null;
  seller_wallet?: string | null;
}): "buyer" | "seller" {
  if (deal.seller_wallet && !deal.buyer_wallet) return "seller";
  return "buyer";
}

/** The inviter's wallet — the filled slot on a draft. */
export function inferInviterWallet(deal: {
  buyer_wallet?: string | null;
  seller_wallet?: string | null;
}): string {
  return (inferInviterRole(deal) === "seller" ? deal.seller_wallet : deal.buyer_wallet) ?? "";
}

/**
 * Deal row (Supabase shape) → the payload the invite page renders. Lets the
 * short-link page produce exactly what the legacy base64 page decodes, so both
 * routes can share one presentational component.
 */
export function payloadFromDeal(
  deal: {
    deal_id: string;
    title?: string | null;
    description?: string | null;
    total_amount_usdc?: number | null;
    milestones?: Array<{ description: string; amount: number }> | null;
    buyer_wallet?: string | null;
    seller_wallet?: string | null;
  },
  inviter: { name?: string | null; bio?: string | null } = {}
): InvitePayload {
  const milestones = (deal.milestones ?? []).map((m) => ({
    description: m.description,
    amount: m.amount,
  }));

  return {
    dealId: deal.deal_id,
    dealTitle: deal.title ?? "",
    inviterName: inviter.name ?? "",
    inviterWallet: inferInviterWallet(deal),
    inviterRole: inferInviterRole(deal),
    amount: deal.total_amount_usdc ?? 0,
    currency: "USDC",
    milestoneCount: milestones.length,
    milestones,
    // The invite page shows this as the inviter's blurb, and it has always been
    // the inviter's profile bio rather than the deal description.
    description: inviter.bio ?? deal.description ?? "",
  };
}

/**
 * Fetch (minting if needed) the short invite link for a deal. Client-side.
 * Returns "" when the code can't be minted, so callers can fall back to the
 * legacy long link rather than rendering a broken share box.
 */
export async function fetchShortInviteLink(
  dealId: string,
  wallet: string | null,
  origin: string
): Promise<string> {
  const { apiFetchSafe } = await import("@/lib/api-client");
  const data = await apiFetchSafe<{ invite_code?: string } | null>(
    `/api/invite/${encodeURIComponent(dealId)}`,
    { method: "POST", wallet },
    null
  );
  return data?.invite_code ? shortInviteUrl(origin, data.invite_code) : "";
}

"use client";

// Resolve a wallet address to a human display name (profile handle / display
// name), falling back to a shortened wallet when there's no profile. Centralizes
// the wallet->username lookup so every "Parties" / "Counterparty" render is
// consistent instead of showing raw truncated addresses (bug #4).
//
// Backed by SWR so repeated lookups of the same wallet dedupe + cache across the
// app. Never throws; on any error it returns the shortened wallet.

import { useApi } from "@/lib/swr";
import { atDisplayHandle } from "@/lib/user-display";
import { shortenAddress } from "@/lib/types";

type PublicProfile = {
  handle?: string | null;
  display_name?: string | null;
};

/**
 * Best display name for `wallet`. Prefers the profile's display_name, then the
 * @handle, then a shortened wallet. Pass `youWallet` to relabel your own wallet
 * as "You".
 *
 *   const name = useDisplayName(deal.seller_wallet, wallet);
 */
export function useDisplayName(
  wallet: string | null | undefined,
  youWallet?: string | null
): string {
  const enabled = !!wallet;
  const { data } = useApi<PublicProfile>(
    enabled ? `/api/users/${wallet}/public` : null,
    null,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

  if (!wallet) return "—";
  if (youWallet && wallet === youWallet) return "You";

  const displayName = data?.display_name?.trim();
  if (displayName) return displayName;

  const handle = atDisplayHandle(data?.handle);
  if (handle) return handle;

  return shortenAddress(wallet);
}

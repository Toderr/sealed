"use client";

// App-wide wallet hook. Branches on MOCK_CHAIN (a build-time constant, so the
// conditional hook call is stable for a given build — rules-of-hooks is safe to
// disable here). Real builds use the Solana wallet adapter; mock builds use the
// fake wallet. The app imports useAppWallet instead of the adapter's useWallet.

import { useWallet as useSolanaWallet } from "@solana/wallet-adapter-react";
import { MOCK_CHAIN } from "./env";
import { useMockWallet } from "./mock-wallet";

export function useAppWallet() {
  if (MOCK_CHAIN) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useMockWallet();
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useSolanaWallet();
}

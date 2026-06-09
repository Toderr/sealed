"use client";

// App-wide connection hook. In mock mode there is no ConnectionProvider, so this
// returns a null connection. The mocked sendTx/getUsdcBalance/cosign functions in
// escrow-client.ts never dereference the connection when MOCK_CHAIN is on.

import { useConnection as useSolanaConnection } from "@solana/wallet-adapter-react";
import type { Connection } from "@solana/web3.js";
import { MOCK_CHAIN } from "./env";

export function useAppConnection(): { connection: Connection } {
  if (MOCK_CHAIN) {
    // No RPC in mock mode; mocked escrow-client functions ignore this.
    return { connection: null as unknown as Connection };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useSolanaConnection();
}

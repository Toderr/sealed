"use client";

import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";

import "@solana/wallet-adapter-react-ui/styles.css";

import { MOCK_CHAIN } from "@/lib/env";
import { MockWalletProvider } from "@/lib/mock-wallet";

export default function WalletProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Local no-blockchain dev mode: fake wallet, no RPC connection.
  if (MOCK_CHAIN) {
    return <MockWalletProvider>{children}</MockWalletProvider>;
  }
  return <RealWalletProvider>{children}</RealWalletProvider>;
}

function RealWalletProvider({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(
    () =>
      process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl("devnet"),
    []
  );

  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}

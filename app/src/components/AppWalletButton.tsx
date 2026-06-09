"use client";

// Wrapper around the Solana wallet-adapter's WalletMultiButton.
//
// WalletMultiButton reads the REAL adapter WalletContext internally (via
// useWalletMultiButton), which doesn't exist in mock mode — so it throws
// "tried to read 'wallet' on a WalletContext without providing one". In mock
// mode the wallet is always auto-connected, so we render a harmless stub
// instead. Real mode renders the actual button, lazily (client-only).

import dynamic from "next/dynamic";
import { MOCK_CHAIN } from "@/lib/env";

const RealWalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

export default function AppWalletButton(props: { className?: string }) {
  if (MOCK_CHAIN) {
    // Auto-connected in mock mode; nothing to connect.
    return null;
  }
  return <RealWalletMultiButton {...props} />;
}

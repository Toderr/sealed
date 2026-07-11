"use client";

// "Switch wallet" action for the header wallet menu.
//
// In real mode this disconnects the current wallet and reopens the
// wallet-adapter picker modal (the same thing the adapter's own "Change wallet"
// does). In mock mode there is no picker — the wallet is auto-connected and the
// Buyer/Seller role switcher lives in its own control — so switching isn't a
// concept and `canSwitch` is false.
//
// MOCK_CHAIN is a build-time constant, so the conditional hook call is stable
// for a given build (same pattern as use-app-wallet.ts). rules-of-hooks is safe
// to disable here.

import { useAppWallet as useWallet } from "@/lib/use-app-wallet";
import { MOCK_CHAIN } from "@/lib/env";

export function useSwitchWallet(): { canSwitch: boolean; switchWallet: () => Promise<void> } {
  if (MOCK_CHAIN) {
    return { canSwitch: false, switchWallet: async () => {} };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useRealSwitchWallet();
}

function useRealSwitchWallet(): { canSwitch: boolean; switchWallet: () => Promise<void> } {
  // Imported lazily via require so the mock build never pulls in the modal hook
  // (which throws without WalletModalProvider).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useWalletModal } = require("@solana/wallet-adapter-react-ui");
  const { disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  const switchWallet = async () => {
    try {
      await disconnect();
    } catch {
      /* ignore — we still want to open the picker */
    }
    setVisible(true);
  };

  return { canSwitch: true, switchWallet };
}

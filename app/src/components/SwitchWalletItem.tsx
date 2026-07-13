"use client";

// "Switch wallet" menu item — real-mode only.
//
// Isolated in its own component so useWalletModal() only runs when this is
// actually rendered (i.e. under the real WalletModalProvider). WalletMenu gates
// it on !MOCK_CHAIN, so it never mounts in mock mode where there's no provider.
//
// Uses the SAME static ESM import of the wallet-adapter UI as WalletProvider —
// a lazy require() here would resolve a separate CJS copy of the package with a
// distinct WalletModalContext, so setVisible() would throw "without providing
// one" even though a provider is mounted.

import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";

export default function SwitchWalletItem({
  onDone,
  render,
}: {
  onDone: () => void;
  render: (onClick: () => void) => React.ReactNode;
}) {
  const { setVisible } = useWalletModal();
  const { disconnect } = useWallet();

  const handleSwitch = async () => {
    onDone();
    try {
      await disconnect();
    } catch {
      /* still open the picker even if disconnect fails */
    }
    setVisible(true);
  };

  return <>{render(handleSwitch)}</>;
}

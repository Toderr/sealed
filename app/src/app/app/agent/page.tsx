"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { SealedMark } from "@/components/SealedLogo";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

export default function AgentSettingsRedirectPage() {
  const { publicKey } = useWallet();
  const router = useRouter();
  const wallet = publicKey?.toBase58() ?? null;

  useEffect(() => {
    if (!wallet) return;
    router.replace(`/profile/${wallet}?tab=agent`);
  }, [router, wallet]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-5 px-4 text-center">
      <SealedMark size={40} title="Sealed" />
      <div className="space-y-1">
        <p className="text-[18px] text-primary" style={{ fontWeight: 590 }}>
          Agent setup lives in your profile
        </p>
        <p className="text-[13px] text-muted">
          Connect your wallet to open agent settings.
        </p>
      </div>
      {!wallet && <WalletMultiButton />}
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppWallet as useWallet } from "@/lib/use-app-wallet";
import { SealedMark } from "@/components/SealedLogo";
import { useProfileStore } from "@/lib/profile-store";

import WalletMultiButton from "@/components/AppWalletButton";

export default function ProfilePage() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const { profile, loaded } = useProfileStore(wallet);
  const router = useRouter();

  // Depend on the boolean, not the `profile` object (fresh reference every
  // render), to avoid an infinite redirect/render loop across the onboarding
  // pages.
  const onboardingComplete = profile?.onboardingComplete ?? false;
  useEffect(() => {
    if (!loaded || !wallet) return;
    router.replace(onboardingComplete ? `/profile/${wallet}` : "/onboarding");
  }, [loaded, onboardingComplete, router, wallet]);

  if (!loaded) return null;

  if (!wallet) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 px-4 text-center">
        <SealedMark size={44} title="Sealed" />
        <div className="space-y-2">
          <h1 className="text-[22px] text-primary" style={{ fontWeight: 590 }}>
            Connect your wallet to view your profile
          </h1>
          <p className="text-[14px] text-muted">
            Your Sealed identity appears on your profile page after connecting.
          </p>
        </div>
        <WalletMultiButton />
      </div>
    );
  }

  return null;
}

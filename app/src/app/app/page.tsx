"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import ChatInterface from "@/components/ChatInterface";
import DealDashboard from "@/components/DealDashboard";
import SettingsModal from "@/components/SettingsModal";
import { useToast } from "@/components/Toast";
import { useProfileStore } from "@/lib/profile-store";
import { DealParams } from "@/lib/types";
import { useWallet } from "@solana/wallet-adapter-react";

type View = "chat" | "deals";

export default function Home() {
  const [view, setView] = useState<View>("chat");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { publicKey } = useWallet();
  const { profile, loaded: profileLoaded } = useProfileStore(
    publicKey?.toBase58() ?? null
  );
  const toast = useToast();
  const router = useRouter();

  // Redirect to onboarding if wallet connected but profile not set up
  useEffect(() => {
    if (profileLoaded && publicKey && !profile?.onboardingComplete) {
      router.replace("/onboarding");
    }
  }, [profileLoaded, publicKey, profile, router]);

  // Save draft and navigate to negotiation room
  async function handleDealDrafted(params: DealParams): Promise<void> {
    if (!publicKey) {
      toast.show({
        variant: "info",
        title: "Connect wallet first",
        description: "Connect your wallet to create a deal.",
      });
      return;
    }

    const dealTitle = params.title ?? params.dealId;

    // Always save to sessionStorage first so the negotiate room can load it
    // even if the Supabase sync fails
    const draftDeal = {
      deal_id: params.dealId,
      buyer_wallet: publicKey.toBase58(),
      seller_wallet: params.sellerWallet ?? "",
      title: dealTitle,
      description: params.milestones.map((m) => m.description).join(" | "),
      total_amount_usdc: params.totalAmount,
      milestones: params.milestones.map((m) => ({
        description: m.description,
        amount: m.amount,
        status: "Pending",
      })),
      status: "draft",
    };
    try {
      sessionStorage.setItem(`deal:${params.dealId}`, JSON.stringify(draftDeal));
    } catch {
      // sessionStorage unavailable (private mode etc.) — continue anyway
    }

    // Sync to Supabase in the background; non-fatal
    fetch("/api/deals/mirror", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wallet": publicKey.toBase58(),
      },
      body: JSON.stringify({
        deal_id: params.dealId,
        seller_wallet: params.sellerWallet ?? null,
        title: dealTitle,
        description: params.milestones.map((m) => m.description).join(" | "),
        total_amount_usdc: params.totalAmount,
        milestones: params.milestones.map((m) => ({
          description: m.description,
          amount: m.amount,
          status: "Pending",
        })),
        status: "draft",
      }),
    }).catch(() => {
      // Supabase sync failed — deal is still accessible from sessionStorage
    });

    router.push(`/negotiate/${params.dealId}`);
  }

  const onTabChange = (tab: "chat" | "deals") => {
    setView(tab);
  };

  const activeTab: "chat" | "deals" = view === "deals" ? "deals" : "chat";

  return (
    <div className="flex flex-col h-screen">
      <Header
        activeTab={activeTab}
        onTabChange={onTabChange}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <main className="flex-1 overflow-hidden">
        {view === "chat" ? (
          <ChatInterface onDealCreated={handleDealDrafted} />
        ) : (
          <DealDashboard />
        )}
      </main>
      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import ChatInterface from "@/components/ChatInterface";
import DealDashboard from "@/components/DealDashboard";
import SettingsModal from "@/components/SettingsModal";
import { useToast } from "@/components/Toast";
import { useDealsStore } from "@/lib/deals-store";
import { useProfileStore } from "@/lib/profile-store";
import { DealParams } from "@/lib/types";
import type { Deal } from "@/lib/types";
import { useWallet } from "@solana/wallet-adapter-react";

type View = "chat" | "deals";

export default function Home() {
  const [view, setView] = useState<View>("chat");
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { publicKey } = useWallet();
  const { deals } = useDealsStore(publicKey ?? null);
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

  // Save draft to Supabase and navigate to negotiation room
  async function handleDealDrafted(params: DealParams): Promise<void> {
    if (!publicKey) {
      toast.show({
        variant: "info",
        title: "Connect wallet first",
        description: "Connect your wallet to create a deal.",
      });
      return;
    }

    try {
      await fetch("/api/deals/mirror", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet": publicKey.toBase58(),
        },
        body: JSON.stringify({
          deal_id: params.dealId,
          seller_wallet: params.sellerWallet,
          title: params.dealId,
          description: params.milestones.map((m) => m.description).join(" | "),
          total_amount_usdc: params.totalAmount,
          milestones: params.milestones.map((m) => ({
            description: m.description,
            amount: m.amount,
            status: "Pending",
          })),
          status: "draft",
        }),
      });
    } catch {
      // Non-fatal — proceed to room even if mirror fails
    }

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
          <DealDashboard
            deals={deals}
            selectedDeal={selectedDeal}
            onSelectDeal={setSelectedDeal}
          />
        )}
      </main>
      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}

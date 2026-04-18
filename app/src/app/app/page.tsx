"use client";

import { useState } from "react";
import Header from "@/components/Header";
import ChatInterface from "@/components/ChatInterface";
import DealDashboard from "@/components/DealDashboard";
import SettingsModal from "@/components/SettingsModal";
import { useToast } from "@/components/Toast";
import { useDealsStore } from "@/lib/deals-store";
import {
  DealParams,
  DealStatus,
  MilestoneStatus,
  usdcToLamports,
} from "@/lib/types";
import type { Deal } from "@/lib/types";
import { PublicKey } from "@solana/web3.js";
import {
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { buildCreateDealIx, sendTx } from "@/lib/escrow-client";

// Program deployed to devnet: 3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ
const ON_CHAIN_ENABLED = true;

export default function Home() {
  const [activeTab, setActiveTab] = useState<"chat" | "deals">("chat");
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { deals, addDeal } = useDealsStore(publicKey ?? null);
  const toast = useToast();

  async function handleDealCreated(params: DealParams) {
    const now = Math.floor(Date.now() / 1000);
    const newDeal: Deal = {
      dealId: params.dealId,
      buyer: publicKey || PublicKey.default,
      seller: new PublicKey(params.sellerWallet),
      mint: PublicKey.default,
      escrowTokenAccount: PublicKey.default,
      totalAmount: usdcToLamports(params.totalAmount),
      fundedAmount: 0,
      releasedAmount: 0,
      status: DealStatus.Created,
      milestones: params.milestones.map((m) => ({
        description: m.description,
        amount: usdcToLamports(m.amount),
        status: MilestoneStatus.Pending,
        confirmedBy: null,
        confirmedAt: null,
      })),
      createdAt: now,
      updatedAt: now,
      bump: 0,
    };

    addDeal(newDeal);
    setActiveTab("deals");

    if (!ON_CHAIN_ENABLED) {
      toast.show({
        variant: "info",
        title: "Deal drafted",
        description: `${params.dealId} saved locally. Connect wallet to fund on-chain.`,
      });
      return;
    }

    if (!publicKey || !signTransaction) {
      toast.show({
        variant: "info",
        title: "Deal drafted (offline)",
        description: "Connect your wallet to push this deal on-chain.",
      });
      return;
    }

    const pendingId = toast.show({
      variant: "loading",
      title: "Creating deal on-chain",
      description: `Submitting ${params.dealId} to devnet...`,
      duration: 0,
    });

    try {
      const ix = await buildCreateDealIx(publicKey, params);
      const sig = await sendTx(connection, ix, signTransaction);
      toast.update(pendingId, {
        variant: "success",
        title: "Deal created on-chain",
        description: `${params.dealId} confirmed on devnet.`,
        actionHref: `https://solscan.io/tx/${sig}?cluster=devnet`,
        actionLabel: "View on Solscan",
      });
    } catch (err) {
      console.error("On-chain deal creation failed:", err);
      toast.update(pendingId, {
        variant: "error",
        title: "On-chain submit failed",
        description:
          err instanceof Error ? err.message : "Unknown error. Saved locally.",
      });
    }
  }

  return (
    <div className="flex flex-col h-screen">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <main className="flex-1 overflow-hidden">
        {activeTab === "chat" ? (
          <ChatInterface onDealCreated={handleDealCreated} />
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

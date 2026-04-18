"use client";

import { useState } from "react";
import Header from "@/components/Header";
import ChatInterface from "@/components/ChatInterface";
import DealDashboard from "@/components/DealDashboard";
import SettingsModal from "@/components/SettingsModal";
import NegotiationView from "@/components/NegotiationView";
import { useToast } from "@/components/Toast";
import { useDealsStore } from "@/lib/deals-store";
import { useBusinessMemory } from "@/memory/localstorage-store";
import {
  DealParams,
  DealStatus,
  MilestoneStatus,
  usdcToLamports,
} from "@/lib/types";
import type { Deal } from "@/lib/types";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { buildCreateDealIx, sendTx } from "@/lib/escrow-client";

const ON_CHAIN_ENABLED = true;

type View = "chat" | "deals" | "negotiation";

export default function Home() {
  const [view, setView] = useState<View>("chat");
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [negotiatingParams, setNegotiatingParams] = useState<DealParams | null>(
    null
  );

  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { deals, addDeal } = useDealsStore(publicKey ?? null);
  const { memory } = useBusinessMemory(publicKey ?? null);
  const toast = useToast();

  // Enters negotiation stage rather than going straight on-chain. The final
  // terms come back from NegotiationView after both agents reach agreement.
  function handleDealDrafted(params: DealParams) {
    if (!publicKey) {
      toast.show({
        variant: "info",
        title: "Connect wallet first",
        description: "The Negotiator agent needs your identity to bargain.",
      });
      return;
    }
    setNegotiatingParams(params);
    setView("negotiation");
  }

  async function handleNegotiationAccepted(finalTerms: DealParams) {
    setNegotiatingParams(null);
    await pushDealOnChain(finalTerms);
  }

  async function pushDealOnChain(params: DealParams) {
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
    setView("deals");

    if (!ON_CHAIN_ENABLED) {
      toast.show({
        variant: "info",
        title: "Deal drafted",
        description: `${params.dealId} saved locally.`,
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

  const onTabChange = (tab: "chat" | "deals") => {
    setView(tab);
    if (tab === "chat") setNegotiatingParams(null);
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
        {view === "negotiation" && negotiatingParams && publicKey && memory ? (
          <NegotiationView
            initialTerms={negotiatingParams}
            buyerWallet={publicKey.toBase58()}
            buyerBoundaries={memory.boundaries}
            onAccept={handleNegotiationAccepted}
            onCancel={() => {
              setNegotiatingParams(null);
              setView("chat");
            }}
          />
        ) : view === "chat" ? (
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

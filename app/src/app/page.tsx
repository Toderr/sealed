"use client";

import { useState } from "react";
import Header from "@/components/Header";
import ChatInterface from "@/components/ChatInterface";
import DealDashboard from "@/components/DealDashboard";
import {
  DealParams,
  DealStatus,
  MilestoneStatus,
  usdcToLamports,
} from "@/lib/types";
import type { Deal } from "@/lib/types";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { buildCreateDealIx, sendTx } from "@/lib/escrow-client";

// Set to true once the program is deployed to devnet
const ON_CHAIN_ENABLED = false;

export default function Home() {
  const [activeTab, setActiveTab] = useState<"chat" | "deals">("chat");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();

  async function handleDealCreated(params: DealParams) {
    // Try on-chain creation if enabled
    if (ON_CHAIN_ENABLED && publicKey && signTransaction) {
      try {
        const ix = await buildCreateDealIx(publicKey, params);
        await sendTx(connection, ix, signTransaction);
      } catch (err) {
        console.error("On-chain deal creation failed:", err);
      }
    }

    // Always add to local state for immediate UI feedback
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
    setDeals((prev) => [newDeal, ...prev]);
    setActiveTab("deals");
  }

  return (
    <div className="flex flex-col h-screen">
      <Header activeTab={activeTab} onTabChange={setActiveTab} />
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
    </div>
  );
}

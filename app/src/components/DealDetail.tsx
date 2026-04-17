"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  Deal,
  DealStatus,
  MilestoneStatus,
  lamportsToUsdc,
  formatUsdc,
  shortenAddress,
} from "@/lib/types";
import {
  buildFundEscrowIx,
  buildReleaseMilestoneIx,
  sendTx,
} from "@/lib/escrow-client";

const STATUS_STYLES: Record<DealStatus, { color: string; label: string }> = {
  [DealStatus.Created]: { color: "text-blue-400", label: "Awaiting Funding" },
  [DealStatus.Funded]: { color: "text-yellow-400", label: "Funded — Ready" },
  [DealStatus.InProgress]: { color: "text-accent", label: "In Progress" },
  [DealStatus.Completed]: { color: "text-success", label: "Completed" },
  [DealStatus.Refunded]: { color: "text-muted", label: "Refunded" },
  [DealStatus.Disputed]: { color: "text-danger", label: "Disputed" },
};

const MS_ICONS: Record<MilestoneStatus, string> = {
  [MilestoneStatus.Pending]: "○",
  [MilestoneStatus.Completed]: "◉",
  [MilestoneStatus.Released]: "●",
};

export default function DealDetail({
  deal,
  onBack,
}: {
  deal: Deal;
  onBack: () => void;
}) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const isBuyer = publicKey?.equals(deal.buyer);
  const statusInfo = STATUS_STYLES[deal.status];
  const fundingPercent =
    deal.totalAmount > 0 ? (deal.fundedAmount / deal.totalAmount) * 100 : 0;

  async function handleFundEscrow() {
    if (!publicKey || !signTransaction) return;

    setTxStatus("Preparing transaction...");
    try {
      const amount = lamportsToUsdc(deal.totalAmount - deal.fundedAmount);
      const ix = await buildFundEscrowIx(publicKey, deal.dealId, amount);
      setTxStatus("Awaiting wallet approval...");
      const sig = await sendTx(connection, ix, signTransaction);
      setTxStatus(`Funded! Tx: ${sig.slice(0, 8)}...`);
    } catch (err) {
      setTxStatus(
        `Error: ${err instanceof Error ? err.message : "Transaction failed"}`
      );
    }
  }

  async function handleReleaseMilestone(index: number) {
    if (!publicKey || !signTransaction) return;

    setTxStatus(`Releasing milestone ${index + 1}...`);
    try {
      const ix = await buildReleaseMilestoneIx(
        publicKey,
        deal.dealId,
        index,
        deal.seller
      );
      setTxStatus("Awaiting wallet approval...");
      const sig = await sendTx(connection, ix, signTransaction);
      setTxStatus(`Released! Tx: ${sig.slice(0, 8)}...`);
    } catch (err) {
      setTxStatus(
        `Error: ${err instanceof Error ? err.message : "Transaction failed"}`
      );
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Back + header */}
        <div>
          <button
            onClick={onBack}
            className="text-sm text-muted hover:text-foreground mb-4 flex items-center gap-1"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M10.78 3.22a.75.75 0 010 1.06L7.06 8l3.72 3.72a.75.75 0 11-1.06 1.06l-4.25-4.25a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0z" />
            </svg>
            Back to deals
          </button>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold font-mono">
                {deal.dealId}
              </h2>
              <p className={`text-sm mt-1 ${statusInfo.color}`}>
                {statusInfo.label}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">
                {formatUsdc(lamportsToUsdc(deal.totalAmount))}
              </p>
              <p className="text-xs text-muted">USDC</p>
            </div>
          </div>
        </div>

        {/* Transaction status toast */}
        {txStatus && (
          <div className="bg-card border border-accent/30 rounded-lg px-4 py-3 text-sm flex items-center justify-between">
            <span>{txStatus}</span>
            <button
              onClick={() => setTxStatus(null)}
              className="text-muted hover:text-foreground ml-3"
            >
              x
            </button>
          </div>
        )}

        {/* Parties */}
        <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold">Parties</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs text-muted">Buyer</span>
              <p className="font-mono text-xs mt-0.5">
                {shortenAddress(deal.buyer.toBase58(), 6)}
                {isBuyer && (
                  <span className="ml-1.5 text-accent text-[10px]">(you)</span>
                )}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted">Seller</span>
              <p className="font-mono text-xs mt-0.5">
                {shortenAddress(deal.seller.toBase58(), 6)}
                {publicKey?.equals(deal.seller) && (
                  <span className="ml-1.5 text-accent text-[10px]">(you)</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Funding */}
        <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Escrow Funding</h3>
            <span className="text-xs text-muted">
              {formatUsdc(lamportsToUsdc(deal.fundedAmount))} /{" "}
              {formatUsdc(lamportsToUsdc(deal.totalAmount))} USDC
            </span>
          </div>
          <div className="h-2 bg-background rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all"
              style={{ width: `${fundingPercent}%` }}
            />
          </div>
          {deal.status === DealStatus.Created && isBuyer && (
            <button
              className="w-full bg-accent hover:bg-accent-hover text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
              onClick={handleFundEscrow}
            >
              Fund Escrow ({formatUsdc(lamportsToUsdc(deal.totalAmount))} USDC)
            </button>
          )}
        </div>

        {/* Milestones */}
        <div className="bg-card border border-card-border rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-semibold">
            Milestones ({deal.milestones.length})
          </h3>
          <div className="space-y-3">
            {deal.milestones.map((milestone, index) => (
              <div key={index} className="flex items-start gap-3 text-sm">
                {/* Timeline indicator */}
                <div className="flex flex-col items-center pt-0.5">
                  <span
                    className={`text-lg leading-none ${
                      milestone.status === MilestoneStatus.Released
                        ? "text-success"
                        : milestone.status === MilestoneStatus.Completed
                          ? "text-accent"
                          : "text-muted"
                    }`}
                  >
                    {MS_ICONS[milestone.status]}
                  </span>
                  {index < deal.milestones.length - 1 && (
                    <div className="w-px h-8 bg-card-border mt-1" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-medium truncate">
                      {milestone.description}
                    </p>
                    <span className="shrink-0 font-mono text-xs ml-2">
                      {formatUsdc(lamportsToUsdc(milestone.amount))} USDC
                    </span>
                  </div>
                  <p className="text-xs text-muted mt-0.5">
                    {milestone.status === MilestoneStatus.Released
                      ? `Released${milestone.confirmedAt ? ` on ${new Date(milestone.confirmedAt * 1000).toLocaleDateString()}` : ""}`
                      : milestone.status}
                  </p>

                  {/* Release button for buyer */}
                  {milestone.status === MilestoneStatus.Pending &&
                    (deal.status === DealStatus.Funded ||
                      deal.status === DealStatus.InProgress) &&
                    isBuyer && (
                      <button
                        className="mt-2 bg-success/15 text-success hover:bg-success/25 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                        onClick={() => handleReleaseMilestone(index)}
                      >
                        Confirm & Release
                      </button>
                    )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Timestamps */}
        <div className="text-xs text-muted text-center space-x-4">
          <span>
            Created: {new Date(deal.createdAt * 1000).toLocaleString()}
          </span>
          <span>
            Updated: {new Date(deal.updatedAt * 1000).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

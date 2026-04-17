"use client";

import {
  Deal,
  DealStatus,
  MilestoneStatus,
  lamportsToUsdc,
  formatUsdc,
  shortenAddress,
} from "@/lib/types";
import DealDetail from "@/components/DealDetail";

const STATUS_COLORS: Record<DealStatus, string> = {
  [DealStatus.Created]: "bg-blue-500/15 text-blue-400",
  [DealStatus.Funded]: "bg-yellow-500/15 text-yellow-400",
  [DealStatus.InProgress]: "bg-accent/15 text-accent",
  [DealStatus.Completed]: "bg-success/15 text-success",
  [DealStatus.Refunded]: "bg-muted/15 text-muted",
  [DealStatus.Disputed]: "bg-danger/15 text-danger",
};

export default function DealDashboard({
  deals,
  selectedDeal,
  onSelectDeal,
}: {
  deals: Deal[];
  selectedDeal: Deal | null;
  onSelectDeal: (deal: Deal | null) => void;
}) {
  if (selectedDeal) {
    return (
      <DealDetail deal={selectedDeal} onBack={() => onSelectDeal(null)} />
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">My Deals</h2>
          <span className="text-sm text-muted">{deals.length} deals</span>
        </div>

        {deals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
            <div className="text-4xl">📋</div>
            <p className="text-muted">
              No deals yet. Use the New Deal tab to create your first escrow
              deal.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {deals.map((deal) => (
              <DealCard
                key={deal.dealId}
                deal={deal}
                onClick={() => onSelectDeal(deal)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DealCard({ deal, onClick }: { deal: Deal; onClick: () => void }) {
  const releasedCount = deal.milestones.filter(
    (m) => m.status === MilestoneStatus.Released
  ).length;
  const totalMilestones = deal.milestones.length;
  const progressPercent =
    totalMilestones > 0 ? (releasedCount / totalMilestones) * 100 : 0;

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-card border border-card-border rounded-xl p-4 hover:border-accent/50 transition-colors"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold font-mono">{deal.dealId}</h3>
          <p className="text-xs text-muted mt-0.5">
            Seller: {shortenAddress(deal.seller.toBase58())}
          </p>
        </div>
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[deal.status]}`}
        >
          {deal.status}
        </span>
      </div>

      <div className="flex items-center justify-between text-sm mb-3">
        <span className="text-muted">Total</span>
        <span className="font-semibold">
          {formatUsdc(lamportsToUsdc(deal.totalAmount))} USDC
        </span>
      </div>

      {/* Milestone progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">Milestones</span>
          <span className="text-muted">
            {releasedCount}/{totalMilestones}
          </span>
        </div>
        <div className="h-1.5 bg-background rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 text-xs text-muted">
        <span>
          Funded: {formatUsdc(lamportsToUsdc(deal.fundedAmount))} /{" "}
          {formatUsdc(lamportsToUsdc(deal.totalAmount))} USDC
        </span>
        <span>{new Date(deal.createdAt * 1000).toLocaleDateString()}</span>
      </div>
    </button>
  );
}

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

// Linear-style status pills: semi-transparent fill, matching semantic tokens.
const STATUS_STYLES: Record<DealStatus, string> = {
  [DealStatus.Created]:
    "bg-[rgba(113,112,255,0.10)] text-accent border border-[rgba(113,112,255,0.22)]",
  [DealStatus.Funded]:
    "bg-[rgba(251,191,36,0.10)] text-warning border border-[rgba(251,191,36,0.22)]",
  [DealStatus.InProgress]:
    "bg-[rgba(113,112,255,0.10)] text-accent border border-[rgba(113,112,255,0.22)]",
  [DealStatus.Completed]:
    "bg-[rgba(16,185,129,0.10)] text-success border border-[rgba(16,185,129,0.22)]",
  [DealStatus.Refunded]:
    "bg-[rgba(255,255,255,0.04)] text-muted border border-card-border",
  [DealStatus.Disputed]:
    "bg-[rgba(248,113,113,0.10)] text-danger border border-[rgba(248,113,113,0.22)]",
};

const labelStyle: React.CSSProperties = { fontWeight: 510, letterSpacing: "-0.006em" };
const headingStyle: React.CSSProperties = { fontWeight: 590, letterSpacing: "-0.014em" };

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
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2
              className="text-[22px] text-primary"
              style={{ ...headingStyle, letterSpacing: "-0.022em" }}
            >
              My Deals
            </h2>
            <p className="text-[13px] text-muted mt-1">
              Escrow deals you created or are involved in
            </p>
          </div>
          <span className="pill-neutral">{deals.length} total</span>
        </div>

        {deals.length === 0 ? (
          <div className="surface-card-subtle rounded-xl flex flex-col items-center justify-center py-20 text-center gap-4">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-[rgba(255,255,255,0.04)] text-muted">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="9" y1="13" x2="15" y2="13" />
                <line x1="9" y1="17" x2="13" y2="17" />
              </svg>
            </div>
            <div className="space-y-1">
              <p className="text-primary text-[14px]" style={labelStyle}>
                No deals yet
              </p>
              <p className="text-muted text-[13px] max-w-xs">
                Use the New Deal tab to create your first escrow-protected
                agreement.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
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
      className="w-full text-left surface-card-subtle rounded-xl p-4 hover:bg-[rgba(255,255,255,0.035)] hover:border-[rgba(255,255,255,0.10)] transition-colors group"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0 flex-1">
          <h3
            className="text-[13px] font-mono text-primary truncate"
            style={labelStyle}
          >
            {deal.dealId}
          </h3>
          <p className="text-[12px] text-muted mt-1 font-mono">
            Seller {shortenAddress(deal.seller.toBase58())}
          </p>
        </div>
        <span
          className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLES[deal.status]}`}
          style={labelStyle}
        >
          {deal.status}
        </span>
      </div>

      <div className="flex items-baseline justify-between mb-4">
        <span
          className="text-subtle text-[11px] uppercase tracking-[0.08em]"
          style={labelStyle}
        >
          Total
        </span>
        <span
          className="text-primary text-[16px] font-mono"
          style={{ fontWeight: 590, letterSpacing: "-0.012em" }}
        >
          {formatUsdc(lamportsToUsdc(deal.totalAmount))}
          <span className="text-muted text-[12px] ml-1.5">USDC</span>
        </span>
      </div>

      {/* Milestone progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span
            className="text-subtle uppercase tracking-[0.08em]"
            style={labelStyle}
          >
            Milestones
          </span>
          <span className="text-muted font-mono">
            {releasedCount}/{totalMilestones}
          </span>
        </div>
        <div className="h-1 bg-[rgba(255,255,255,0.04)] rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-card-border-subtle text-[11px] text-subtle">
        <span className="font-mono">
          {formatUsdc(lamportsToUsdc(deal.fundedAmount))} /{" "}
          {formatUsdc(lamportsToUsdc(deal.totalAmount))} funded
        </span>
        <span>{new Date(deal.createdAt * 1000).toLocaleDateString()}</span>
      </div>
    </button>
  );
}

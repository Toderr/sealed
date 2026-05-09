"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";

interface SupabaseDeal {
  deal_id: string;
  buyer_wallet: string;
  seller_wallet: string | null;
  title: string;
  total_amount_usdc: number;
  milestones: Array<{ description: string; amount: number; status?: string }>;
  status: string;
  created_at?: string;
}

const labelStyle: React.CSSProperties = { fontWeight: 510, letterSpacing: "-0.006em" };
const headingStyle: React.CSSProperties = { fontWeight: 590, letterSpacing: "-0.014em" };

function statusStyle(status: string): string {
  switch (status) {
    case "draft":     return "bg-warning/10 text-warning border border-warning/25";
    case "funded":    return "bg-accent/10 text-accent border border-accent/25";
    case "completed": return "bg-success/10 text-success border border-success/25";
    case "disputed":  return "bg-danger/10 text-danger border border-danger/25";
    default:          return "bg-[rgba(255,255,255,0.04)] text-muted border border-card-border";
  }
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function DealDashboard() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const router = useRouter();

  const [deals, setDeals] = useState<SupabaseDeal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!wallet) {
      setLoading(false);
      return;
    }

    // Try Supabase first
    fetch("/api/deals/mirror", { headers: { "x-wallet": wallet } })
      .then((r) => r.json())
      .then((data) => {
        const supabaseDeals: SupabaseDeal[] = data.deals ?? [];

        // Merge with any sessionStorage drafts not yet synced
        const sessionDeals = readSessionDeals(wallet);
        const merged = mergeDedupe(supabaseDeals, sessionDeals);
        setDeals(merged);
      })
      .catch(() => {
        // Supabase unavailable — use sessionStorage only
        setDeals(readSessionDeals(wallet));
      })
      .finally(() => setLoading(false));
  }, [wallet]);

  if (!wallet) {
    return (
      <EmptyShell>
        <p className="text-[14px] text-muted">Connect your wallet to see your deals.</p>
      </EmptyShell>
    );
  }

  if (loading) {
    return (
      <EmptyShell>
        <div className="flex gap-1 items-center">
          {[0, 150, 300].map((d) => (
            <span
              key={d}
              className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce"
              style={{ animationDelay: `${d}ms` }}
            />
          ))}
        </div>
      </EmptyShell>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-[22px] text-primary" style={{ ...headingStyle, letterSpacing: "-0.022em" }}>
              My Deals
            </h2>
            <p className="text-[13px] text-muted mt-1">
              Deals you created or are involved in
            </p>
          </div>
          <span className="pill-neutral">{deals.length} total</span>
        </div>

        {deals.length === 0 ? (
          <div className="surface-card-subtle rounded-xl flex flex-col items-center justify-center py-20 text-center gap-4">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-[rgba(255,255,255,0.04)] text-muted">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="9" y1="13" x2="15" y2="13" />
                <line x1="9" y1="17" x2="13" y2="17" />
              </svg>
            </div>
            <div className="space-y-1">
              <p className="text-primary text-[14px]" style={labelStyle}>No deals yet</p>
              <p className="text-muted text-[13px] max-w-xs">
                Use the Chat tab to describe your deal and create your first negotiation room.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {deals.map((deal) => (
              <DealRow
                key={deal.deal_id}
                deal={deal}
                myWallet={wallet}
                onClick={() => router.push(`/negotiate/${deal.deal_id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DealRow({
  deal,
  myWallet,
  onClick,
}: {
  deal: SupabaseDeal;
  myWallet: string;
  onClick: () => void;
}) {
  const isBuyer = deal.buyer_wallet === myWallet;
  const counterparty = isBuyer ? deal.seller_wallet : deal.buyer_wallet;
  const shortCp = counterparty
    ? `${counterparty.slice(0, 4)}…${counterparty.slice(-4)}`
    : "Awaiting counterparty";

  const completedMilestones = (deal.milestones ?? []).filter(
    (m) => m.status === "Released" || m.status === "Completed"
  ).length;
  const totalMilestones = (deal.milestones ?? []).length;
  const progressPct = totalMilestones > 0 ? (completedMilestones / totalMilestones) * 100 : 0;

  const dateStr = deal.created_at
    ? new Date(deal.created_at).toLocaleDateString()
    : "";

  return (
    <button
      onClick={onClick}
      className="w-full text-left surface-card-subtle rounded-xl p-4 hover:bg-[rgba(255,255,255,0.035)] hover:border-[rgba(255,255,255,0.10)] transition-colors"
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] text-primary truncate" style={labelStyle}>
            {deal.title || deal.deal_id}
          </h3>
          <p className="text-[11px] text-subtle font-mono mt-0.5">
            {isBuyer ? "Buyer" : "Seller"} · {shortCp}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${statusStyle(deal.status)}`} style={labelStyle}>
            {statusLabel(deal.status)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="text-subtle text-[11px] uppercase tracking-[0.08em]" style={labelStyle}>Total</span>
        <span className="text-primary text-[15px] font-mono" style={{ fontWeight: 590 }}>
          ${deal.total_amount_usdc.toLocaleString()}
          <span className="text-muted text-[11px] ml-1">USDC</span>
        </span>
      </div>

      {totalMilestones > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-subtle uppercase tracking-[0.08em]" style={labelStyle}>Milestones</span>
            <span className="text-muted font-mono">{completedMilestones}/{totalMilestones}</span>
          </div>
          <div className="h-1 bg-[rgba(255,255,255,0.04)] rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-card-border-subtle text-[11px] text-subtle">
        <span className="font-mono text-subtle/60">{deal.deal_id}</span>
        {dateStr && <span>{dateStr}</span>}
      </div>
    </button>
  );
}

function EmptyShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex items-center justify-center">
      {children}
    </div>
  );
}

// Read all deal:* entries from sessionStorage that belong to this wallet
function readSessionDeals(wallet: string): SupabaseDeal[] {
  const deals: SupabaseDeal[] = [];
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key?.startsWith("deal:")) continue;
      const raw = sessionStorage.getItem(key);
      if (!raw) continue;
      const deal = JSON.parse(raw) as SupabaseDeal;
      if (deal.buyer_wallet === wallet || deal.seller_wallet === wallet) {
        deals.push(deal);
      }
    }
  } catch {}
  return deals;
}

// Merge Supabase list with sessionStorage list, deduplicating by deal_id
// Supabase wins on conflict (it's more up-to-date)
function mergeDedupe(supabase: SupabaseDeal[], session: SupabaseDeal[]): SupabaseDeal[] {
  const map = new Map<string, SupabaseDeal>();
  // Session first (lower priority)
  for (const d of session) map.set(d.deal_id, d);
  // Supabase overwrites
  for (const d of supabase) map.set(d.deal_id, d);
  return Array.from(map.values()).sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta; // newest first
  });
}

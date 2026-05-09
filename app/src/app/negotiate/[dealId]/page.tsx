"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { SealedMark } from "@/components/SealedLogo";
import { useBusinessMemory } from "@/memory/localstorage-store";
import { getLlmHeaders } from "@/lib/llm-headers";
import { useProfileStore, encodeInvite } from "@/lib/profile-store";
import { useDealsStore } from "@/lib/deals-store";
import {
  DealParams,
  DealStatus,
  MilestoneStatus,
  PublicProfile,
  formatUsdc,
  usdcToLamports,
} from "@/lib/types";
import type { Deal } from "@/lib/types";
import type { Proposal } from "@/negotiation/types";
import { defaultSellerBoundaries } from "@/negotiation/types";
import { buildCreateDealIx, sendTx } from "@/lib/escrow-client";
import { PublicKey } from "@solana/web3.js";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

const labelStyle: React.CSSProperties = { fontWeight: 510, letterSpacing: "-0.006em" };
const headingStyle: React.CSSProperties = { fontWeight: 590, letterSpacing: "-0.014em" };

type SupabaseDeal = {
  deal_id: string;
  buyer_wallet: string;
  seller_wallet: string;
  title: string;
  description: string | null;
  total_amount_usdc: number;
  milestones: Array<{ description: string; amount: number; status?: string }>;
  status: string;
};

type NegState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; proposal: Proposal }
  | { kind: "error"; message: string };

export default function NegotiateRoom() {
  const params = useParams();
  const dealId = Array.isArray(params.dealId) ? params.dealId[0] : params.dealId;
  const router = useRouter();

  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const wallet = publicKey?.toBase58() ?? null;

  const { memory } = useBusinessMemory(publicKey ?? null);
  const { profile } = useProfileStore(wallet);
  const { addDeal } = useDealsStore(publicKey ?? null);

  const [deal, setDeal] = useState<SupabaseDeal | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cpProfile, setCpProfile] = useState<PublicProfile | null>(null);
  const [cpHandle, setCpHandle] = useState<string | null>(null);
  const [negState, setNegState] = useState<NegState>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const [deploying, setDeploying] = useState(false);

  // Fetch deal
  useEffect(() => {
    if (!dealId) return;
    fetch(`/api/deals/${dealId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setLoadError(data.error);
        else setDeal(data.deal as SupabaseDeal);
      })
      .catch(() => setLoadError("Failed to load deal"));
  }, [dealId]);

  // Fetch counterparty public profile
  useEffect(() => {
    if (!deal || !wallet) return;
    const cpWallet = deal.buyer_wallet === wallet ? deal.seller_wallet : deal.buyer_wallet;
    if (!cpWallet) return;
    fetch(`/api/users/${cpWallet}/public`)
      .then((r) => r.json())
      .then((data: PublicProfile) => {
        setCpProfile(data);
        setCpHandle(data.handle ?? null);
      })
      .catch(() => {});
  }, [deal, wallet]);

  const role: "buyer" | "seller" | "observer" = !wallet
    ? "observer"
    : deal?.buyer_wallet === wallet
    ? "buyer"
    : deal?.seller_wallet === wallet
    ? "seller"
    : "observer";

  const counterpartyWallet =
    role === "buyer" ? deal?.seller_wallet : deal?.buyer_wallet;

  // Generate invite link
  const inviteLink = (() => {
    if (!deal || !profile || typeof window === "undefined") return "";
    const payload = {
      dealId: deal.deal_id,
      dealTitle: deal.title,
      inviterName: profile.name,
      inviterWallet: wallet ?? "",
      amount: deal.total_amount_usdc,
      currency: "USDC",
      milestoneCount: deal.milestones.length,
      description: profile.bio ?? "",
    };
    return `${window.location.origin}/invite/${encodeURIComponent(encodeInvite(payload))}`;
  })();

  const dealParams: DealParams = deal
    ? {
        dealId: deal.deal_id,
        sellerWallet: deal.seller_wallet,
        totalAmount: deal.total_amount_usdc,
        milestones: deal.milestones.map((m) => ({
          description: m.description,
          amount: m.amount,
        })),
      }
    : { dealId: "", sellerWallet: "", totalAmount: 0, milestones: [] };

  const startNegotiation = useCallback(async () => {
    if (!deal || !wallet || !memory) return;
    setNegState({ kind: "running" });

    const buyerBoundaries = role === "buyer" ? memory.boundaries : defaultSellerBoundaries();
    const sellerBoundaries = role === "seller" ? memory.boundaries : defaultSellerBoundaries();

    try {
      const res = await fetch("/api/negotiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getLlmHeaders(wallet),
        },
        body: JSON.stringify({
          proposalId: `${deal.deal_id}-${Date.now()}`,
          buyerWallet: deal.buyer_wallet,
          initialTerms: dealParams,
          buyerBoundaries,
          sellerBoundaries,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `API error ${res.status}`);
      }

      const data = (await res.json()) as { proposal: Proposal };
      setNegState({ kind: "done", proposal: data.proposal });
    } catch (err) {
      setNegState({
        kind: "error",
        message: err instanceof Error ? err.message : "Negotiation failed",
      });
    }
  }, [deal, wallet, memory, role, dealParams]);

  async function handleAcceptAndDeploy(finalTerms: DealParams) {
    if (!publicKey || !signTransaction) return;
    setDeploying(true);

    const now = Math.floor(Date.now() / 1000);
    const newDeal: Deal = {
      dealId: finalTerms.dealId,
      buyer: publicKey,
      seller: new PublicKey(finalTerms.sellerWallet),
      mint: PublicKey.default,
      escrowTokenAccount: PublicKey.default,
      totalAmount: usdcToLamports(finalTerms.totalAmount),
      fundedAmount: 0,
      releasedAmount: 0,
      status: DealStatus.Created,
      milestones: finalTerms.milestones.map((m) => ({
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

    try {
      const ix = await buildCreateDealIx(publicKey, finalTerms);
      const sig = await sendTx(connection, ix, signTransaction);

      try {
        await fetch("/api/deals/mirror", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-wallet": publicKey.toBase58(),
          },
          body: JSON.stringify({
            deal_id: finalTerms.dealId,
            seller_wallet: finalTerms.sellerWallet,
            title: finalTerms.dealId,
            description: finalTerms.milestones.map((m) => m.description).join(" | "),
            total_amount_usdc: finalTerms.totalAmount,
            milestones: finalTerms.milestones.map((m) => ({
              description: m.description,
              amount: m.amount,
              status: "Pending",
            })),
            tx_signature: sig,
            status: "funded",
          }),
        });
      } catch {
        // non-fatal
      }

      router.push(`/deals/${finalTerms.dealId}`);
    } catch (err) {
      console.error("On-chain deploy failed:", err);
      setDeploying(false);
    }
  }

  if (!wallet) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
          <SealedMark size={48} />
          <div className="space-y-1">
            <p className="text-[18px] text-primary" style={headingStyle}>You&apos;ve been invited to a deal</p>
            <p className="text-[13px] text-muted">Connect your wallet to join the negotiation room.</p>
          </div>
          <WalletMultiButton />
        </div>
      </Shell>
    );
  }

  if (loadError) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
          <p className="text-[16px] text-primary" style={headingStyle}>Deal not found</p>
          <p className="text-[13px] text-muted">{loadError}</p>
          <Link href="/app" className="btn-ghost h-9 px-5 rounded-md text-[13px]">Go home</Link>
        </div>
      </Shell>
    );
  }

  if (!deal) {
    return (
      <Shell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex gap-1 items-center">
            {[0, 150, 300].map((d) => (
              <span key={d} className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: `${d}ms` }} />
            ))}
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[12px] text-muted uppercase tracking-[0.06em]" style={{ fontWeight: 510 }}>
              Negotiation Room
            </p>
            <h1 className="text-[22px] text-primary mt-0.5" style={{ ...headingStyle, letterSpacing: "-0.022em" }}>
              {deal.title}
            </h1>
            <p className="text-[12px] text-subtle font-mono mt-1">{deal.deal_id}</p>
          </div>
          <span className={`pill-neutral mt-1 flex-shrink-0 ${
            deal.status === "draft" ? "text-warning" : "text-accent"
          }`}>
            {deal.status === "draft" ? "Draft" : deal.status}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: deal terms + invite */}
          <div className="lg:col-span-2 space-y-4">
            {/* Deal terms */}
            <div className="surface-card rounded-xl p-5 space-y-4">
              <p className="text-[13px] text-primary" style={labelStyle}>Deal terms</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] text-muted uppercase tracking-[0.06em]" style={labelStyle}>Total value</p>
                  <p className="text-[20px] text-primary tabular-nums mt-0.5" style={headingStyle}>
                    ${formatUsdc(deal.total_amount_usdc)}
                  </p>
                  <p className="text-[11px] text-subtle">USDC</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted uppercase tracking-[0.06em]" style={labelStyle}>Milestones</p>
                  <p className="text-[20px] text-primary tabular-nums mt-0.5" style={headingStyle}>
                    {deal.milestones.length}
                  </p>
                  <p className="text-[11px] text-subtle">payment stages</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted uppercase tracking-[0.06em]" style={labelStyle}>
                  Milestones
                </p>
                <div className="space-y-1">
                  {deal.milestones.map((m, i) => (
                    <div key={i} className="flex items-center justify-between text-[12px] bg-[rgba(255,255,255,0.02)] border border-card-border-subtle rounded-md px-3 py-2">
                      <span className="truncate mr-2 text-foreground">
                        <span className="text-subtle mr-1.5">{i + 1}.</span>
                        {m.description}
                      </span>
                      <span className="shrink-0 font-mono text-muted">${formatUsdc(m.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Invite counterparty (buyer only, draft status) */}
            {role === "buyer" && deal.status === "draft" && inviteLink && (
              <div className="surface-card rounded-xl p-5 space-y-4">
                <div>
                  <p className="text-[13px] text-primary" style={labelStyle}>Invite counterparty</p>
                  <p className="text-[12px] text-muted mt-0.5">
                    Only you and the counterparty can participate in this negotiation room.
                  </p>
                </div>

                {/* Friend list invite */}
                <FriendInviteSection wallet={wallet} inviteLink={inviteLink} />

                {/* Direct link fallback */}
                <div className="space-y-1.5">
                  <p className="text-[11px] text-muted uppercase tracking-[0.06em]" style={{ fontWeight: 510 }}>
                    Or share direct link
                  </p>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={inviteLink}
                      className="flex-1 h-9 rounded-md bg-surface border border-card-border px-3 text-[12px] text-muted font-mono outline-none truncate"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(inviteLink);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="btn-ghost h-9 px-4 rounded-md text-[12px] shrink-0"
                    >
                      {copied ? "Copied ✓" : "Copy"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Negotiation panel */}
            <div className="surface-card rounded-xl overflow-hidden">
              {negState.kind === "idle" && (
                <div className="p-5 space-y-4">
                  <div>
                    <p className="text-[13px] text-primary" style={labelStyle}>Start negotiation</p>
                    <p className="text-[12px] text-muted mt-0.5">
                      Your agent and the counterparty&apos;s agent will negotiate terms on your behalf. Review the result before anything goes on-chain.
                    </p>
                  </div>
                  {role === "observer" ? (
                    <p className="text-[13px] text-muted">You are observing this deal.</p>
                  ) : !memory ? (
                    <p className="text-[12px] text-warning">Configure your agent settings before negotiating.</p>
                  ) : (
                    <button
                      onClick={startNegotiation}
                      className="btn-primary h-10 px-6 rounded-md text-[13px]"
                    >
                      Start negotiation
                    </button>
                  )}
                </div>
              )}

              {negState.kind === "running" && (
                <div className="flex flex-col items-center justify-center py-16 gap-5 text-center px-6">
                  <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-accent/10 text-accent">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse" aria-hidden="true">
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                    </svg>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[18px] text-primary" style={headingStyle}>Agents negotiating</p>
                    <p className="text-[13px] text-muted">Exchanging proposals — usually 15–30 seconds.</p>
                  </div>
                  <div className="flex items-center gap-2 text-[12px] text-subtle">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                    <span>Running up to 5 rounds</span>
                  </div>
                </div>
              )}

              {negState.kind === "error" && (
                <div className="flex flex-col items-center justify-center py-12 gap-4 text-center px-6">
                  <div className="text-danger">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <p className="text-[14px] text-primary" style={headingStyle}>Negotiation failed</p>
                  <p className="text-[13px] text-muted">{negState.message}</p>
                  <button onClick={() => setNegState({ kind: "idle" })} className="btn-ghost h-9 px-4 rounded-md text-[13px]">
                    Try again
                  </button>
                </div>
              )}

              {negState.kind === "done" && (
                <NegotiationResult
                  proposal={negState.proposal}
                  role={role}
                  deploying={deploying}
                  onAccept={handleAcceptAndDeploy}
                  onRenegotiate={() => setNegState({ kind: "idle" })}
                />
              )}
            </div>
          </div>

          {/* Right: parties */}
          <div className="space-y-4">
            <PartyCard
              label="Buyer"
              wallet={deal.buyer_wallet}
              isYou={wallet === deal.buyer_wallet}
              profile={wallet === deal.buyer_wallet ? null : (role === "seller" ? cpProfile : null)}
              handle={wallet === deal.buyer_wallet ? (profile?.name ?? null) : cpHandle}
            />
            <PartyCard
              label="Seller"
              wallet={deal.seller_wallet}
              isYou={wallet === deal.seller_wallet}
              profile={wallet === deal.seller_wallet ? null : (role === "buyer" ? cpProfile : null)}
              handle={wallet === deal.seller_wallet ? (profile?.name ?? null) : cpHandle}
            />
          </div>
        </div>
      </div>
    </Shell>
  );
}

/* ── Party card with credibility ────────────────────────────────────────── */

function PartyCard({
  label,
  wallet,
  isYou,
  profile,
  handle,
}: {
  label: string;
  wallet: string;
  isYou: boolean;
  profile: PublicProfile | null;
  handle: string | null;
}) {
  const shortWallet = wallet ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : "—";
  const displayName = handle ?? shortWallet;

  return (
    <Link
      href={`/profile/${wallet}`}
      className="surface-card rounded-xl p-4 space-y-3 block hover:border-accent/30 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] text-muted uppercase tracking-[0.06em]" style={{ fontWeight: 510 }}>{label}</p>
          <p className="text-[14px] text-primary mt-0.5 truncate" style={labelStyle}>{displayName}</p>
          <p className="text-[11px] text-subtle font-mono">{shortWallet}</p>
        </div>
        {isYou && (
          <span className="pill-neutral text-accent text-[11px] flex-shrink-0">You</span>
        )}
        {profile?.is_verified && (
          <span className="flex items-center gap-1 text-[11px] text-success flex-shrink-0">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" />
            </svg>
            Verified
          </span>
        )}
      </div>

      {profile && (
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-card-border-subtle">
          <Stat label="Deals done" value={profile.deals_successful} />
          <Stat label="Success rate" value={
            profile.deals_total > 0
              ? `${Math.round((profile.deals_successful / profile.deals_total) * 100)}%`
              : "—"
          } />
          <Stat label="Rating" value={profile.avg_rating > 0 ? `${profile.avg_rating.toFixed(1)} ★` : "—"} />
          <Stat label="Total deals" value={profile.deals_total} />
        </div>
      )}

      {!profile && !isYou && (
        <p className="text-[12px] text-subtle pt-1 border-t border-card-border-subtle">
          Not yet on Sealed
        </p>
      )}

      {!isYou && (
        <p className="text-[11px] text-muted hover:text-accent transition-colors">View full profile →</p>
      )}
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[10px] text-subtle uppercase tracking-[0.06em]">{label}</p>
      <p className="text-[13px] text-primary tabular-nums" style={{ fontWeight: 510 }}>{value}</p>
    </div>
  );
}

/* ── Negotiation result ─────────────────────────────────────────────────── */

function NegotiationResult({
  proposal,
  role,
  deploying,
  onAccept,
  onRenegotiate,
}: {
  proposal: Proposal;
  role: "buyer" | "seller" | "observer";
  deploying: boolean;
  onAccept: (terms: DealParams) => void;
  onRenegotiate: () => void;
}) {
  const summary = proposal.summary;
  const finalTerms = proposal.finalTerms;
  const agreed = proposal.status === "agreed" && finalTerms;
  const isBuyer = role === "buyer";

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-primary" style={labelStyle}>Negotiation result</p>
        <span className={`pill-neutral text-[11px] ${agreed ? "text-success" : "text-warning"}`}>
          {agreed ? "Agreed" : proposal.status}
        </span>
      </div>

      {summary && (
        <>
          {/* Recommendation */}
          <div className={`rounded-lg p-3 border text-[13px] ${
            summary.recommendation === "accept"
              ? "bg-success/5 border-success/20 text-success"
              : summary.recommendation === "reject"
              ? "bg-danger/5 border-danger/20 text-danger"
              : "bg-warning/5 border-warning/20 text-warning"
          }`}>
            <span style={labelStyle}>
              Recommendation: {summary.recommendation.toUpperCase()}
            </span>
            <p className="text-[12px] mt-0.5 opacity-80">{summary.recommendationReasoning}</p>
          </div>

          {/* Pros / Cons */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <p className="text-[11px] text-success uppercase tracking-[0.06em]" style={{ fontWeight: 510 }}>Pros</p>
              {summary.pros.map((p, i) => (
                <p key={i} className="text-[12px] text-foreground flex gap-1.5">
                  <span className="text-success mt-0.5">+</span>{p}
                </p>
              ))}
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] text-danger uppercase tracking-[0.06em]" style={{ fontWeight: 510 }}>Cons</p>
              {summary.cons.map((c, i) => (
                <p key={i} className="text-[12px] text-foreground flex gap-1.5">
                  <span className="text-danger mt-0.5">−</span>{c}
                </p>
              ))}
            </div>
          </div>

          {/* Risk flags */}
          {summary.riskFlags.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] text-warning uppercase tracking-[0.06em]" style={{ fontWeight: 510 }}>Risk flags</p>
              {summary.riskFlags.map((r, i) => (
                <p key={i} className="text-[12px] text-warning">⚠ {r}</p>
              ))}
            </div>
          )}
        </>
      )}

      {/* Final terms */}
      {finalTerms && (
        <div className="space-y-1.5 pt-1 border-t border-card-border-subtle">
          <p className="text-[11px] text-muted uppercase tracking-[0.06em]" style={{ fontWeight: 510 }}>Agreed terms</p>
          <div className="flex items-center gap-3">
            <p className="text-[20px] text-primary tabular-nums" style={headingStyle}>${formatUsdc(finalTerms.totalAmount)}</p>
            <p className="text-[12px] text-muted">USDC · {finalTerms.milestones.length} milestones</p>
          </div>
        </div>
      )}

      {/* Actions */}
      {isBuyer && agreed && finalTerms && (
        <div className="flex gap-3 pt-1">
          <button
            onClick={() => onAccept(finalTerms)}
            disabled={deploying}
            className="btn-primary flex-1 h-10 rounded-md text-[13px] flex items-center justify-center gap-2"
          >
            {deploying ? (
              <>
                <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.22-8.56" strokeLinecap="round" />
                </svg>
                Deploying…
              </>
            ) : (
              "Accept & deploy escrow"
            )}
          </button>
          <button
            onClick={onRenegotiate}
            disabled={deploying}
            className="btn-ghost h-10 px-4 rounded-md text-[13px]"
          >
            Renegotiate
          </button>
        </div>
      )}

      {!isBuyer && agreed && (
        <p className="text-[12px] text-muted pt-1 border-t border-card-border-subtle">
          Waiting for the buyer to accept and deploy the escrow.
        </p>
      )}

      {!agreed && (
        <button onClick={onRenegotiate} className="btn-ghost h-9 px-4 rounded-md text-[13px]">
          Renegotiate
        </button>
      )}
    </div>
  );
}

/* ── Friend invite section ──────────────────────────────────────────────── */

interface FriendInviteProfile {
  name?: string;
  handle?: string;
}

interface FriendInviteEntry {
  id: string;
  counterpartyWallet: string;
  profile: FriendInviteProfile | null;
}

function FriendInviteSection({ wallet, inviteLink }: { wallet: string | null; inviteLink: string }) {
  const [friends, setFriends] = useState<FriendInviteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedWallet, setCopiedWallet] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet) { setLoading(false); return; }
    fetch("/api/friends", { headers: { "x-wallet": wallet } })
      .then((r) => r.json())
      .then((data) => setFriends(data.friends ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [wallet]);

  if (loading) return null;
  if (friends.length === 0) return null;

  function handleCopy(friendWallet: string) {
    navigator.clipboard.writeText(inviteLink);
    setCopiedWallet(friendWallet);
    setTimeout(() => setCopiedWallet(null), 2000);
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted uppercase tracking-[0.06em]" style={{ fontWeight: 510 }}>
        Send to a friend
      </p>
      <div className="space-y-1">
        {friends.map((f) => {
          const displayName =
            f.profile?.name ??
            f.profile?.handle ??
            `${f.counterpartyWallet.slice(0, 4)}…${f.counterpartyWallet.slice(-4)}`;
          const isCopied = copiedWallet === f.counterpartyWallet;
          return (
            <div
              key={f.id}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-card-border"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="h-7 w-7 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-[11px] text-accent shrink-0"
                  style={{ fontWeight: 590 }}
                >
                  {displayName[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] text-foreground truncate" style={{ fontWeight: 510 }}>
                    {displayName}
                  </p>
                  <p className="text-[11px] text-subtle font-mono">
                    {f.counterpartyWallet.slice(0, 6)}…{f.counterpartyWallet.slice(-4)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleCopy(f.counterpartyWallet)}
                className="btn-ghost h-8 px-3 rounded-md text-[12px] shrink-0"
              >
                {isCopied ? "Copied ✓" : "Copy invite"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Shell ──────────────────────────────────────────────────────────────── */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between px-6 h-14 border-b border-card-border-subtle bg-panel">
        <Link href="/app" className="flex items-center gap-2 text-primary">
          <SealedMark size={24} title="Sealed" />
          <span className="text-[14px] tracking-tight" style={{ fontWeight: 510 }}>Sealed</span>
        </Link>
        <WalletMultiButton />
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

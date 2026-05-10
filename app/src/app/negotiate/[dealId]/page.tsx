"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
import { renderMarkdown } from "@/lib/render-markdown";

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
  // Seller's chosen negotiation mode ("choice" = not decided yet)
  const [sellerView, setSellerView] = useState<"choice" | "manual" | "agent-waiting">("choice");

  // Re-push a sessionStorage deal to Supabase so counterparties on other devices can load it
  function retryMirrorSync(local: SupabaseDeal) {
    if (!local.buyer_wallet) return;
    fetch("/api/deals/mirror", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wallet": local.buyer_wallet,
      },
      body: JSON.stringify({
        deal_id: local.deal_id,
        seller_wallet: local.seller_wallet ?? null,
        title: local.title,
        description: local.description ?? null,
        total_amount_usdc: local.total_amount_usdc,
        milestones: local.milestones ?? [],
        status: local.status ?? "draft",
      }),
    }).catch(() => {}); // best-effort
  }

  // Fetch deal — tries Supabase first, falls back to sessionStorage
  useEffect(() => {
    if (!dealId) return;
    let cancelled = false;

    function trySessionStorage() {
      try {
        const raw = sessionStorage.getItem(`deal:${dealId}`);
        if (raw) return JSON.parse(raw) as SupabaseDeal;
      } catch {}
      return null;
    }

    const timer = setTimeout(() => {
      if (cancelled) return;
      const local = trySessionStorage();
      if (local) setDeal(local);
      else setLoadError("Loading timed out — please refresh the page.");
    }, 10000);

    fetch(`/api/deals/${dealId}`)
      .then((r) => r.json())
      .then((data) => {
        clearTimeout(timer);
        if (cancelled) return;
        if (data.error) {
          const local = trySessionStorage();
          if (local) {
            setDeal(local);
            // Retry mirror sync so counterparties on other devices can find this deal
            retryMirrorSync(local);
          } else {
            setLoadError(data.error);
          }
        } else {
          setDeal(data.deal as SupabaseDeal);
        }
      })
      .catch(() => {
        clearTimeout(timer);
        if (cancelled) return;
        const local = trySessionStorage();
        if (local) {
          setDeal(local);
          retryMirrorSync(local);
        } else {
          setLoadError("Failed to load deal. Please check your connection.");
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dealId]);

  // If Supabase returned the deal before the seller PATCH propagated, seller_wallet
  // may still be empty. Check sessionStorage and patch local state so the seller
  // gets the correct role (not "observer").
  useEffect(() => {
    if (!wallet || !deal || deal.seller_wallet) return;
    try {
      const raw = sessionStorage.getItem(`deal:${deal.deal_id}`);
      if (!raw) return;
      const local = JSON.parse(raw) as { seller_wallet?: string };
      if (local.seller_wallet === wallet) {
        setDeal((prev) => (prev ? { ...prev, seller_wallet: wallet } : prev));
      }
    } catch {}
  }, [wallet, deal]);

  // Poll deal every 4 s — keeps both parties in sync.
  // Uses setDeal(prev => ...) to avoid stale-closure comparison bugs.
  // Depends only on dealId so the interval never restarts mid-poll.
  useEffect(() => {
    if (!dealId) return;

    const interval = setInterval(() => {
      // Check localStorage signals first (same-device, instant)
      try {
        const joined = localStorage.getItem(`sealed:seller-joined:${dealId}`);
        if (joined) {
          setDeal((prev) => {
            if (!prev || (prev.seller_wallet ?? "") === joined) return prev;
            return { ...prev, seller_wallet: joined };
          });
        }
        const agreed = localStorage.getItem(`sealed:seller-agreed:${dealId}`);
        if (agreed) {
          setDeal((prev) => {
            if (!prev || prev.status === "seller-agreed") return prev;
            return { ...prev, status: "seller-agreed" };
          });
        }
      } catch {}

      // Also poll Supabase for cross-device sync
      fetch(`/api/deals/${dealId}`)
        .then((r) => r.json())
        .then((data) => {
          if (!data.deal) return; // Don't retryMirrorSync here — it would overwrite seller_wallet
          const updated = data.deal as SupabaseDeal;
          setDeal((prev) => {
            if (!prev) return updated;
            const sellerChanged = (updated.seller_wallet ?? "") !== (prev.seller_wallet ?? "");
            const statusChanged = updated.status !== prev.status;
            return sellerChanged || statusChanged ? updated : prev;
          });
        })
        .catch(() => {});
    }, 4000);

    return () => clearInterval(interval);
  }, [dealId]); // stable — never restarts

  // Instant cross-tab detection via localStorage storage event
  useEffect(() => {
    if (!dealId) return;
    function handleStorage(e: StorageEvent) {
      if (e.key === `sealed:seller-joined:${dealId}` && e.newValue) {
        setDeal((prev) => {
          if (!prev || (prev.seller_wallet ?? "") === e.newValue) return prev;
          return { ...prev, seller_wallet: e.newValue! };
        });
      }
      if (e.key === `sealed:seller-agreed:${dealId}` && e.newValue) {
        setDeal((prev) => {
          if (!prev || prev.status === "seller-agreed") return prev;
          return { ...prev, status: "seller-agreed" };
        });
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
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

  // Initialize sellerView from deal status on load (handles page refresh)
  useEffect(() => {
    if (!deal || role !== "seller") return;
    if (deal.status === "seller-ready") setSellerView("agent-waiting");
  }, [deal?.status, role]);

  // Buyer auto-starts AI negotiation when seller signals they're using their agent
  useEffect(() => {
    if (!deal || deal.status !== "seller-ready") return;
    if (role !== "buyer" || negState.kind !== "idle" || !memory) return;
    startNegotiation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal?.status, role, negState.kind]);

  // When seller agrees, surface NegotiationResult to the buyer automatically
  useEffect(() => {
    if (!deal || deal.status !== "seller-agreed") return;
    if (role !== "buyer" || negState.kind !== "idle") return;

    const now = Date.now();
    const terms: DealParams = {
      dealId: deal.deal_id,
      title: deal.title,
      sellerWallet: deal.seller_wallet ?? "",
      totalAmount: deal.total_amount_usdc,
      milestones: (deal.milestones ?? []).map((m) => ({
        description: m.description,
        amount: m.amount,
      })),
    };
    setNegState({
      kind: "done",
      proposal: {
        id: `${deal.deal_id}-seller-agreed`,
        origin: "manual",
        buyerWallet: deal.buyer_wallet,
        sellerWallet: deal.seller_wallet ?? "",
        initialTerms: terms,
        revisions: [],
        status: "agreed",
        finalTerms: terms,
        summary: {
          pros: ["Seller reviewed and accepted the deal terms"],
          cons: [],
          keyConcessions: [],
          riskFlags: [],
          confidenceScore: 1,
          recommendation: "accept",
          recommendationReasoning:
            "Seller accepted the terms through direct negotiation with your agent.",
        },
        buyerBoundaries: defaultSellerBoundaries(),
        sellerBoundaries: defaultSellerBoundaries(),
        createdAt: now,
        updatedAt: now,
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal?.status, role]);

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
      milestoneCount: (deal.milestones ?? []).length,
      milestones: (deal.milestones ?? []).map((m) => ({ description: m.description, amount: m.amount })),
      description: profile.bio ?? "",
    };
    return `${window.location.origin}/invite/${encodeURIComponent(encodeInvite(payload))}`;
  })();

  const dealParams: DealParams = deal
    ? {
        dealId: deal.deal_id,
        sellerWallet: deal.seller_wallet,
        totalAmount: deal.total_amount_usdc,
        milestones: (deal.milestones ?? []).map((m) => ({
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

        {/* Profile setup nudge for counterparty who joined without onboarding */}
        {role === "seller" && !profile?.onboardingComplete && (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3">
            <div className="flex items-center gap-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-warning shrink-0">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-[13px] text-warning">
                Complete your profile to enable AI agent negotiation on your behalf.
              </p>
            </div>
            <Link href={`/onboarding?returnUrl=${encodeURIComponent(`/negotiate/${deal.deal_id}`)}`} className="btn-ghost h-8 px-3 rounded-md text-[12px] shrink-0 text-warning border-warning/30">
              Set up
            </Link>
          </div>
        )}

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
                    {(deal.milestones ?? []).length}
                  </p>
                  <p className="text-[11px] text-subtle">payment stages</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted uppercase tracking-[0.06em]" style={labelStyle}>
                  Milestones
                </p>
                <div className="space-y-1">
                  {(deal.milestones ?? []).map((m, i) => (
                    <div key={i} className="flex items-center justify-between text-[12px] bg-[rgba(255,255,255,0.02)] border border-card-border-subtle rounded-md px-3 py-2">
                      <span className="truncate mr-2 text-foreground">
                        <span className="text-subtle mr-1.5">{i + 1}.</span>
                        {m.description}
                      </span>
                      <span className="shrink-0 font-mono text-muted">${formatUsdc(m.amount ?? 0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Shared conversation view — replaces invite section once seller joins */}
            {!!deal.seller_wallet && (
              <ConversationView dealId={deal.deal_id} buyerView={role === "buyer"} />
            )}

            {/* Invite counterparty (buyer only, no seller yet) */}
            {role === "buyer" && !deal.seller_wallet && deal.status === "draft" && inviteLink && (
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
                <>
                  {/* ── OBSERVER ── */}
                  {role === "observer" && (
                    <div className="p-5">
                      <p className="text-[13px] text-muted">You are observing this deal.</p>
                    </div>
                  )}

                  {/* ── SELLER — choose negotiation mode ── */}
                  {role === "seller" && sellerView === "choice" && (
                    <div className="p-5 space-y-4">
                      <div>
                        <p className="text-[13px] text-primary" style={labelStyle}>
                          How would you like to negotiate?
                        </p>
                        <p className="text-[12px] text-muted mt-0.5">
                          Choose whether to chat directly or let your AI agent handle it.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <button
                          onClick={() => setSellerView("manual")}
                          className="w-full flex items-start gap-3 px-4 py-3 rounded-xl border border-card-border bg-surface hover:border-accent/40 transition-colors text-left"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-accent mt-0.5 shrink-0">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                          </svg>
                          <div>
                            <p className="text-[13px] text-primary" style={labelStyle}>Chat directly</p>
                            <p className="text-[12px] text-muted mt-0.5">
                              You negotiate with the buyer&apos;s AI agent in real time
                            </p>
                          </div>
                        </button>

                        <button
                          onClick={async () => {
                            if (!memory) return;
                            try {
                              await fetch(`/api/deals/${deal.deal_id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json", "x-wallet": wallet ?? "" },
                                body: JSON.stringify({ status: "seller-ready" }),
                              });
                            } catch {}
                            setDeal((prev) => prev ? { ...prev, status: "seller-ready" } : prev);
                            setSellerView("agent-waiting");
                          }}
                          disabled={!memory}
                          className="w-full flex items-start gap-3 px-4 py-3 rounded-xl border border-card-border bg-surface hover:border-accent/40 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-accent mt-0.5 shrink-0">
                            <circle cx="12" cy="12" r="3" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
                          </svg>
                          <div>
                            <p className="text-[13px] text-primary" style={labelStyle}>
                              Use my AI agent
                              {!memory && <span className="text-warning ml-2 font-normal">(set up agent first)</span>}
                            </p>
                            <p className="text-[12px] text-muted mt-0.5">
                              Your agent negotiates automatically — buyer&apos;s agent responds
                            </p>
                          </div>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── SELLER — manual chat ── */}
                  {role === "seller" && sellerView === "manual" && (
                    <ManualNegotiationPanel
                      deal={deal}
                      wallet={wallet ?? ""}
                      onBack={() => setSellerView("choice")}
                      onAgree={async () => {
                        // Signal instantly to buyer's tab via localStorage
                        try {
                          localStorage.setItem(`sealed:seller-agreed:${deal.deal_id}`, "1");
                        } catch {}
                        // Combined PATCH: sets seller_wallet (idempotent if already set)
                        // + status in one round-trip, so auth passes even if previous
                        // seller_wallet sync failed.
                        try {
                          await fetch(`/api/deals/${deal.deal_id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json", "x-wallet": wallet ?? "" },
                            body: JSON.stringify({ seller_wallet: wallet ?? "", status: "seller-agreed" }),
                          });
                        } catch {}
                        setDeal((prev) => prev ? { ...prev, status: "seller-agreed" } : prev);
                        const now = Date.now();
                        const terms: DealParams = {
                          dealId: deal.deal_id,
                          title: deal.title,
                          sellerWallet: deal.seller_wallet ?? wallet ?? "",
                          totalAmount: deal.total_amount_usdc,
                          milestones: (deal.milestones ?? []).map((m) => ({ description: m.description, amount: m.amount })),
                        };
                        setNegState({ kind: "done", proposal: {
                          id: `${deal.deal_id}-manual-${now}`, origin: "manual",
                          buyerWallet: deal.buyer_wallet, sellerWallet: deal.seller_wallet ?? "",
                          initialTerms: terms, revisions: [], status: "agreed", finalTerms: terms,
                          summary: { pros: ["You accepted the deal terms"], cons: [], keyConcessions: [], riskFlags: [], confidenceScore: 1, recommendation: "accept", recommendationReasoning: "You accepted the terms. Waiting for the buyer to deploy escrow." },
                          buyerBoundaries: defaultSellerBoundaries(), sellerBoundaries: defaultSellerBoundaries(),
                          createdAt: now, updatedAt: now,
                        }});
                      }}
                    />
                  )}

                  {/* ── SELLER — waiting for buyer's agent (AI mode) ── */}
                  {role === "seller" && sellerView === "agent-waiting" && (
                    <div className="flex flex-col items-center justify-center py-14 gap-5 text-center px-6">
                      <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-accent/10 text-accent">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse">
                          <circle cx="12" cy="12" r="3" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
                        </svg>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[18px] text-primary" style={headingStyle}>Agents negotiating</p>
                        <p className="text-[13px] text-muted">Your agent and the buyer&apos;s agent are negotiating. You&apos;ll see the result shortly.</p>
                      </div>
                    </div>
                  )}

                  {/* ── BUYER — waiting for seller to join ── */}
                  {role === "buyer" && !deal.seller_wallet && (
                    <div className="p-5 space-y-2">
                      <p className="text-[13px] text-primary" style={labelStyle}>Waiting for counterparty</p>
                      <p className="text-[12px] text-muted">
                        Share the invite link above. Negotiation starts automatically once they join.
                      </p>
                    </div>
                  )}

                  {/* ── BUYER — seller joined, waiting for their mode choice ── */}
                  {role === "buyer" && !!deal.seller_wallet && deal.status === "draft" && (
                    <div className="p-5 space-y-3">
                      <p className="text-[13px] text-primary" style={labelStyle}>Waiting for counterparty</p>
                      <p className="text-[12px] text-muted">
                        The seller is choosing how they want to negotiate. You&apos;ll be notified automatically.
                      </p>
                      <div className="flex items-center gap-2 text-[12px] text-subtle">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                        <span>Checking for updates every 6 seconds…</span>
                      </div>
                    </div>
                  )}

                  {/* ── BUYER — seller chose AI mode, negotiation starting ── */}
                  {role === "buyer" && deal.status === "seller-ready" && (
                    <div className="p-5 space-y-3">
                      <p className="text-[13px] text-primary" style={labelStyle}>Starting negotiation…</p>
                      <p className="text-[12px] text-muted">Seller is using their agent. Starting your agent now.</p>
                    </div>
                  )}
                </>
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
  const displayName = wallet ? (handle ?? shortWallet) : "Not assigned yet";
  const cardClass = "surface-card rounded-xl p-4 space-y-3 block hover:border-accent/30 transition-colors";

  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] text-muted uppercase tracking-[0.06em]" style={{ fontWeight: 510 }}>{label}</p>
          <p className="text-[14px] text-primary mt-0.5 truncate" style={labelStyle}>{displayName}</p>
          {wallet && <p className="text-[11px] text-subtle font-mono">{shortWallet}</p>}
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

      {!profile && !isYou && wallet && (
        <p className="text-[12px] text-subtle pt-1 border-t border-card-border-subtle">
          Not yet on Sealed
        </p>
      )}

      {!isYou && wallet && (
        <p className="text-[11px] text-muted hover:text-accent transition-colors">View full profile →</p>
      )}
    </>
  );

  if (!wallet) {
    return <div className={cardClass}>{content}</div>;
  }

  return (
    <Link href={`/profile/${wallet}`} className={cardClass}>
      {content}
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

/* ── Shared conversation view ───────────────────────────────────────────── */

type DbMsg = { id: string; role: string; content: string; wallet: string; created_at: string };

function ConversationView({ dealId, buyerView }: { dealId: string; buyerView: boolean }) {
  const [msgs, setMsgs] = useState<DbMsg[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    function poll() {
      fetch(`/api/messages?deal_id=${dealId}`)
        .then((r) => r.json())
        .then((data) => { if (!cancelled) setMsgs(data.messages ?? []); })
        .catch(() => {});
    }
    poll();
    const interval = setInterval(poll, 4000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [dealId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  return (
    <div className="surface-card rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-card-border-subtle flex items-center justify-between">
        <p className="text-[13px] text-primary" style={labelStyle}>
          {buyerView ? "Your agent is negotiating" : "Negotiation chat"}
        </p>
        <span className="flex items-center gap-1.5 text-[11px] text-subtle">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          Live
        </span>
      </div>

      {msgs.length === 0 && (
        <div className="px-5 py-8 text-center space-y-1">
          <p className="text-[13px] text-muted">
            {buyerView
              ? "Counterparty has joined. Waiting for them to choose a negotiation mode…"
              : "Waiting for the conversation to start…"}
          </p>
          <div className="flex gap-1 items-center justify-center pt-1">
            {[0, 150, 300].map((d) => (
              <span key={d} className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: `${d}ms` }} />
            ))}
          </div>
        </div>
      )}

      <div className="px-4 py-4 space-y-3 max-h-72 overflow-y-auto">
        {msgs.map((m) => {
          const isAgent = m.role === "assistant";
          return (
            <div key={m.id} className={`flex ${isAgent ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[82%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                isAgent ? "surface-card text-foreground" : "bg-brand text-white"
              }`}>
                {!isAgent && (
                  <p className="text-[10px] opacity-70 mb-1">
                    {buyerView ? "Counterparty" : "You"}
                  </p>
                )}
                {isAgent && (
                  <p className="text-[10px] text-accent mb-1">
                    {buyerView ? "Your agent" : "Buyer's agent"}
                  </p>
                )}
                <div className="whitespace-pre-wrap">{renderMarkdown(m.content)}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/* ── Manual negotiation panel (seller without agent) ───────────────────── */

type ChatMsg = { role: "user" | "assistant"; content: string };

function ManualNegotiationPanel({
  deal,
  wallet,
  onBack,
  onAgree,
}: {
  deal: SupabaseDeal;
  wallet: string;
  onBack?: () => void;
  onAgree: () => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [agreedByAgent, setAgreedByAgent] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const openingFired = useRef(false);

  // Load existing messages from Supabase on mount
  useEffect(() => {
    fetch(`/api/messages?deal_id=${deal.deal_id}`)
      .then((r) => r.json())
      .then((data) => {
        const dbMsgs: Array<{ role: string; content: string }> = data.messages ?? [];
        if (dbMsgs.length > 0) {
          setMessages(dbMsgs.map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          })));
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal.deal_id]);

  // Auto-trigger buyer's agent opening message when conversation is empty
  useEffect(() => {
    if (messages.length > 0 || loading || openingFired.current) return;
    openingFired.current = true;
    setLoading(true);
    const dealContext = {
      title: deal.title,
      totalAmount: deal.total_amount_usdc,
      milestones: (deal.milestones ?? []).map((m) => ({ description: m.description, amount: m.amount })),
      buyerWallet: deal.buyer_wallet,
    };
    fetch("/api/negotiate/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-wallet": wallet },
      body: JSON.stringify({ dealId: deal.deal_id, messages: [], isOpening: true, sellerWallet: wallet, dealContext }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.response) {
          setMessages([{ role: "assistant", content: data.response }]);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    if (!text) setInput("");

    const updated: ChatMsg[] = [...messages, { role: "user", content }];
    setMessages(updated);
    setLoading(true);

    try {
      const dealContext = {
        title: deal.title,
        totalAmount: deal.total_amount_usdc,
        milestones: (deal.milestones ?? []).map((m) => ({ description: m.description, amount: m.amount })),
        buyerWallet: deal.buyer_wallet,
      };
      const res = await fetch("/api/negotiate/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wallet": wallet },
        body: JSON.stringify({ dealId: deal.deal_id, messages: updated, sellerWallet: wallet, dealContext }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "API error");
      setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
      if (data.agreed) setAgreedByAgent(true);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: err instanceof Error ? err.message : "Failed to respond. Try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const suggestions = [
    "What are the payment terms?",
    "Can we adjust the milestone schedule?",
    "I accept the current terms.",
  ];

  return (
    <div className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] text-primary" style={headingStyle}>
            Chat with buyer&apos;s agent
          </p>
          <p className="text-[12px] text-muted mt-0.5">
            Propose changes or accept the current terms directly.
          </p>
        </div>
        {onBack && (
          <button onClick={onBack} className="text-[12px] text-subtle hover:text-muted transition-colors shrink-0 mt-0.5">
            ← Back
          </button>
        )}
      </div>

      {/* Chat history */}
      {messages.length === 0 ? (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="px-3 py-1.5 rounded-lg border border-card-border text-[12px] text-muted hover:text-foreground hover:border-accent/30 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                  m.role === "user"
                    ? "bg-brand text-white"
                    : "surface-card text-foreground"
                }`}
              >
                <div className="whitespace-pre-wrap">{renderMarkdown(m.content)}</div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="surface-card rounded-xl px-3.5 py-2.5">
                <div className="flex gap-1 items-center h-4">
                  {[0, 150, 300].map((d) => (
                    <span key={d} className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      {!agreedByAgent && (
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Type your message or counteroffer…"
            disabled={loading}
            className="flex-1 h-9 rounded-md bg-surface border border-card-border px-3 text-[13px] text-foreground placeholder:text-subtle outline-none focus:border-accent/50 transition-colors disabled:opacity-50"
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            className="btn-primary h-9 px-4 rounded-md text-[13px] disabled:opacity-40"
          >
            Send
          </button>
        </div>
      )}

      {/* Accept button */}
      {(agreedByAgent || messages.length > 0) && (
        <button
          onClick={onAgree}
          className="btn-primary h-10 px-6 rounded-md text-[13px] w-full"
        >
          {agreedByAgent ? "Confirm agreement ✓" : "Accept current terms as-is"}
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

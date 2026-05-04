"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { SealedMark } from "@/components/SealedLogo";
import { useToast } from "@/components/Toast";
import { useDealsStore } from "@/lib/deals-store";
import { useProfileStore } from "@/lib/profile-store";
import { formatUsdc } from "@/lib/types";
import { getLlmHeaders } from "@/lib/llm-headers";
import { DocumentPanel } from "@/components/DocumentPanel";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  wallet: string | null;
  created_at: string;
}

export default function DealReviewPage() {
  const params = useParams();
  const router = useRouter();
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const dealId = params.id as string;

  const { deals, updateDeal } = useDealsStore(publicKey ?? null);
  const { profile } = useProfileStore(wallet);
  const { show: toast } = useToast();

  const deal = deals.find((d) => d.dealId === dealId);

  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [action, setAction] = useState<"approve" | "decline" | "renegotiate" | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [renegotiateInstructions, setRenegotiateInstructions] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showDocs, setShowDocs] = useState(false);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/messages?deal_id=${dealId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
      }
    } catch {
      // messages are optional — graceful fallback
    } finally {
      setLoadingMsgs(false);
    }
  }, [dealId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  if (!wallet) {
    return (
      <Shell>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted text-[14px]">Connect your wallet to view this deal review.</p>
        </div>
      </Shell>
    );
  }

  if (!deal) {
    return (
      <Shell>
        <div className="flex-1 flex items-center justify-center gap-4 flex-col">
          <p className="text-muted text-[14px]">Deal not found locally.</p>
          <Link href="/app" className="btn-primary h-9 px-5 rounded-md text-[13px]">
            Go to deals
          </Link>
        </div>
      </Shell>
    );
  }

  const amountUsdc = deal.totalAmount / 1_000_000;
  const myHandle = profile?.username ?? wallet.slice(0, 6) + "..." + wallet.slice(-4);

  async function handleApprove() {
    if (!deal) return;
    setSubmitting(true);
    try {
      updateDeal(deal.dealId, (d) => d);
      toast({ variant: "success", title: "Deal approved — proceed to fund escrow." });
      router.push("/app");
    } catch {
      toast({ variant: "error", title: "Failed to approve deal." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDecline() {
    if (declineReason.trim().length < 10) {
      toast({ variant: "error", title: "Please provide a reason (min 10 characters)." });
      return;
    }
    setSubmitting(true);
    try {
      await fetch("/api/notify/process", { method: "POST" });
      toast({ variant: "success", title: "Deal declined. Counterparty notified." });
      router.push("/app");
    } catch {
      toast({ variant: "error", title: "Failed to decline deal." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRenegotiate() {
    if (!renegotiateInstructions.trim()) {
      toast({ variant: "error", title: "Please enter renegotiation instructions." });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/negotiate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getLlmHeaders(wallet) },
        body: JSON.stringify({
          proposalId: deal!.dealId,
          buyerWallet: wallet,
          initialTerms: { amount: amountUsdc, milestones: deal!.milestones },
          buyerBoundaries: {},
          overrideInstructions: renegotiateInstructions,
        }),
      });
      if (res.ok) {
        toast({ variant: "success", title: "Agent resumed negotiation with your instructions." });
        setAction(null);
        setRenegotiateInstructions("");
        fetchMessages();
      } else {
        throw new Error("Negotiate failed");
      }
    } catch {
      toast({ variant: "error", title: "Failed to renegotiate. Try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Shell>
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">

          {/* Header */}
          <div className="flex items-center gap-3 flex-wrap">
            <Link
              href="/app"
              className="flex items-center gap-1 text-[13px] text-muted hover:text-primary transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              Back
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-[18px] text-primary truncate" style={{ fontWeight: 590 }}>
                Deal Review — {dealId}
              </h1>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[12px] text-muted">
                <span>{myHandle}</span>
                <span className="text-subtle">×</span>
                <span>Counterparty</span>
                <span className="text-subtle">·</span>
                <span className="tabular-nums">${formatUsdc(amountUsdc)} USDC</span>
                <span className="text-subtle">·</span>
                <span>{deal.milestones.length} milestone{deal.milestones.length !== 1 ? "s" : ""}</span>
              </div>
            </div>
            <button
              onClick={() => setShowDocs(!showDocs)}
              className="btn-ghost h-8 px-3 rounded-md text-[12px] flex items-center gap-1.5"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Documents
            </button>
          </div>

          {/* Documents panel (collapsible) */}
          {showDocs && (
            <DocumentPanel dealId={dealId} uploaderWallet={wallet} />
          )}

          {/* Proposed Terms Card */}
          <div className="surface-card rounded-xl p-5 space-y-4">
            <h2 className="text-[13px] text-primary" style={{ fontWeight: 590 }}>
              Proposed Terms
            </h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <TermRow label="Total Amount" value={`$${formatUsdc(amountUsdc)} USDC`} />
              <TermRow label="Milestones" value={`${deal.milestones.length}`} />
              <TermRow label="Deal ID" value={dealId} mono />
            </div>
            {deal.milestones.length > 0 && (
              <div className="border-t border-card-border-subtle pt-3 space-y-2">
                <p className="text-[11px] text-subtle" style={{ fontWeight: 510 }}>
                  Milestone breakdown
                </p>
                {deal.milestones.map((m, i) => (
                  <div key={i} className="flex items-center justify-between gap-4">
                    <span className="text-[13px] text-foreground truncate">{m.description}</span>
                    <span className="text-[13px] text-primary tabular-nums flex-shrink-0" style={{ fontWeight: 510 }}>
                      ${formatUsdc(m.amount / 1_000_000)} USDC
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Negotiation Transcript */}
          <div className="surface-card rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-card-border-subtle">
              <h2 className="text-[13px] text-primary" style={{ fontWeight: 590 }}>
                Negotiation Transcript
              </h2>
            </div>
            <div className="p-5 space-y-3 max-h-80 overflow-y-auto">
              {loadingMsgs ? (
                <p className="text-[13px] text-muted">Loading messages…</p>
              ) : messages.length === 0 ? (
                <p className="text-[13px] text-muted">
                  No negotiation messages yet. The agent will populate this as negotiations progress.
                </p>
              ) : (
                messages.map((msg) => (
                  <TranscriptMessage key={msg.id} msg={msg} myWallet={wallet} />
                ))
              )}
            </div>
          </div>

          {/* Actions */}
          {!action && (
            <div className="surface-card rounded-xl p-5 space-y-4">
              <h2 className="text-[13px] text-primary" style={{ fontWeight: 590 }}>
                Your Decision
              </h2>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setAction("approve")}
                  className="btn-primary flex-1 h-10 rounded-md text-[13px] flex items-center justify-center gap-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Approve &amp; Create Escrow
                </button>
                <button
                  onClick={() => setAction("renegotiate")}
                  className="btn-ghost flex-1 h-10 rounded-md text-[13px] flex items-center justify-center gap-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15a9 9 0 1 0 .49-3.5" />
                  </svg>
                  Renegotiate
                </button>
                <button
                  onClick={() => setAction("decline")}
                  className="btn-ghost flex-1 h-10 rounded-md text-[13px] text-danger border-danger/30 hover:bg-danger/10 flex items-center justify-center gap-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                  Decline
                </button>
              </div>
            </div>
          )}

          {/* Approve confirmation */}
          {action === "approve" && (
            <div className="surface-card rounded-xl p-5 space-y-4 border border-success/20">
              <p className="text-[14px] text-primary" style={{ fontWeight: 590 }}>
                Approve these terms?
              </p>
              <p className="text-[13px] text-muted">
                This will mark the deal as approved. You'll then fund the escrow on-chain to lock in the terms.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleApprove}
                  disabled={submitting}
                  className="btn-primary h-9 px-5 rounded-md text-[13px] disabled:opacity-40"
                >
                  {submitting ? "Approving…" : "Confirm Approval"}
                </button>
                <button
                  onClick={() => setAction(null)}
                  className="btn-ghost h-9 px-4 rounded-md text-[13px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Decline form */}
          {action === "decline" && (
            <div className="surface-card rounded-xl p-5 space-y-4 border border-danger/20">
              <p className="text-[14px] text-primary" style={{ fontWeight: 590 }}>
                Decline this deal?
              </p>
              <div className="space-y-2">
                <label className="text-[12px] text-muted" style={{ fontWeight: 510 }}>
                  Reason (required, min 10 characters)
                </label>
                <textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="Explain why you're declining…"
                  rows={3}
                  className="w-full rounded-md bg-surface border border-card-border px-3 py-2 text-[13px] text-primary outline-none focus:border-accent resize-none transition-colors"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleDecline}
                  disabled={submitting}
                  className="h-9 px-5 rounded-md text-[13px] bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20 transition-colors disabled:opacity-40"
                >
                  {submitting ? "Declining…" : "Confirm Decline"}
                </button>
                <button
                  onClick={() => setAction(null)}
                  className="btn-ghost h-9 px-4 rounded-md text-[13px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Renegotiate form */}
          {action === "renegotiate" && (
            <div className="surface-card rounded-xl p-5 space-y-4 border border-accent/20">
              <p className="text-[14px] text-primary" style={{ fontWeight: 590 }}>
                Renegotiate with your agent
              </p>
              <p className="text-[13px] text-muted">
                Tell your agent what you want changed. It will resume negotiation with these instructions injected.
              </p>
              <div className="space-y-2">
                <label className="text-[12px] text-muted" style={{ fontWeight: 510 }}>
                  Override instructions
                </label>
                <textarea
                  value={renegotiateInstructions}
                  onChange={(e) => setRenegotiateInstructions(e.target.value)}
                  placeholder="e.g. Push for 20% price reduction on milestone 2, deadline must be within 14 days…"
                  rows={3}
                  className="w-full rounded-md bg-surface border border-card-border px-3 py-2 text-[13px] text-primary outline-none focus:border-accent resize-none transition-colors"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleRenegotiate}
                  disabled={submitting}
                  className="btn-primary h-9 px-5 rounded-md text-[13px] disabled:opacity-40"
                >
                  {submitting ? "Resuming agent…" : "Resume Negotiation"}
                </button>
                <button
                  onClick={() => setAction(null)}
                  className="btn-ghost h-9 px-4 rounded-md text-[13px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center gap-4 px-4 sm:px-6 h-14 border-b border-card-border-subtle bg-panel flex-shrink-0">
        <Link href="/" className="flex items-center gap-2 text-primary">
          <SealedMark size={22} title="Sealed" />
          <span className="text-[14px] tracking-tight" style={{ fontWeight: 510 }}>
            Sealed Agent
          </span>
        </Link>
      </header>
      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  );
}

function TranscriptMessage({
  msg,
  myWallet,
}: {
  msg: Message;
  myWallet: string;
}) {
  const isAgent = msg.role === "assistant";
  const isMe = msg.wallet === myWallet;

  return (
    <div className={`flex gap-3 ${isMe ? "flex-row-reverse" : ""}`}>
      <div className="w-7 h-7 rounded-full bg-surface-hover flex items-center justify-center text-[11px] flex-shrink-0 mt-0.5">
        {isAgent ? "🤖" : "👤"}
      </div>
      <div
        className={`max-w-[80%] rounded-xl px-3 py-2 ${
          isAgent
            ? "bg-surface border border-card-border-subtle"
            : "bg-brand/10 border border-brand/20"
        }`}
      >
        <p className="text-[11px] text-subtle mb-1" style={{ fontWeight: 510 }}>
          {isAgent ? "AI Agent" : isMe ? "You" : "Counterparty"}
        </p>
        <p className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap">
          {msg.content}
        </p>
      </div>
    </div>
  );
}

function TermRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] text-muted mb-0.5" style={{ fontWeight: 510 }}>
        {label}
      </p>
      <p
        className={`text-[14px] text-primary ${mono ? "font-mono text-[12px]" : ""}`}
        style={{ fontWeight: mono ? 400 : 510 }}
      >
        {value}
      </p>
    </div>
  );
}

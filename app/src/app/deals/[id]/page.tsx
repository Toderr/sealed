"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { PublicKey } from "@solana/web3.js";
import { formatUsdc } from "@/lib/types";
import {
  buildReleaseMilestoneIx,
  buildEnsureAtaIx,
  getUsdcMint,
  sendTx,
} from "@/lib/escrow-client";
import { renderMarkdown } from "@/lib/render-markdown";
import { SealedMark } from "@/components/SealedLogo";
import Link from "next/link";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

type Milestone = { description: string; amount: number; status?: string };
type SupabaseDeal = {
  deal_id: string;
  buyer_wallet: string;
  seller_wallet: string | null;
  title: string;
  description: string | null;
  total_amount_usdc: number;
  milestones: Milestone[];
  status: string;
  created_at: string;
};
type DbMsg = { id: string; role: string; content: string; wallet: string | null; created_at: string };

const headingStyle: React.CSSProperties = { fontWeight: 590, letterSpacing: "-0.014em" };
const labelStyle: React.CSSProperties = { fontWeight: 510, letterSpacing: "-0.006em" };

export default function ActiveDealPage() {
  const params = useParams();
  const dealId = Array.isArray(params.id) ? params.id[0] : (params.id as string);
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const wallet = publicKey?.toBase58() ?? null;

  const [deal, setDeal] = useState<SupabaseDeal | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [messages, setMessages] = useState<DbMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [uploading, setUploading] = useState<number | null>(null); // milestone index
  const [approvingIndex, setApprovingIndex] = useState<number | null>(null);
  const [sendingMsg, setSendingMsg] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRefs = useRef<{ [k: number]: HTMLInputElement | null }>({});

  const role: "buyer" | "seller" | "observer" = !wallet
    ? "observer"
    : deal?.buyer_wallet === wallet ? "buyer"
    : deal?.seller_wallet === wallet ? "seller"
    : "observer";

  const milestones = deal?.milestones ?? [];
  const releasedCount = milestones.filter((m) => m.status === "Released").length;
  const currentMilestoneIndex = milestones.findIndex(
    (m) => !m.status || m.status === "Pending" || m.status === "In Review"
  );

  // Initial load
  useEffect(() => {
    if (!dealId) return;
    fetch(`/api/deals/${dealId}`)
      .then((r) => r.json())
      .then((d) => { if (d.deal) setDeal(d.deal); else setLoadError(d.error ?? "Deal not found"); })
      .catch(() => setLoadError("Failed to load deal"));

    fetch(`/api/messages?deal_id=${dealId}`)
      .then((r) => r.json())
      .then((d) => setMessages(d.messages ?? []))
      .catch(() => {});
  }, [dealId]);

  // Poll every 4s
  useEffect(() => {
    if (!dealId) return;
    const iv = setInterval(() => {
      fetch(`/api/deals/${dealId}`).then((r) => r.json()).then((d) => { if (d.deal) setDeal(d.deal); }).catch(() => {});
      fetch(`/api/messages?deal_id=${dealId}`).then((r) => r.json()).then((d) => setMessages(d.messages ?? [])).catch(() => {});
    }, 4000);
    return () => clearInterval(iv);
  }, [dealId]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function refreshAll() {
    const [d, m] = await Promise.all([
      fetch(`/api/deals/${dealId}`).then((r) => r.json()),
      fetch(`/api/messages?deal_id=${dealId}`).then((r) => r.json()),
    ]);
    if (d.deal) setDeal(d.deal);
    setMessages(m.messages ?? []);
  }

  async function patchMilestones(updated: Milestone[]) {
    await fetch(`/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-wallet": wallet ?? "" },
      body: JSON.stringify({ milestones: updated }),
    });
  }

  async function postMessage(content: string, msgRole = "user") {
    await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-wallet": wallet ?? "" },
      body: JSON.stringify({ deal_id: dealId, role: msgRole, content, wallet }),
    });
  }

  async function handleUploadProof(file: File, milestoneIndex: number) {
    if (!wallet) return;
    setUploading(milestoneIndex);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "x-wallet": wallet, "x-deal-id": dealId, "x-milestone-index": String(milestoneIndex) },
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert((err as { error?: string }).error ?? "Upload failed");
        return;
      }
      const updated = milestones.map((m, i) =>
        i === milestoneIndex ? { ...m, status: "In Review" } : m
      );
      await patchMilestones(updated);
      await postMessage(`📎 Proof submitted for Milestone ${milestoneIndex + 1}: **${milestones[milestoneIndex].description}**. Awaiting buyer review.`);
      await refreshAll();
    } finally {
      setUploading(null);
    }
  }

  async function handleApprove(milestoneIndex: number) {
    if (!publicKey || !signTransaction || !deal?.seller_wallet) return;
    setApprovingIndex(milestoneIndex);
    try {
      const sellerPubkey = new PublicKey(deal.seller_wallet);
      const mint = getUsdcMint();
      const ensureIx = await buildEnsureAtaIx(publicKey, sellerPubkey, mint);
      const releaseIx = await buildReleaseMilestoneIx(publicKey, dealId, milestoneIndex, sellerPubkey);
      const sig = await sendTx(connection, [ensureIx, releaseIx], signTransaction);

      const updated = milestones.map((m, i) =>
        i === milestoneIndex ? { ...m, status: "Released" } : m
      );
      await patchMilestones(updated);
      await postMessage(
        `✅ Milestone ${milestoneIndex + 1} approved. **${formatUsdc(milestones[milestoneIndex].amount)} USDC** released to seller.\n\nTx: \`${sig.slice(0, 8)}...${sig.slice(-8)}\``,
        "assistant"
      );
      await refreshAll();
    } catch (err) {
      console.error("Release failed:", err);
      alert("Failed to release payment. Check console for details.");
    } finally {
      setApprovingIndex(null);
    }
  }

  async function handleSendMessage() {
    const text = chatInput.trim();
    if (!text || !wallet || sendingMsg) return;
    setSendingMsg(true);
    setChatInput("");
    try {
      await postMessage(text);
      await refreshAll();
    } finally {
      setSendingMsg(false);
    }
  }

  const isComplete = milestones.length > 0 && milestones.every((m) => m.status === "Released");
  const currentInReview = currentMilestoneIndex >= 0 && milestones[currentMilestoneIndex]?.status === "In Review";

  if (!wallet) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 text-center px-4">
        <SealedMark size={48} />
        <p className="text-[16px] text-primary" style={headingStyle}>Connect wallet to view deal</p>
        <WalletMultiButton />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-4">
        <p className="text-[16px] text-primary" style={headingStyle}>Deal not found</p>
        <p className="text-[13px] text-muted">{loadError}</p>
        <Link href="/app" className="btn-ghost h-9 px-5 rounded-md text-[13px]">Go home</Link>
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex gap-1">{[0,150,300].map((d) => (
          <span key={d} className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: `${d}ms` }} />
        ))}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Back nav */}
        <Link href="/app" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-foreground transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          Back to deals
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* LEFT PANEL */}
          <div className="lg:col-span-3 space-y-4">
            {/* Header */}
            <div className="surface-card rounded-xl p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[12px] text-muted uppercase tracking-[0.06em] mb-1" style={labelStyle}>Active Deal</p>
                  <h1 className="text-[20px] text-primary" style={{ ...headingStyle, letterSpacing: "-0.022em" }}>{deal.title}</h1>
                </div>
                <span className={`pill-neutral flex-shrink-0 mt-0.5 ${isComplete ? "text-success" : "text-accent"}`}>
                  {isComplete ? "Completed" : "In Progress"}
                </span>
              </div>

              {/* Amount + progress */}
              <div>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-[26px] text-primary tabular-nums" style={headingStyle}>
                    {formatUsdc(deal.total_amount_usdc)} USDC
                  </span>
                </div>
                <div className="flex items-center justify-between text-[12px] text-muted mb-1.5">
                  <span style={labelStyle}>
                    {releasedCount < milestones.length
                      ? `Milestone ${releasedCount + 1} of ${milestones.length}`
                      : `All ${milestones.length} milestones complete`}
                  </span>
                  <span>{releasedCount}/{milestones.length} released</span>
                </div>
                <div className="h-2 bg-surface rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-500"
                    style={{ width: milestones.length > 0 ? `${(releasedCount / milestones.length) * 100}%` : "0%" }}
                  />
                </div>
              </div>
            </div>

            {/* Parties */}
            <div className="surface-card rounded-xl p-5">
              <p className="text-[11px] text-muted uppercase tracking-[0.06em] mb-3" style={labelStyle}>Parties</p>
              <div className="grid grid-cols-3 gap-3">
                <PartyCard label="Buyer" wallet={deal.buyer_wallet} isYou={wallet === deal.buyer_wallet} />
                <PartyCard label="Seller" wallet={deal.seller_wallet ?? ""} isYou={wallet === deal.seller_wallet} />
                <div className="flex flex-col items-center text-center gap-1">
                  <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <SealedMark size={14} />
                  </div>
                  <p className="text-[10px] text-muted uppercase tracking-[0.06em]">AI Agent</p>
                  <p className="text-[12px] text-primary truncate w-full" style={labelStyle}>Sealed Agent</p>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="surface-card rounded-xl p-5">
              <p className="text-[11px] text-muted uppercase tracking-[0.06em] mb-4" style={labelStyle}>Deal Timeline</p>
              <div className="space-y-0">
                {/* Deal created */}
                <TimelineRow
                  icon="check"
                  label="Deal Created & Funded"
                  sub={new Date(deal.created_at).toLocaleDateString()}
                  done={true}
                  last={false}
                />
                {milestones.map((m, i) => {
                  const done = m.status === "Released";
                  const inReview = m.status === "In Review";
                  const isCurrent = i === currentMilestoneIndex;
                  const isPending = !m.status || m.status === "Pending";
                  const isLast = i === milestones.length - 1;
                  return (
                    <div key={i}>
                      <TimelineRow
                        icon={done ? "check" : inReview ? "review" : "circle"}
                        label={`Milestone ${i + 1}: ${m.description}`}
                        sub={done ? "Released" : inReview ? "In review" : isPending && isCurrent ? "In progress" : "Pending"}
                        subColor={done ? "text-success" : inReview ? "text-warning" : isCurrent ? "text-accent" : "text-subtle"}
                        done={done}
                        last={isLast}
                        amount={formatUsdc(m.amount)}
                      />
                      {/* Seller upload proof button */}
                      {role === "seller" && isCurrent && isPending && (
                        <div className="ml-[28px] mb-3 mt-1">
                          <input
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg,.docx"
                            ref={(el) => { fileInputRefs.current[i] = el; }}
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUploadProof(file, i);
                              e.target.value = "";
                            }}
                          />
                          <button
                            onClick={() => fileInputRefs.current[i]?.click()}
                            disabled={uploading === i}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-accent/30 text-accent hover:bg-accent/5 text-[12px] transition-colors disabled:opacity-50"
                            style={labelStyle}
                          >
                            {uploading === i ? (
                              <>
                                <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.22-8.56" strokeLinecap="round"/></svg>
                                Uploading…
                              </>
                            ) : (
                              <>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                Upload Proof
                              </>
                            )}
                          </button>
                        </div>
                      )}
                      {/* Re-upload option if in review */}
                      {role === "seller" && inReview && (
                        <div className="ml-[28px] mb-3 mt-1">
                          <input
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg,.docx"
                            ref={(el) => { fileInputRefs.current[i + 100] = el; }}
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUploadProof(file, i);
                              e.target.value = "";
                            }}
                          />
                          <button
                            onClick={() => fileInputRefs.current[i + 100]?.click()}
                            disabled={uploading === i}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-card-border text-muted hover:text-foreground text-[12px] transition-colors disabled:opacity-50"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                            Re-upload
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: Chat */}
          <div className="lg:col-span-2">
            <div
              className="surface-card rounded-xl overflow-hidden flex flex-col"
              style={{ height: "calc(100vh - 160px)", minHeight: "520px" }}
            >
              {/* Header */}
              <div className="px-4 py-3.5 border-b border-card-border-subtle flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                    <SealedMark size={13} />
                  </div>
                  <p className="text-[13px] text-primary" style={labelStyle}>Sealed Agent</p>
                </div>
                <span className="flex items-center gap-1.5 text-[11px] text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                  Online
                </span>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {messages.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-[13px] text-muted">
                      {role === "seller"
                        ? "Upload proof for the current milestone to get started."
                        : "Waiting for the seller to submit proof."}
                    </p>
                  </div>
                )}

                {messages.map((m) => {
                  const isAgent = m.role === "assistant";
                  const isSystem = m.role === "system";
                  if (isSystem) return (
                    <div key={m.id} className="text-center">
                      <span className="text-[11px] text-subtle px-2">{m.content}</span>
                    </div>
                  );
                  return (
                    <div key={m.id} className={`flex ${isAgent ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                        isAgent ? "surface-card text-foreground" : "bg-brand text-white"
                      }`}>
                        {isAgent && (
                          <p className="text-[10px] text-accent mb-1">Sealed Agent</p>
                        )}
                        <div className="whitespace-pre-wrap">{renderMarkdown(m.content)}</div>
                      </div>
                    </div>
                  );
                })}

                {/* Buyer approve button */}
                {role === "buyer" && currentInReview && (
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleApprove(currentMilestoneIndex)}
                      disabled={approvingIndex !== null}
                      className="flex items-center gap-2 bg-success/10 border border-success/30 text-success rounded-xl px-4 py-2.5 text-[13px] hover:bg-success/20 transition-colors disabled:opacity-50"
                      style={labelStyle}
                    >
                      {approvingIndex === currentMilestoneIndex ? (
                        <>
                          <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.22-8.56" strokeLinecap="round"/></svg>
                          Releasing…
                        </>
                      ) : (
                        <>Looks good. Approved! ✓</>
                      )}
                    </button>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              {wallet && (
                <div className="border-t border-card-border-subtle px-4 py-3 shrink-0">
                  <div className="flex gap-2">
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
                      }}
                      placeholder="Type a message…"
                      disabled={sendingMsg}
                      className="flex-1 h-9 rounded-md bg-surface border border-card-border px-3 text-[13px] text-foreground placeholder:text-subtle outline-none focus:border-accent/50 transition-colors disabled:opacity-50"
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!chatInput.trim() || sendingMsg}
                      className="btn-primary h-9 w-9 rounded-md flex items-center justify-center shrink-0 disabled:opacity-40"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function PartyCard({ label, wallet, isYou }: { label: string; wallet: string; isYou: boolean }) {
  const short = wallet ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : "—";
  return (
    <div className="flex flex-col items-center text-center gap-1">
      <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-[11px] font-mono ${
        isYou ? "bg-accent/10 text-accent" : "bg-surface border border-card-border text-muted"
      }`}>
        {wallet ? wallet.slice(0, 2) : "?"}
      </div>
      <p className="text-[10px] text-muted uppercase tracking-[0.06em]">{label}</p>
      <p className="text-[11px] text-primary font-mono truncate w-full">{short}</p>
      {isYou && <span className="pill-neutral text-accent text-[10px]">You</span>}
    </div>
  );
}

function TimelineRow({
  icon, label, sub, subColor = "text-muted", done, last, amount,
}: {
  icon: "check" | "review" | "circle";
  label: string;
  sub: string;
  subColor?: string;
  done: boolean;
  last: boolean;
  amount?: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${
          done ? "bg-success/15 text-success" :
          icon === "review" ? "bg-warning/15 text-warning" :
          "border-2 border-card-border text-subtle"
        }`}>
          {icon === "check" && (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          )}
          {icon === "review" && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="2"/><circle cx="12" cy="12" r="9"/>
            </svg>
          )}
        </div>
        {!last && <div className="w-px flex-1 bg-card-border-subtle mt-1 mb-1" style={{ minHeight: "16px" }} />}
      </div>
      <div className="pb-4 flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-[13px] truncate ${done ? "text-foreground" : "text-muted"}`} style={done ? labelStyle : undefined}>
            {label}
          </p>
          {amount && <span className="text-[12px] text-muted font-mono shrink-0">${amount}</span>}
        </div>
        <p className={`text-[11px] mt-0.5 ${subColor}`}>{sub}</p>
      </div>
    </div>
  );
}

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
type Deliverable = {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  storage_key: string;
  milestone_index: number;
  created_at: string;
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

// Design tokens matching the screenshot
const BG    = "#0D1420";
const CARD  = "#131B2A";
const SURF  = "#1A2337";
const BDR   = "rgba(255,255,255,0.06)";
const TX1   = "#E6EDF3";
const TX2   = "#6B7688";
const TX3   = "#3D4455";
const ACC   = "#4A67E8";
const ACC2  = "#6B7EF5";

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
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [uploading, setUploading] = useState<number | null>(null); // milestone index
  const [approvingIndex, setApprovingIndex] = useState<number | null>(null);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [openingProof, setOpeningProof] = useState<string | null>(null);
  const [sealedModalShown, setSealedModalShown] = useState(false);
  const [showSealedModal, setShowSealedModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMsgCount = useRef(0);
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

    fetch(`/api/deliverables?deal_id=${dealId}`)
      .then((r) => r.json())
      .then((d) => setDeliverables(d.deliverables ?? []))
      .catch(() => {});
  }, [dealId]);

  // Poll every 4s
  useEffect(() => {
    if (!dealId) return;
    const iv = setInterval(() => {
      fetch(`/api/deals/${dealId}`).then((r) => r.json()).then((d) => { if (d.deal) setDeal(d.deal); }).catch(() => {});
      fetch(`/api/messages?deal_id=${dealId}`).then((r) => r.json()).then((d) => setMessages(d.messages ?? [])).catch(() => {});
      fetch(`/api/deliverables?deal_id=${dealId}`).then((r) => r.json()).then((d) => setDeliverables(d.deliverables ?? [])).catch(() => {});
    }, 4000);
    return () => clearInterval(iv);
  }, [dealId]);

  useEffect(() => {
    if (messages.length > prevMsgCount.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMsgCount.current = messages.length;
  }, [messages]);

  async function refreshAll() {
    const [d, m, del] = await Promise.all([
      fetch(`/api/deals/${dealId}`).then((r) => r.json()),
      fetch(`/api/messages?deal_id=${dealId}`).then((r) => r.json()),
      fetch(`/api/deliverables?deal_id=${dealId}`).then((r) => r.json()),
    ]);
    if (d.deal) setDeal(d.deal);
    setMessages(m.messages ?? []);
    setDeliverables(del.deliverables ?? []);
  }

  async function openProof(storageKey: string) {
    setOpeningProof(storageKey);
    try {
      const res = await fetch(`/api/upload/signed?key=${encodeURIComponent(storageKey)}`);
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) window.open(data.url, "_blank", "noopener,noreferrer");
      else alert("Could not open file. Please try again.");
    } finally {
      setOpeningProof(null);
    }
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

  // Show "Project Sealed" popup once when all milestones are released
  useEffect(() => {
    if (isComplete && !sealedModalShown) {
      setSealedModalShown(true);
      setShowSealedModal(true);
    }
  }, [isComplete, sealedModalShown]);

  if (!wallet) return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24 }}>
      <SealedMark size={48} />
      <p style={{ color: TX1, fontSize: 16, fontWeight: 600 }}>Connect wallet to view deal</p>
      <WalletMultiButton />
    </div>
  );

  if (loadError) return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
      <p style={{ color: TX1, fontSize: 16, fontWeight: 600 }}>Deal not found</p>
      <p style={{ color: TX2, fontSize: 13 }}>{loadError}</p>
      <Link href="/app" className="btn-ghost h-9 px-5 rounded-md text-[13px]">Go home</Link>
    </div>
  );

  if (!deal) return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="flex gap-1">{[0,150,300].map((d) => (
        <span key={d} className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ background: TX3, animationDelay: `${d}ms` }} />
      ))}</div>
    </div>
  );

  const short = (w: string | null) => w ? `${w.slice(0,4)}…${w.slice(-4)}` : "—";

  return (
    <div style={{ minHeight: "100vh", background: BG }}>
      {showSealedModal && <ProjectSealedModal onClose={() => setShowSealedModal(false)} />}

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>
        {/* Back nav */}
        <Link href="/app" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: TX2, fontSize: 13, textDecoration: "none", marginBottom: 20 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          Back to deals
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* ── LEFT PANEL ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Card 1: Header + Amount + Progress + Parties */}
            <div style={{ background: CARD, border: `1px solid ${BDR}`, borderRadius: 16, padding: "20px 22px" }}>
              {/* Title row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                <h1 style={{ color: TX1, fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>Active Deal</h1>
                <span style={{
                  background: isComplete ? "rgba(34,197,94,0.12)" : "rgba(74,103,232,0.15)",
                  color: isComplete ? "#22C55E" : "#7B8CF5",
                  border: `1px solid ${isComplete ? "rgba(34,197,94,0.25)" : "rgba(74,103,232,0.3)"}`,
                  borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 600,
                }}>
                  {isComplete ? "Completed" : "In Progress"}
                </span>
              </div>

              {/* Amount */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <SolanaIcon />
                <span style={{ color: TX1, fontSize: 28, fontWeight: 700, letterSpacing: "-0.025em" }}>
                  {formatUsdc(deal.total_amount_usdc)} USDC
                </span>
                <SolanaIcon />
              </div>

              {/* Milestone label */}
              <p style={{ color: TX2, fontSize: 13, margin: "0 0 10px" }}>
                {releasedCount < milestones.length
                  ? `Milestone ${releasedCount + 1} of ${milestones.length}`
                  : `All ${milestones.length} milestones complete`}
              </p>

              {/* Progress bar */}
              <div style={{ height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 100, overflow: "hidden", marginBottom: 22 }}>
                <div style={{
                  height: "100%",
                  width: milestones.length > 0 ? `${(releasedCount / milestones.length) * 100}%` : "0%",
                  background: `linear-gradient(90deg, ${ACC}, ${ACC2})`,
                  borderRadius: 100,
                  transition: "width 0.6s ease",
                }} />
              </div>

              {/* Party cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {/* Buyer */}
                <PartyChip label="Buyer" name={short(deal.buyer_wallet)} isYou={wallet === deal.buyer_wallet} type="buyer" />
                {/* Seller */}
                <PartyChip label="Seller" name={short(deal.seller_wallet)} isYou={wallet === deal.seller_wallet} type="seller" />
                {/* AI Agent */}
                <PartyChip label="AI Agent" name="Sealed Agent" isYou={false} type="agent" />
              </div>
            </div>

            {/* Card 2: Deal Timeline */}
            <div style={{ background: CARD, border: `1px solid ${BDR}`, borderRadius: 16, padding: "20px 22px" }}>
              <p style={{ color: TX1, fontSize: 14, fontWeight: 600, margin: "0 0 18px" }}>Deal Timeline</p>
              <div>
                {/* Created row */}
                <TLRow done label="Deal Created & Funded" time={relativeTime(deal.created_at)} last={milestones.length === 0} />

                {milestones.map((m, i) => {
                  const done     = m.status === "Released";
                  const inReview = m.status === "In Review";
                  const isCurrent= i === currentMilestoneIndex;
                  const isPending= !m.status || m.status === "Pending";
                  const isLast   = i === milestones.length - 1;
                  const proofs   = deliverables.filter((d) => d.milestone_index === i);
                  const timeLabel= done ? "Released" : inReview ? "In review" : isCurrent ? "In progress" : "—";

                  return (
                    <div key={i}>
                      <TLRow
                        done={done}
                        active={!done && isCurrent}
                        label={`Milestone ${i + 1} ${done ? "Completed" : inReview ? "In Progress" : "Pending"}`}
                        time={timeLabel}
                        last={isLast && role !== "seller"}
                      />

                      {/* Seller: upload proof */}
                      {role === "seller" && isCurrent && !done && (
                        <div style={{ marginLeft: 30, marginBottom: 12, marginTop: 4 }}>
                          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.docx"
                            ref={(el) => { fileInputRefs.current[i] = el; }} className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadProof(f, i); e.target.value = ""; }}
                          />
                          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.docx"
                            ref={(el) => { fileInputRefs.current[i+100] = el; }} className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadProof(f, i); e.target.value = ""; }}
                          />
                          <button onClick={() => fileInputRefs.current[inReview ? i+100 : i]?.click()}
                            disabled={uploading === i}
                            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(74,103,232,0.12)", border: `1px solid rgba(74,103,232,0.3)`, borderRadius: 8, padding: "6px 12px", color: ACC2, fontSize: 12, fontWeight: 500, cursor: "pointer", opacity: uploading === i ? 0.5 : 1 }}>
                            {uploading === i ? <SpinIcon /> : <UploadIcon />}
                            {inReview ? "Re-upload" : "Upload Proof"}
                          </button>
                        </div>
                      )}

                      {/* Proof files */}
                      {proofs.length > 0 && (
                        <div style={{ marginLeft: 30, marginBottom: 12 }}>
                          {proofs.map((proof) => (
                            <button key={proof.id} onClick={() => openProof(proof.storage_key)}
                              disabled={openingProof === proof.storage_key}
                              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: SURF, border: `1px solid ${BDR}`, borderRadius: 8, padding: "7px 10px", marginBottom: 4, cursor: "pointer", opacity: openingProof === proof.storage_key ? 0.6 : 1, textAlign: "left" }}>
                              <FileBadge mime={proof.content_type} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ color: TX1, fontSize: 12, fontWeight: 500, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{proof.filename}</p>
                                <p style={{ color: TX3, fontSize: 10, margin: 0 }}>{(proof.size_bytes/1024).toFixed(1)} KB</p>
                              </div>
                              {openingProof === proof.storage_key ? <SpinIcon /> : <ExternalIcon />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── RIGHT PANEL: Chat ── */}
          <div>
            <div style={{ background: CARD, border: `1px solid ${BDR}`, borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", height: "calc(100vh - 140px)", minHeight: 520 }}>

              {/* Chat header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `1px solid ${BDR}`, flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: ACC, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>S</span>
                  </div>
                  <span style={{ color: TX1, fontSize: 15, fontWeight: 600 }}>Sealed Agent</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E" }} />
                  <span style={{ color: "#22C55E", fontSize: 12 }}>Online</span>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                {messages.length === 0 && (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <p style={{ color: TX3, fontSize: 13, textAlign: "center" }}>
                      {role === "seller" ? "Upload proof to get started." : "Waiting for the seller to submit proof."}
                    </p>
                  </div>
                )}

                {messages.map((m) => {
                  if (m.role === "system") return (
                    <div key={m.id} style={{ textAlign: "center" }}>
                      <span style={{ color: TX3, fontSize: 11 }}>{m.content}</span>
                    </div>
                  );
                  const isAgent = m.role === "assistant";
                  return (
                    <div key={m.id} style={{ display: "flex", justifyContent: isAgent ? "flex-start" : "flex-end" }}>
                      <div style={{
                        maxWidth: "82%", borderRadius: 14, padding: "10px 14px", fontSize: 13, lineHeight: 1.55,
                        background: isAgent ? SURF : ACC,
                        color: isAgent ? "#B8C3D4" : "#fff",
                      }}>
                        <div className="whitespace-pre-wrap">{renderMarkdown(m.content)}</div>
                      </div>
                    </div>
                  );
                })}

                {/* Proof review + approve for buyer */}
                {role === "buyer" && currentInReview && (() => {
                  const proofs = deliverables.filter((d) => d.milestone_index === currentMilestoneIndex);
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {proofs.length > 0 && (
                        <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 12, padding: "10px 12px" }}>
                          <p style={{ color: ACC2, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 8px" }}>
                            Review proof — Milestone {currentMilestoneIndex + 1}
                          </p>
                          {proofs.map((proof) => (
                            <button key={proof.id} onClick={() => openProof(proof.storage_key)}
                              disabled={openingProof === proof.storage_key}
                              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "rgba(255,255,255,0.03)", border: `1px solid ${BDR}`, borderRadius: 8, padding: "7px 10px", marginBottom: 4, cursor: "pointer", textAlign: "left", opacity: openingProof === proof.storage_key ? 0.6 : 1 }}>
                              <FileBadge mime={proof.content_type} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ color: TX1, fontSize: 12, fontWeight: 500, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{proof.filename}</p>
                                <p style={{ color: TX3, fontSize: 10, margin: 0 }}>{(proof.size_bytes/1024).toFixed(1)} KB</p>
                              </div>
                              {openingProof === proof.storage_key ? <SpinIcon /> : <ExternalIcon />}
                            </button>
                          ))}
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button onClick={() => handleApprove(currentMilestoneIndex)}
                          disabled={approvingIndex !== null}
                          style={{ display: "flex", alignItems: "center", gap: 6, background: ACC, color: "#fff", border: "none", borderRadius: 12, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: approvingIndex !== null ? "not-allowed" : "pointer", opacity: approvingIndex !== null ? 0.6 : 1 }}>
                          {approvingIndex === currentMilestoneIndex ? <><SpinIcon /> Releasing…</> : <>Looks good. Approved! ✓</>}
                        </button>
                      </div>
                    </div>
                  );
                })()}

                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div style={{ borderTop: `1px solid ${BDR}`, padding: "12px 16px", flexShrink: 0 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                    placeholder="Type a message..."
                    disabled={sendingMsg}
                    style={{ flex: 1, height: 38, background: SURF, border: `1px solid ${BDR}`, borderRadius: 10, padding: "0 12px", color: TX1, fontSize: 13, outline: "none" }}
                  />
                  <button onClick={handleSendMessage} disabled={!chatInput.trim() || sendingMsg}
                    style={{ width: 38, height: 38, background: ACC, border: "none", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", cursor: chatInput.trim() && !sendingMsg ? "pointer" : "not-allowed", opacity: chatInput.trim() && !sendingMsg ? 1 : 0.5, flexShrink: 0 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Tiny icon helpers ── */
function SpinIcon() {
  return <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.22-8.56" strokeLinecap="round"/></svg>;
}
function UploadIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
}
function ExternalIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={TX2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>;
}

/* ── Solana icon ── */
function SolanaIcon() {
  return (
    <div style={{ width: 22, height: 22, borderRadius: "50%", background: "linear-gradient(135deg,#9945FF,#14F195)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <span style={{ color: "#fff", fontSize: 10, fontWeight: 800 }}>◎</span>
    </div>
  );
}

/* ── Party chip ── */
function PartyChip({ label, name, isYou, type }: { label: string; name: string; isYou: boolean; type: "buyer"|"seller"|"agent" }) {
  const iconBg = type === "buyer" ? "rgba(34,197,94,0.15)" : type === "seller" ? "rgba(168,85,247,0.15)" : "rgba(74,103,232,0.15)";
  const iconColor = type === "buyer" ? "#22C55E" : type === "seller" ? "#A855F7" : "#7B8CF5";
  return (
    <div style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${BDR}`, borderRadius: 10, padding: "10px 10px 8px" }}>
      <p style={{ color: TX2, fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 6px" }}>{label}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {type === "agent"
            ? <span style={{ color: iconColor, fontSize: 11, fontWeight: 700 }}>S</span>
            : type === "buyer"
            ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          }
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ color: TX1, fontSize: 12, fontWeight: 600, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</p>
          {isYou && <p style={{ color: ACC2, fontSize: 10, margin: 0 }}>You</p>}
        </div>
      </div>
    </div>
  );
}

/* ── Timeline row ── */
function TLRow({ done, active, label, time, last }: { done?: boolean; active?: boolean; label: string; time: string; last?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 12, paddingBottom: last ? 0 : 18, position: "relative" }}>
      {/* Circle + line */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 18, flexShrink: 0 }}>
        <div style={{
          width: 18, height: 18, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
          background: done ? ACC : "transparent",
          border: done ? "none" : active ? `2px solid ${ACC}` : `2px solid rgba(255,255,255,0.12)`,
        }}>
          {done && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
          {active && !done && <div style={{ width: 6, height: 6, borderRadius: "50%", background: ACC }} />}
        </div>
        {!last && <div style={{ width: 1, flex: 1, background: "rgba(255,255,255,0.07)", marginTop: 3 }} />}
      </div>
      {/* Text */}
      <div style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, paddingTop: 1 }}>
        <span style={{ color: done ? TX1 : active ? TX1 : TX2, fontSize: 13, fontWeight: done || active ? 500 : 400 }}>{label}</span>
        <span style={{ color: TX2, fontSize: 12, flexShrink: 0 }}>{time}</span>
      </div>
    </div>
  );
}

/* ── File badge ── */
function FileBadge({ mime }: { mime: string }) {
  const isPdf = mime === "application/pdf";
  const isImg = mime.startsWith("image/");
  const bg = isPdf ? "rgba(239,68,68,0.15)" : isImg ? "rgba(74,103,232,0.15)" : "rgba(255,255,255,0.06)";
  const color = isPdf ? "#EF4444" : isImg ? ACC2 : TX2;
  return (
    <div style={{ width: 28, height: 28, borderRadius: 6, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color, fontSize: 8, fontWeight: 700, fontFamily: "monospace" }}>
      {isPdf ? "PDF" : isImg ? "IMG" : "DOC"}
    </div>
  );
}

function ProjectSealedModal({ onClose }: { onClose: () => void }) {
  return (
    <>
      <style>{`
        @keyframes circle-draw {
          from { stroke-dashoffset: 283; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes check-draw {
          from { stroke-dashoffset: 100; opacity: 0; }
          to   { stroke-dashoffset: 0;   opacity: 1; }
        }
        @keyframes modal-in {
          from { opacity: 0; transform: scale(0.88); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes overlay-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes badge-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); }
          50%       { box-shadow: 0 0 0 16px rgba(34,197,94,0); }
        }
      `}</style>

      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center px-4"
        style={{ background: "rgba(0,0,0,0.72)", animation: "overlay-in 0.25s ease both" }}
        onClick={onClose}
      >
        {/* Card */}
        <div
          className="relative bg-[#0D1117] border border-[rgba(255,255,255,0.08)] rounded-2xl px-10 py-10 flex flex-col items-center gap-5 max-w-sm w-full shadow-2xl"
          style={{ animation: "modal-in 0.35s cubic-bezier(0.34,1.56,0.64,1) both" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Animated checkmark */}
          <div style={{ animation: "badge-pulse 2s ease-in-out 0.8s infinite" }} className="rounded-full">
            <svg width="88" height="88" viewBox="0 0 88 88" fill="none">
              {/* Circle */}
              <circle
                cx="44" cy="44" r="40"
                stroke="#22C55E" strokeWidth="3.5" fill="none"
                strokeDasharray="251" strokeDashoffset="251"
                strokeLinecap="round"
                style={{ animation: "circle-draw 0.55s ease-out 0.1s both" }}
              />
              {/* Inner glow fill */}
              <circle cx="44" cy="44" r="36" fill="rgba(34,197,94,0.08)" />
              {/* Checkmark */}
              <polyline
                points="26,44 38,56 62,30"
                stroke="#22C55E" strokeWidth="4" fill="none"
                strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray="100" strokeDashoffset="100"
                style={{ animation: "check-draw 0.4s ease-out 0.65s both" }}
              />
            </svg>
          </div>

          {/* Text */}
          <div className="text-center space-y-1.5">
            <h2
              className="text-[22px] text-white"
              style={{ fontWeight: 700, letterSpacing: "-0.022em" }}
            >
              Project Sealed
            </h2>
            <p className="text-[14px] text-[#8b949e] leading-relaxed">
              All milestones completed. Funds have been released to the seller.
            </p>
          </div>

          {/* Divider */}
          <div className="w-full h-px bg-[rgba(255,255,255,0.06)]" />

          {/* Close */}
          <button
            onClick={onClose}
            className="w-full h-10 rounded-lg bg-[#22C55E] text-white text-[14px] hover:bg-[#16a34a] transition-colors"
            style={{ fontWeight: 600 }}
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}

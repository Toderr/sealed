"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  Deal,
  DealStatus,
  Milestone,
  MilestoneStatus,
  MilestoneProof,
  ProofType,
  VerifierReview,
  lamportsToUsdc,
  formatUsdc,
  shortenAddress,
} from "@/lib/types";
import {
  buildFundEscrowIx,
  buildReleaseMilestoneIx,
  buildRefundIx,
  buildEnsureAtaIx,
  buildAndPartialSign,
  coSignAndSend,
  findDealPDA,
  getUsdcMint,
  sendTx,
} from "@/lib/escrow-client";
import { useToast } from "@/components/Toast";
import { useDealsStore } from "@/lib/deals-store";
import { useRefundHandoffs } from "@/lib/refund-handoff";
import {
  getAssociatedTokenAddress,
  getAccount,
  TokenAccountNotFoundError,
} from "@solana/spl-token";
import { Connection } from "@solana/web3.js";

const labelStyle: React.CSSProperties = {
  fontWeight: 510,
  letterSpacing: "-0.006em",
};
const headingStyle: React.CSSProperties = {
  fontWeight: 590,
  letterSpacing: "-0.014em",
};

const STATUS_STYLES: Record<DealStatus, { color: string; label: string }> = {
  [DealStatus.Created]: { color: "text-accent", label: "Awaiting funding" },
  [DealStatus.Funded]: { color: "text-warning", label: "Funded · ready" },
  [DealStatus.InProgress]: { color: "text-accent", label: "In progress" },
  [DealStatus.Completed]: { color: "text-success", label: "Completed" },
  [DealStatus.Refunded]: { color: "text-muted", label: "Refunded" },
  [DealStatus.Disputed]: { color: "text-danger", label: "Disputed" },
};

function MilestoneDot({ status }: { status: MilestoneStatus }) {
  const common = "h-4 w-4 rounded-full flex items-center justify-center";
  if (status === MilestoneStatus.Released) {
    return (
      <span
        className={`${common} bg-success/15 text-success`}
        aria-label="Released"
      >
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    );
  }
  if (status === MilestoneStatus.Completed) {
    return (
      <span
        className={`${common} bg-accent/15`}
        aria-label="Completed"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
      </span>
    );
  }
  return (
    <span
      className={`${common} border border-card-border`}
      aria-label="Pending"
    />
  );
}

export default function DealDetail({
  deal,
  onBack,
}: {
  deal: Deal;
  onBack: () => void;
}) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const toast = useToast();
  const { updateDeal } = useDealsStore(publicKey ?? null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const isBuyer = publicKey?.equals(deal.buyer);
  const isSeller = publicKey?.equals(deal.seller);
  const statusInfo = STATUS_STYLES[deal.status];
  const fundingPercent =
    deal.totalAmount > 0 ? (deal.fundedAmount / deal.totalAmount) * 100 : 0;

  const [dealPDA] = findDealPDA(deal.dealId);

  const refreshBalance = useCallback(async () => {
    if (!publicKey) return;
    try {
      const mint = getUsdcMint();
      const ata = await getAssociatedTokenAddress(mint, publicKey);
      const account = await getAccount(connection, ata);
      setUsdcBalance(lamportsToUsdc(Number(account.amount)));
    } catch (err) {
      if (err instanceof TokenAccountNotFoundError) {
        setUsdcBalance(0);
      } else {
        console.error("Balance fetch failed:", err);
      }
    }
  }, [publicKey, connection]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!publicKey) return;
      try {
        const mint = getUsdcMint();
        const ata = await getAssociatedTokenAddress(mint, publicKey);
        const account = await getAccount(connection, ata);
        if (!cancelled) setUsdcBalance(lamportsToUsdc(Number(account.amount)));
      } catch (err) {
        if (cancelled) return;
        if (err instanceof TokenAccountNotFoundError) {
          setUsdcBalance(0);
        } else {
          console.error("Balance fetch failed:", err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicKey, connection]);

  async function handleCopyDealId() {
    try {
      await navigator.clipboard.writeText(deal.dealId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.show({
        variant: "error",
        title: "Copy failed",
        description: "Clipboard unavailable in this browser.",
      });
    }
  }

  async function handleFundEscrow() {
    if (!publicKey || !signTransaction) return;

    const remaining = deal.totalAmount - deal.fundedAmount;
    const amountUsdc = lamportsToUsdc(remaining);

    if (usdcBalance !== null && usdcBalance < amountUsdc) {
      toast.show({
        variant: "error",
        title: "Insufficient USDC",
        description: `Need ${formatUsdc(amountUsdc)}, have ${formatUsdc(usdcBalance)}. Use the devnet faucet below.`,
      });
      return;
    }

    const pendingId = toast.show({
      variant: "loading",
      title: "Funding escrow",
      description: `Locking ${formatUsdc(amountUsdc)} USDC on devnet…`,
      duration: 0,
    });

    try {
      const mint = getUsdcMint();
      const ensureAta = await buildEnsureAtaIx(publicKey, publicKey, mint);
      const fundIx = await buildFundEscrowIx(publicKey, deal.dealId, amountUsdc);
      const sig = await sendTx(connection, [ensureAta, fundIx], signTransaction);

      const nextFunded = deal.fundedAmount + remaining;
      updateDeal(deal.dealId, (d) => ({
        ...d,
        fundedAmount: nextFunded,
        status:
          nextFunded >= d.totalAmount ? DealStatus.Funded : DealStatus.Created,
        updatedAt: Math.floor(Date.now() / 1000),
      }));

      toast.update(pendingId, {
        variant: "success",
        title: "Escrow funded",
        description: `${formatUsdc(amountUsdc)} USDC locked for ${deal.dealId}.`,
        actionHref: `https://solscan.io/tx/${sig}?cluster=devnet`,
        actionLabel: "View on Solscan",
      });
      refreshBalance();
    } catch (err) {
      console.error("Fund escrow failed:", err);
      toast.update(pendingId, {
        variant: "error",
        title: "Fund failed",
        description:
          err instanceof Error ? err.message : "Transaction rejected.",
      });
    }
  }

  async function handleReleaseMilestone(index: number) {
    if (!publicKey || !signTransaction) return;

    const milestone = deal.milestones[index];
    const pendingId = toast.show({
      variant: "loading",
      title: `Releasing milestone ${index + 1}`,
      description: `Paying seller ${formatUsdc(lamportsToUsdc(milestone.amount))} USDC…`,
      duration: 0,
    });

    try {
      const mint = getUsdcMint();
      const ensureSellerAta = await buildEnsureAtaIx(
        publicKey,
        deal.seller,
        mint
      );
      const releaseIx = await buildReleaseMilestoneIx(
        publicKey,
        deal.dealId,
        index,
        deal.seller
      );
      const sig = await sendTx(
        connection,
        [ensureSellerAta, releaseIx],
        signTransaction
      );

      updateDeal(deal.dealId, (d) => {
        const milestones = d.milestones.map((m, i) =>
          i === index
            ? {
                ...m,
                status: MilestoneStatus.Released,
                confirmedBy: publicKey,
                confirmedAt: Math.floor(Date.now() / 1000),
              }
            : m
        );
        const allReleased = milestones.every(
          (m) => m.status === MilestoneStatus.Released
        );
        return {
          ...d,
          milestones,
          releasedAmount: d.releasedAmount + milestone.amount,
          status: allReleased ? DealStatus.Completed : DealStatus.InProgress,
          updatedAt: Math.floor(Date.now() / 1000),
        };
      });

      toast.update(pendingId, {
        variant: "success",
        title: `Milestone ${index + 1} released`,
        description: `${formatUsdc(lamportsToUsdc(milestone.amount))} USDC sent to seller.`,
        actionHref: `https://solscan.io/tx/${sig}?cluster=devnet`,
        actionLabel: "View on Solscan",
      });
    } catch (err) {
      console.error("Release milestone failed:", err);
      toast.update(pendingId, {
        variant: "error",
        title: "Release failed",
        description:
          err instanceof Error ? err.message : "Transaction rejected.",
      });
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-5">
        {/* Back + header */}
        <div>
          <button
            onClick={onBack}
            className="text-[13px] text-muted hover:text-primary mb-5 flex items-center gap-1.5 transition-colors"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            Back to deals
          </button>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2
                  className="text-[20px] font-mono text-primary truncate"
                  style={{ ...headingStyle, letterSpacing: "-0.018em" }}
                >
                  {deal.dealId}
                </h2>
                <button
                  onClick={handleCopyDealId}
                  className="shrink-0 text-[11px] btn-ghost rounded-md px-2 py-1 transition-colors"
                  style={labelStyle}
                  title="Copy deal ID"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p
                className={`text-[13px] mt-1.5 ${statusInfo.color}`}
                style={labelStyle}
              >
                {statusInfo.label}
              </p>
              <a
                href={`https://solscan.io/account/${dealPDA.toBase58()}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] text-accent hover:text-accent-hover mt-1 inline-flex items-center gap-1 transition-colors"
              >
                View on Solscan
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M7 17 17 7" />
                  <path d="M7 7h10v10" />
                </svg>
              </a>
            </div>
            <div className="text-right shrink-0">
              <p
                className="text-[28px] text-primary font-mono"
                style={{ fontWeight: 590, letterSpacing: "-0.022em" }}
              >
                {formatUsdc(lamportsToUsdc(deal.totalAmount))}
              </p>
              <p
                className="text-[11px] text-subtle uppercase tracking-[0.12em]"
                style={labelStyle}
              >
                USDC
              </p>
            </div>
          </div>
        </div>

        {/* Parties */}
        <div className="surface-card rounded-xl p-4 space-y-3">
          <h3
            className="text-[11px] uppercase tracking-[0.08em] text-subtle"
            style={labelStyle}
          >
            Parties
          </h3>
          <div className="grid grid-cols-2 gap-4 text-[13px]">
            <div>
              <span className="text-[11px] text-subtle">Buyer</span>
              <p className="font-mono text-[12px] text-foreground mt-1">
                {shortenAddress(deal.buyer.toBase58(), 6)}
                {isBuyer && (
                  <span
                    className="ml-1.5 text-accent text-[10px]"
                    style={labelStyle}
                  >
                    (you)
                  </span>
                )}
              </p>
            </div>
            <div>
              <span className="text-[11px] text-subtle">Seller</span>
              <p className="font-mono text-[12px] text-foreground mt-1">
                {shortenAddress(deal.seller.toBase58(), 6)}
                {isSeller && (
                  <span
                    className="ml-1.5 text-accent text-[10px]"
                    style={labelStyle}
                  >
                    (you)
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Funding */}
        <div className="surface-card rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3
              className="text-[13px] text-primary"
              style={labelStyle}
            >
              Escrow funding
            </h3>
            <span className="text-[12px] text-muted font-mono">
              {formatUsdc(lamportsToUsdc(deal.fundedAmount))} /{" "}
              {formatUsdc(lamportsToUsdc(deal.totalAmount))}
            </span>
          </div>
          <div className="h-1.5 bg-[rgba(255,255,255,0.04)] rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all"
              style={{ width: `${fundingPercent}%` }}
            />
          </div>

          {isBuyer && deal.fundedAmount < deal.totalAmount && (
            <>
              <div className="flex items-center justify-between text-[12px] text-muted pt-1">
                <span>
                  Your balance:{" "}
                  <span className="font-mono text-foreground">
                    {usdcBalance === null
                      ? "…"
                      : `${formatUsdc(usdcBalance)} USDC`}
                  </span>
                </span>
                {usdcBalance !== null && usdcBalance === 0 && (
                  <a
                    href="https://faucet.circle.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:text-accent-hover inline-flex items-center gap-1 transition-colors"
                  >
                    Get devnet USDC
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M7 17 17 7" />
                      <path d="M7 7h10v10" />
                    </svg>
                  </a>
                )}
              </div>
              <button
                className="btn-primary w-full rounded-lg py-2.5 text-[13px]"
                onClick={handleFundEscrow}
                disabled={usdcBalance === 0}
              >
                Fund escrow (
                {formatUsdc(
                  lamportsToUsdc(deal.totalAmount - deal.fundedAmount)
                )}{" "}
                USDC)
              </button>
            </>
          )}
        </div>

        {/* Milestones */}
        <div className="surface-card rounded-xl p-4 space-y-4">
          <h3
            className="text-[13px] text-primary"
            style={labelStyle}
          >
            Milestones ({deal.milestones.length})
          </h3>
          <div className="space-y-4">
            {deal.milestones.map((milestone, index) => (
              <div
                key={index}
                className="flex items-start gap-3 text-[13px]"
              >
                <div className="flex flex-col items-center pt-0.5">
                  <MilestoneDot status={milestone.status} />
                  {index < deal.milestones.length - 1 && (
                    <div className="w-px h-10 bg-card-border-subtle mt-1" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <p
                      className="text-primary leading-snug"
                      style={labelStyle}
                    >
                      <span className="text-subtle mr-1.5">{index + 1}.</span>
                      {milestone.description}
                    </p>
                    <span className="shrink-0 font-mono text-[12px] text-muted">
                      {formatUsdc(lamportsToUsdc(milestone.amount))} USDC
                    </span>
                  </div>
                  <p className="text-[11px] text-subtle mt-1">
                    {milestone.status === MilestoneStatus.Released
                      ? `Released${milestone.confirmedAt ? ` ${new Date(milestone.confirmedAt * 1000).toLocaleDateString()}` : ""}`
                      : milestone.status}
                  </p>

                  <MilestoneProofSection
                    milestone={milestone}
                    index={index}
                    dealId={deal.dealId}
                    dealStatus={deal.status}
                    isBuyer={!!isBuyer}
                    isSeller={!!isSeller}
                    onProofSubmitted={(proof) =>
                      updateDeal(deal.dealId, (d) => ({
                        ...d,
                        milestones: d.milestones.map((m, i) =>
                          i === index ? { ...m, proof } : m
                        ),
                        updatedAt: Math.floor(Date.now() / 1000),
                      }))
                    }
                    onRelease={() => handleReleaseMilestone(index)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Refund */}
        <RefundPanel
          deal={deal}
          isBuyer={!!isBuyer}
          isSeller={!!isSeller}
          connection={connection}
          onRefunded={(nextStatus) =>
            updateDeal(deal.dealId, (d) => ({
              ...d,
              status: nextStatus,
              updatedAt: Math.floor(Date.now() / 1000),
            }))
          }
        />

        {/* Timestamps */}
        <div className="text-[11px] text-subtle text-center flex items-center justify-center gap-4 pt-2">
          <span>
            Created {new Date(deal.createdAt * 1000).toLocaleString()}
          </span>
          <span className="text-card-border">·</span>
          <span>
            Updated {new Date(deal.updatedAt * 1000).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

// --- Milestone proof upload + AI review ---

const MAX_IMAGE_BYTES = 500 * 1024; // 500 KB to stay under localStorage budget

const REC_STYLES: Record<
  VerifierReview["recommendation"],
  { label: string; color: string; bg: string; border: string }
> = {
  approve: {
    label: "Approve",
    color: "text-success",
    bg: "bg-[rgba(16,185,129,0.06)]",
    border: "border-[rgba(16,185,129,0.25)]",
  },
  request_clarification: {
    label: "Needs clarification",
    color: "text-warning",
    bg: "bg-[rgba(251,191,36,0.06)]",
    border: "border-[rgba(251,191,36,0.25)]",
  },
  reject: {
    label: "Reject",
    color: "text-danger",
    bg: "bg-[rgba(248,113,113,0.06)]",
    border: "border-[rgba(248,113,113,0.25)]",
  },
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function MilestoneProofSection({
  milestone,
  index,
  dealId,
  dealStatus,
  isBuyer,
  isSeller,
  onProofSubmitted,
  onRelease,
}: {
  milestone: Milestone;
  index: number;
  dealId: string;
  dealStatus: DealStatus;
  isBuyer: boolean;
  isSeller: boolean;
  onProofSubmitted: (proof: MilestoneProof) => void;
  onRelease: () => void;
}) {
  const toast = useToast();
  const [proofType, setProofType] = useState<ProofType>("image");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [urlValue, setUrlValue] = useState("");
  const [textValue, setTextValue] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canRelease =
    isBuyer &&
    milestone.status === MilestoneStatus.Pending &&
    (dealStatus === DealStatus.Funded || dealStatus === DealStatus.InProgress);

  const dealActive =
    dealStatus === DealStatus.Funded || dealStatus === DealStatus.InProgress;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      toast.show({
        variant: "error",
        title: "Image too large",
        description: `Max ${Math.round(MAX_IMAGE_BYTES / 1024)}KB. Compress or use a URL reference.`,
      });
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setImageDataUrl(dataUrl);
    } catch {
      toast.show({
        variant: "error",
        title: "Could not read file",
        description: "Try a different image.",
      });
    }
  }

  async function handleSubmit() {
    let proofData = "";
    if (proofType === "image") {
      if (!imageDataUrl) {
        toast.show({
          variant: "error",
          title: "No image selected",
          description: "Choose an image file first.",
        });
        return;
      }
      proofData = imageDataUrl;
    } else if (proofType === "url") {
      if (!urlValue.trim()) {
        toast.show({
          variant: "error",
          title: "URL required",
          description: "Paste a link to the delivered work.",
        });
        return;
      }
      proofData = urlValue.trim();
    } else {
      if (!textValue.trim()) {
        toast.show({
          variant: "error",
          title: "Description required",
          description: "Describe the delivered work.",
        });
        return;
      }
      proofData = textValue.trim();
    }

    setSubmitting(true);
    const pendingId = toast.show({
      variant: "loading",
      title: `Reviewing milestone ${index + 1}`,
      description: "AI verifier is analyzing your proof…",
      duration: 0,
    });

    try {
      const res = await fetch("/api/verify-milestone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          milestoneDescription: milestone.description,
          proofType,
          proofData,
          sellerNote: note.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { review: VerifierReview };

      const proof: MilestoneProof = {
        proofType,
        proofData,
        note: note.trim() || undefined,
        submittedAt: Math.floor(Date.now() / 1000),
        review: data.review,
      };
      onProofSubmitted(proof);

      toast.update(pendingId, {
        variant: "success",
        title: `AI review: ${REC_STYLES[data.review.recommendation].label}`,
        description: `Confidence ${Math.round(data.review.confidence * 100)}%. Buyer decides release.`,
      });
      setImageDataUrl(null);
      setUrlValue("");
      setTextValue("");
      setNote("");
    } catch (err) {
      toast.update(pendingId, {
        variant: "error",
        title: "Review failed",
        description: err instanceof Error ? err.message : "Unknown error.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  // Release-only path (no proof section needed) for non-party viewers
  if (!isBuyer && !isSeller) return null;

  // Hide proof UI for already-released milestones
  if (milestone.status === MilestoneStatus.Released) {
    return milestone.proof ? (
      <div className="mt-3">
        <ProofDisplay proof={milestone.proof} dealId={dealId} index={index} />
      </div>
    ) : null;
  }

  return (
    <div className="mt-3 space-y-3">
      {/* Existing proof + review */}
      {milestone.proof && (
        <ProofDisplay proof={milestone.proof} dealId={dealId} index={index} />
      )}

      {/* Seller upload form. Only if no proof yet and deal is active. */}
      {isSeller && !milestone.proof && dealActive && (
        <div className="bg-[rgba(255,255,255,0.02)] border border-card-border-subtle rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h4
              className="text-[11px] uppercase tracking-[0.08em] text-subtle"
              style={labelStyle}
            >
              Submit proof of delivery
            </h4>
            <div className="flex gap-1 text-[11px]">
              {(["image", "url", "text"] as ProofType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setProofType(t)}
                  className={`px-2 py-1 rounded-md border capitalize transition-colors ${
                    proofType === t
                      ? "bg-[rgba(113,112,255,0.12)] border-[rgba(113,112,255,0.40)] text-accent"
                      : "border-card-border text-muted hover:text-primary hover:border-[rgba(255,255,255,0.14)]"
                  }`}
                  style={labelStyle}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {proofType === "image" && (
            <div className="space-y-2">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleFile}
                disabled={submitting}
                className="block w-full text-[12px] text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-[12px] file:bg-brand file:text-white hover:file:bg-accent-hover file:cursor-pointer file:transition-colors"
                style={{ fontWeight: 510 }}
              />
              {imageDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageDataUrl}
                  alt="Proof preview"
                  className="max-h-40 rounded-md border border-card-border"
                />
              )}
              <p className="text-[11px] text-subtle">
                JPG/PNG/WEBP/GIF up to{" "}
                {Math.round(MAX_IMAGE_BYTES / 1024)}KB
              </p>
            </div>
          )}

          {proofType === "url" && (
            <input
              type="url"
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              disabled={submitting}
              placeholder="https://github.com/your/repo/pull/42"
              className="w-full bg-[rgba(255,255,255,0.02)] border border-card-border rounded-md px-3 py-2 text-[12px] text-foreground placeholder:text-subtle hover:border-[rgba(255,255,255,0.14)] focus:outline-none transition-colors"
            />
          )}

          {proofType === "text" && (
            <textarea
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              disabled={submitting}
              rows={3}
              placeholder="Describe what was delivered…"
              className="w-full bg-[rgba(255,255,255,0.02)] border border-card-border rounded-md px-3 py-2 text-[12px] text-foreground placeholder:text-subtle resize-none hover:border-[rgba(255,255,255,0.14)] focus:outline-none transition-colors"
            />
          )}

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={submitting}
            rows={2}
            placeholder="Optional note for the buyer + verifier…"
            className="w-full bg-[rgba(255,255,255,0.02)] border border-card-border rounded-md px-3 py-2 text-[12px] text-foreground placeholder:text-subtle resize-none hover:border-[rgba(255,255,255,0.14)] focus:outline-none transition-colors"
          />

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="btn-primary w-full rounded-md py-2 text-[12px]"
          >
            {submitting ? "Reviewing…" : "Submit for AI review"}
          </button>
        </div>
      )}

      {/* Buyer waiting state */}
      {isBuyer && !milestone.proof && dealActive && (
        <div className="text-[11px] text-subtle italic">
          Awaiting seller&apos;s proof of delivery
        </div>
      )}

      {/* Buyer release button. Always allowed, AI is advisory. */}
      {canRelease && (
        <button
          className="inline-flex items-center gap-1.5 bg-[rgba(16,185,129,0.12)] text-success hover:bg-[rgba(16,185,129,0.20)] border border-[rgba(16,185,129,0.30)] rounded-md px-3 py-1.5 text-[12px] transition-colors"
          onClick={onRelease}
          style={labelStyle}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Confirm &amp; release
        </button>
      )}
    </div>
  );
}

function ProofDisplay({
  proof,
  dealId,
  index,
}: {
  proof: MilestoneProof;
  dealId: string;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-[rgba(255,255,255,0.02)] border border-card-border-subtle rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between text-[11px] text-subtle">
        <span>
          Proof submitted {new Date(proof.submittedAt * 1000).toLocaleString()}
        </span>
        <span
          className="font-mono uppercase tracking-[0.08em]"
          style={labelStyle}
        >
          {proof.proofType}
        </span>
      </div>

      {proof.proofType === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={proof.proofData}
          alt={`Proof for ${dealId} milestone ${index + 1}`}
          className={`rounded-md border border-card-border-subtle cursor-pointer transition-all ${
            expanded ? "max-h-none" : "max-h-40"
          }`}
          onClick={() => setExpanded((v) => !v)}
        />
      )}

      {proof.proofType === "url" && (
        <a
          href={proof.proofData}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[12px] text-accent hover:text-accent-hover break-all inline-flex items-start gap-1 transition-colors"
        >
          <span>{proof.proofData}</span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="shrink-0 mt-1"
          >
            <path d="M7 17 17 7" />
            <path d="M7 7h10v10" />
          </svg>
        </a>
      )}

      {proof.proofType === "text" && (
        <p className="text-[12px] text-foreground whitespace-pre-wrap leading-relaxed">
          {proof.proofData}
        </p>
      )}

      {proof.note && (
        <p className="text-[11px] text-muted italic border-l-2 border-card-border pl-2 leading-relaxed">
          Seller note: {proof.note}
        </p>
      )}

      {proof.review && <ReviewCard review={proof.review} />}
    </div>
  );
}

function ReviewCard({ review }: { review: VerifierReview }) {
  const style = REC_STYLES[review.recommendation];
  const pct = Math.round(review.confidence * 100);
  return (
    <div
      className={`rounded-md border p-2.5 space-y-1.5 ${style.bg} ${style.border}`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`text-[11px] ${style.color}`}
          style={labelStyle}
        >
          AI · {style.label}
        </span>
        <span className="text-[11px] text-muted font-mono">
          {pct}% confidence
        </span>
      </div>
      <p className="text-[11px] text-foreground leading-relaxed">
        {review.notes}
      </p>
      <p className="text-[10px] text-subtle">
        Advisory only. Buyer has final say on release.
      </p>
    </div>
  );
}

// --- Mutual refund coordination ---
//
// Pre-funding cancel: if status === Created && fundedAmount === 0 the buyer
// can cancel locally (nothing was escrowed on-chain). Post-funding, refund
// needs both signatures, so we use a partial-sign handoff via the shared
// refund-handoff store so the counter-party (in the same browser, or via
// copied base64 blob) can co-sign and broadcast.

function RefundPanel({
  deal,
  isBuyer,
  isSeller,
  connection,
  onRefunded,
}: {
  deal: Deal;
  isBuyer: boolean;
  isSeller: boolean;
  connection: Connection;
  onRefunded: (nextStatus: DealStatus) => void;
}) {
  const { publicKey, signTransaction } = useWallet();
  const toast = useToast();
  const { handoffs, setHandoff, clearHandoff } = useRefundHandoffs();
  const handoff = handoffs[deal.dealId];
  const [pasteBlob, setPasteBlob] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!isBuyer && !isSeller) return null;
  if (
    deal.status === DealStatus.Completed ||
    deal.status === DealStatus.Refunded
  )
    return null;

  const unfunded =
    deal.status === DealStatus.Created && deal.fundedAmount === 0;
  const requestedByMe =
    handoff && publicKey && handoff.requestedBy === publicKey.toBase58();
  const requestedByCounterparty = handoff && !requestedByMe;

  async function handlePreFundingCancel() {
    onRefunded(DealStatus.Refunded);
    toast.show({
      variant: "success",
      title: "Deal cancelled",
      description: "Nothing was escrowed, so no on-chain action was needed.",
    });
  }

  async function handleRequestRefund() {
    if (!publicKey || !signTransaction) return;
    setBusy(true);
    const pendingId = toast.show({
      variant: "loading",
      title: "Preparing refund",
      description: "Building mutual refund transaction…",
      duration: 0,
    });
    try {
      const ix = await buildRefundIx(deal.buyer, deal.seller, deal.dealId);
      const blockhash = (await connection.getLatestBlockhash()).blockhash;
      // feePayer = whichever side initiates (either works, both sign anyway)
      const partialTxB64 = await buildAndPartialSign(
        connection,
        [ix],
        publicKey,
        signTransaction
      );
      setHandoff({
        dealId: deal.dealId,
        requestedBy: publicKey.toBase58(),
        requestedAt: Math.floor(Date.now() / 1000),
        partialTxB64,
        blockhash,
      });
      toast.update(pendingId, {
        variant: "success",
        title: "Refund requested",
        description:
          "Share the handoff blob with your counter-party so they can co-sign.",
      });
    } catch (err) {
      toast.update(pendingId, {
        variant: "error",
        title: "Refund request failed",
        description:
          err instanceof Error ? err.message : "Wallet rejected signature.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove(source: "shared" | "pasted") {
    if (!publicKey || !signTransaction) return;
    const blob =
      source === "pasted" ? pasteBlob.trim() : handoff?.partialTxB64;
    if (!blob) {
      toast.show({
        variant: "error",
        title: "No partial transaction",
        description: "Paste the base64 handoff blob first.",
      });
      return;
    }
    setBusy(true);
    const pendingId = toast.show({
      variant: "loading",
      title: "Broadcasting refund",
      description: "Co-signing and submitting to devnet…",
      duration: 0,
    });
    try {
      const sig = await coSignAndSend(connection, blob, signTransaction);
      clearHandoff(deal.dealId);
      onRefunded(DealStatus.Refunded);
      toast.update(pendingId, {
        variant: "success",
        title: "Refund complete",
        description: `Remaining escrow returned to buyer.`,
        actionHref: `https://solscan.io/tx/${sig}?cluster=devnet`,
        actionLabel: "View on Solscan",
      });
      setPasteBlob("");
    } catch (err) {
      toast.update(pendingId, {
        variant: "error",
        title: "Refund failed",
        description:
          err instanceof Error ? err.message : "Blockhash may have expired.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyBlob() {
    if (!handoff) return;
    try {
      await navigator.clipboard.writeText(handoff.partialTxB64);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.show({
        variant: "error",
        title: "Copy failed",
        description: "Clipboard unavailable.",
      });
    }
  }

  function handleCancelRequest() {
    clearHandoff(deal.dealId);
    toast.show({
      variant: "info",
      title: "Refund request cancelled",
      description: "Partial-sign handoff cleared.",
    });
  }

  return (
    <div className="surface-card rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3
          className="text-[13px] text-primary"
          style={labelStyle}
        >
          Refund
        </h3>
        <span className="text-[11px] text-subtle">
          {unfunded ? "Unilateral cancel" : "Mutual, two signatures"}
        </span>
      </div>

      {unfunded && (
        <>
          <p className="text-[12px] text-muted leading-relaxed">
            Nothing is escrowed yet, so {isBuyer ? "you" : "the buyer"} can
            cancel this deal locally without an on-chain transaction.
          </p>
          {isBuyer && (
            <button
              onClick={handlePreFundingCancel}
              disabled={busy}
              className="btn-ghost w-full rounded-lg py-2 text-[13px] hover:border-[rgba(248,113,113,0.35)] hover:text-danger"
              style={labelStyle}
            >
              Cancel deal
            </button>
          )}
        </>
      )}

      {!unfunded && !handoff && (
        <>
          <p className="text-[12px] text-muted leading-relaxed">
            Refund returns the unreleased{" "}
            <span className="font-mono text-foreground">
              {formatUsdc(
                lamportsToUsdc(deal.fundedAmount - deal.releasedAmount)
              )}{" "}
              USDC
            </span>{" "}
            to the buyer. Both parties must sign within a ~90s blockhash
            window.
          </p>
          <button
            onClick={handleRequestRefund}
            disabled={busy}
            className="btn-ghost w-full rounded-lg py-2 text-[13px] hover:border-[rgba(248,113,113,0.35)] hover:text-danger"
            style={labelStyle}
          >
            Request mutual refund
          </button>
        </>
      )}

      {handoff && requestedByMe && (
        <>
          <div className="rounded-lg border border-[rgba(251,191,36,0.25)] bg-[rgba(251,191,36,0.05)] p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />
              <span
                className="text-[11px] uppercase tracking-[0.08em] text-warning"
                style={labelStyle}
              >
                Awaiting counter-party
              </span>
            </div>
            <p className="text-[12px] text-foreground leading-relaxed">
              You&apos;ve partial-signed. Your counter-party must open this
              deal in their wallet and click{" "}
              <span style={labelStyle} className="text-primary">
                Approve refund
              </span>
              . If they&apos;re in a different browser, copy the blob below.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyBlob}
                className="btn-ghost rounded-md px-3 py-1.5 text-[12px]"
                style={labelStyle}
              >
                {copied ? "Copied" : "Copy handoff blob"}
              </button>
              <button
                onClick={handleCancelRequest}
                className="text-[12px] text-subtle hover:text-primary transition-colors"
              >
                Cancel request
              </button>
            </div>
            <p className="text-[10px] text-subtle font-mono">
              Expires when blockhash goes stale (~90s). Re-request if it
              expires.
            </p>
          </div>
        </>
      )}

      {handoff && requestedByCounterparty && (
        <>
          <div className="rounded-lg border border-[rgba(113,112,255,0.25)] bg-[rgba(113,112,255,0.05)] p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
              <span
                className="text-[11px] uppercase tracking-[0.08em] text-accent"
                style={labelStyle}
              >
                Counter-party requested refund
              </span>
            </div>
            <p className="text-[12px] text-foreground leading-relaxed">
              Your counter-party already partial-signed. Click approve to add
              your signature and broadcast the refund.
            </p>
            <button
              onClick={() => handleApprove("shared")}
              disabled={busy}
              className="btn-primary w-full rounded-md py-2 text-[12px]"
            >
              {busy ? "Broadcasting…" : "Approve & submit refund"}
            </button>
          </div>
        </>
      )}

      {/* Cross-browser paste fallback. Only show if no in-browser handoff. */}
      {!unfunded && !handoff && (
        <details className="group">
          <summary className="text-[11px] text-subtle hover:text-muted cursor-pointer select-none flex items-center gap-1 transition-colors">
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="transition-transform group-open:rotate-90"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
            Received a handoff blob from counter-party?
          </summary>
          <div className="mt-2 space-y-2">
            <textarea
              value={pasteBlob}
              onChange={(e) => setPasteBlob(e.target.value)}
              rows={3}
              placeholder="Paste base64 handoff blob…"
              className="w-full bg-[rgba(255,255,255,0.02)] border border-card-border rounded-md px-3 py-2 text-[11px] font-mono text-foreground placeholder:text-subtle resize-none hover:border-[rgba(255,255,255,0.14)] focus:outline-none transition-colors"
            />
            <button
              onClick={() => handleApprove("pasted")}
              disabled={busy || !pasteBlob.trim()}
              className="btn-primary w-full rounded-md py-2 text-[12px]"
            >
              {busy ? "Broadcasting…" : "Approve pasted refund"}
            </button>
          </div>
        </details>
      )}
    </div>
  );
}

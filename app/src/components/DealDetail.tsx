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
  buildEnsureAtaIx,
  findDealPDA,
  getUsdcMint,
  sendTx,
} from "@/lib/escrow-client";
import { useToast } from "@/components/Toast";
import { useDealsStore } from "@/lib/deals-store";
import {
  getAssociatedTokenAddress,
  getAccount,
  TokenAccountNotFoundError,
} from "@solana/spl-token";

const STATUS_STYLES: Record<DealStatus, { color: string; label: string }> = {
  [DealStatus.Created]: { color: "text-blue-400", label: "Awaiting Funding" },
  [DealStatus.Funded]: { color: "text-yellow-400", label: "Funded: Ready" },
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
      description: `Locking ${formatUsdc(amountUsdc)} USDC on devnet...`,
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
      description: `Paying seller ${formatUsdc(lamportsToUsdc(milestone.amount))} USDC...`,
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
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold font-mono text-white truncate">
                  {deal.dealId}
                </h2>
                <button
                  onClick={handleCopyDealId}
                  className="shrink-0 text-xs bg-card border border-card-border hover:border-accent text-muted hover:text-foreground px-2 py-1 rounded-md transition-colors"
                  title="Copy deal ID"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className={`text-sm mt-1 ${statusInfo.color}`}>
                {statusInfo.label}
              </p>
              <a
                href={`https://solscan.io/account/${dealPDA.toBase58()}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent hover:text-accent-hover mt-1 inline-block"
              >
                View deal on Solscan ↗
              </a>
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-bold text-white">
                {formatUsdc(lamportsToUsdc(deal.totalAmount))}
              </p>
              <p className="text-xs text-muted">USDC</p>
            </div>
          </div>
        </div>

        {/* Parties */}
        <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white">Parties</h3>
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
            <h3 className="text-sm font-semibold text-white">Escrow Funding</h3>
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

          {isBuyer && deal.fundedAmount < deal.totalAmount && (
            <>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>
                  Your balance:{" "}
                  {usdcBalance === null
                    ? "..."
                    : `${formatUsdc(usdcBalance)} USDC`}
                </span>
                {usdcBalance !== null && usdcBalance === 0 && (
                  <a
                    href="https://faucet.circle.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:text-accent-hover"
                  >
                    Get devnet USDC ↗
                  </a>
                )}
              </div>
              <button
                className="w-full bg-accent hover:bg-accent-hover text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleFundEscrow}
                disabled={usdcBalance === 0}
              >
                Fund Escrow (
                {formatUsdc(
                  lamportsToUsdc(deal.totalAmount - deal.fundedAmount)
                )}{" "}
                USDC)
              </button>
            </>
          )}
        </div>

        {/* Milestones */}
        <div className="bg-card border border-card-border rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-semibold text-white">
            Milestones ({deal.milestones.length})
          </h3>
          <div className="space-y-3">
            {deal.milestones.map((milestone, index) => (
              <div key={index} className="flex items-start gap-3 text-sm">
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

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-medium truncate text-white">
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

// --- Milestone proof upload + AI review ---

const MAX_IMAGE_BYTES = 500 * 1024; // 500 KB to stay under localStorage budget

const REC_STYLES: Record<
  VerifierReview["recommendation"],
  { label: string; color: string; bg: string; border: string }
> = {
  approve: {
    label: "Approve",
    color: "text-success",
    bg: "bg-success/10",
    border: "border-success/30",
  },
  request_clarification: {
    label: "Needs Clarification",
    color: "text-yellow-400",
    bg: "bg-yellow-400/10",
    border: "border-yellow-400/30",
  },
  reject: {
    label: "Reject",
    color: "text-danger",
    bg: "bg-danger/10",
    border: "border-danger/30",
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
      description: "AI verifier is analyzing your proof...",
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
      <div className="mt-2">
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

      {/* Seller upload form — only if no proof yet and deal is active */}
      {isSeller && !milestone.proof && dealActive && (
        <div className="bg-background/60 border border-card-border rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-white">
              Submit proof of delivery
            </h4>
            <div className="flex gap-1 text-[11px]">
              {(["image", "url", "text"] as ProofType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setProofType(t)}
                  className={`px-2 py-0.5 rounded border transition-colors ${
                    proofType === t
                      ? "bg-accent text-white border-accent"
                      : "border-card-border text-muted hover:text-foreground"
                  }`}
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
                className="block w-full text-xs text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:bg-accent file:text-white hover:file:bg-accent-hover file:cursor-pointer"
              />
              {imageDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageDataUrl}
                  alt="Proof preview"
                  className="max-h-40 rounded-md border border-card-border"
                />
              )}
              <p className="text-[10px] text-muted">
                JPG/PNG/WEBP/GIF up to{" "}
                {Math.round(MAX_IMAGE_BYTES / 1024)}KB.
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
              className="w-full bg-card border border-card-border rounded-md px-3 py-2 text-xs focus:outline-none focus:border-accent"
            />
          )}

          {proofType === "text" && (
            <textarea
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              disabled={submitting}
              rows={3}
              placeholder="Describe what was delivered..."
              className="w-full bg-card border border-card-border rounded-md px-3 py-2 text-xs resize-none focus:outline-none focus:border-accent"
            />
          )}

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={submitting}
            rows={2}
            placeholder="Optional note for the buyer + verifier..."
            className="w-full bg-card border border-card-border rounded-md px-3 py-2 text-xs resize-none focus:outline-none focus:border-accent"
          />

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-accent hover:bg-accent-hover text-white rounded-md py-2 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Reviewing..." : "Submit for AI Review"}
          </button>
        </div>
      )}

      {/* Buyer waiting state */}
      {isBuyer && !milestone.proof && dealActive && (
        <div className="text-[11px] text-muted italic">
          Awaiting seller&apos;s proof of delivery.
        </div>
      )}

      {/* Buyer release button — always allowed, AI is advisory */}
      {canRelease && (
        <button
          className="bg-success/15 text-success hover:bg-success/25 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          onClick={onRelease}
        >
          Confirm &amp; Release
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
    <div className="bg-background/60 border border-card-border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between text-[11px] text-muted">
        <span>
          Proof submitted {new Date(proof.submittedAt * 1000).toLocaleString()}
        </span>
        <span className="font-mono uppercase">{proof.proofType}</span>
      </div>

      {proof.proofType === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={proof.proofData}
          alt={`Proof for ${dealId} milestone ${index + 1}`}
          className={`rounded-md border border-card-border cursor-pointer transition-all ${
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
          className="text-xs text-accent hover:text-accent-hover break-all"
        >
          {proof.proofData} ↗
        </a>
      )}

      {proof.proofType === "text" && (
        <p className="text-xs text-foreground whitespace-pre-wrap">
          {proof.proofData}
        </p>
      )}

      {proof.note && (
        <p className="text-[11px] text-muted italic border-l-2 border-card-border pl-2">
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
    <div className={`rounded-md border p-2.5 space-y-1.5 ${style.bg} ${style.border}`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold ${style.color}`}>
          AI: {style.label}
        </span>
        <span className="text-[11px] text-muted font-mono">
          {pct}% confidence
        </span>
      </div>
      <p className="text-[11px] text-foreground leading-relaxed">
        {review.notes}
      </p>
      <p className="text-[10px] text-muted">
        Advisory only — buyer has final say on release.
      </p>
    </div>
  );
}


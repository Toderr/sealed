"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAppWallet as useWallet } from "@/lib/use-app-wallet";
import { useAppConnection as useConnection } from "@/lib/use-app-connection";
import { PublicKey } from "@solana/web3.js";
import { formatUsdc, usdcToLamports, type SupabaseDeal } from "@/lib/types";
import {
  buildReleaseMilestoneIx,
  buildEnsureAtaIx,
  buildBuyerTimeoutRefundIx,
  buildCancelDealIx,
  buildCloseDealIx,
  buildRefundIx,
  buildAndPartialSign,
  coSignAndSend,
  getUsdcMint,
  sendTx,
  fetchFeeConfig,
} from "@/lib/escrow-client";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { escrowAccountUrl, txUrl } from "@/lib/explorer";
import { useDisplayName } from "@/lib/hooks/use-display-name";
import { MOCK_CHAIN } from "@/lib/env";
import { mockEscrow } from "@/lib/mock-escrow";
import { apiFetch, apiFetchSafe, ApiError } from "@/lib/api-client";
import { retryWrite } from "@/lib/retry-write";
import { useApi, POLL_MS } from "@/lib/swr";
import { renderMarkdown } from "@/lib/render-markdown";
import { SealedMark } from "@/components/SealedLogo";
import { SealedBackdrop } from "@/components/SealedBackdrop";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import Link from "next/link";

import WalletMultiButton from "@/components/AppWalletButton";

// Inactivity timeout for the buyer's unilateral reclaim, mirroring the on-chain
// program's TIMEOUT_SECONDS (30 days). Used to compute/display the unlock date.
const TIMEOUT_SECONDS = 30 * 24 * 60 * 60;

// Product upload cap. Matches the server MAX_SIZE; guards each upload entry point
// client-side so the user gets a clear message + Drive-link hint instead of a
// raw 413. (On Vercel the effective body cap is lower ~4.5 MB — see the upload
// route; large files should move to a direct-to-Storage signed upload.)
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

type Milestone = { description: string; amount: number; status?: string };
type RefundRequest = {
  deal_id: string;
  requested_by: string;
  partial_tx: string;
  blockhash: string | null;
  // Present only for durable-nonce requests. A request without it predates the
  // expiry fix and can't be co-signed (its blockhash is long dead).
  nonce_account?: string | null;
  status: string;
  created_at: string;
};
type DbMsg = {
  id: string;
  role: string;
  content: string;
  wallet: string | null;
  created_at: string;
  metadata?: { attachment?: string; kind?: string } | null;
};
type Deliverable = {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  storage_key: string;
  milestone_index: number;
  created_at: string;
};
type RatingLookup = {
  rating: {
    id: string;
    stars: number;
    review_text: string;
    revealed: boolean;
    submitted_at: string;
    ratee_wallet: string;
  } | null;
  canRate: boolean;
  ratee_wallet: string;
};

export default function ActiveDealPage() {
  const params = useParams();
  const router = useRouter();
  const dealId = Array.isArray(params.id) ? params.id[0] : (params.id as string);
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const wallet = publicKey?.toBase58() ?? null;
  const toast = useToast();

  // Polled deal data via SWR (refreshInterval replaces the old 4s setInterval).
  const dealQuery = useApi<{ deal?: SupabaseDeal; error?: string }>(
    dealId ? `/api/deals/${dealId}` : null, wallet, { refreshInterval: POLL_MS });
  const messagesQuery = useApi<{ messages?: DbMsg[] }>(
    dealId ? `/api/messages?deal_id=${dealId}` : null, wallet, { refreshInterval: POLL_MS });
  const deliverablesQuery = useApi<{ deliverables?: Deliverable[] }>(
    dealId ? `/api/deliverables?deal_id=${dealId}` : null, wallet, { refreshInterval: POLL_MS });
  // Pending mutual-refund request (the relay). Polled so the counterparty sees
  // it appear and can co-sign.
  const refundReqQuery = useApi<{ request?: RefundRequest | null }>(
    dealId ? `/api/deals/${dealId}/refund` : null, wallet, { refreshInterval: POLL_MS });

  const deal = dealQuery.data?.deal ?? null;
  // Show the error screen when the deal genuinely can't load: either the route
  // returned a 2xx body with no deal, or the fetch threw (404, 500, network).
  // ApiError.message carries the server's {error} ("Deal not found"). Gated on
  // !deal so a transient blip that SWR retries away just keeps the spinner.
  const loadError = !deal
    ? dealQuery.error instanceof ApiError
      ? dealQuery.error.message
      : dealQuery.error
        ? "Failed to load deal"
        : dealQuery.data && !dealQuery.data.deal
          ? (dealQuery.data.error ?? "Deal not found")
          : null
    : null;
  // Memoized so the scroll effect's [messages] dep is stable across renders
  // when the payload is unchanged.
  const messages = useMemo(
    () => messagesQuery.data?.messages ?? [],
    [messagesQuery.data]
  );
  const deliverables = deliverablesQuery.data?.deliverables ?? [];

  // Revalidate all three after a write (replaces the old refreshAll()).
  const refreshAll = async () => {
    await Promise.all([dealQuery.mutate(), messagesQuery.mutate(), deliverablesQuery.mutate(), refundReqQuery.mutate()]);
  };

  const [chatInput, setChatInput] = useState("");
  const [uploading, setUploading] = useState<number | null>(null);
  // Link/text proof (an alternative to a file upload for the current milestone).
  const [linkProofOpen, setLinkProofOpen] = useState<number | null>(null);
  const [linkProofValue, setLinkProofValue] = useState("");
  const [submittingLink, setSubmittingLink] = useState(false);
  const [approvingIndex, setApprovingIndex] = useState<number | null>(null);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [openingProof, setOpeningProof] = useState<string | null>(null);
  const [sealedModalShown, setSealedModalShown] = useState(false);
  const [showSealedModal, setShowSealedModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<number | null>(null);
  const [refunding, setRefunding] = useState(false);
  // Replaces the four native confirm() gates (timeout reclaim, cancel deal,
  // request mutual refund, co-sign refund). confirm() is synchronous; a modal is
  // not — so the action is parked here and run from the dialog's Confirm button.
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    body: string;
    confirmLabel: string;
    danger?: boolean;
    run: () => void | Promise<void>;
  } | null>(null);
  const [changesModal, setChangesModal] = useState<number | null>(null);
  const [changesNote, setChangesNote] = useState("");
  const [requestingChanges, setRequestingChanges] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState("other");
  const [reportMessage, setReportMessage] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportDone, setReportDone] = useState(false);
  const [ratingLookup, setRatingLookup] = useState<RatingLookup | null>(null);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingStars, setRatingStars] = useState(0);
  const [ratingText, setRatingText] = useState("");
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMsgCount = useRef(0);
  const fileInputRefs = useRef<{ [k: number]: HTMLInputElement | null }>({});
  const chatFileRef = useRef<HTMLInputElement>(null);

  const role: "buyer" | "seller" | "observer" = !wallet
    ? "observer"
    : deal?.buyer_wallet === wallet ? "buyer"
    : deal?.seller_wallet === wallet ? "seller"
    : "observer";

  // Counterparty display name (bug #4): resolve the other party's wallet to a
  // profile name. Called unconditionally (before any early return) to satisfy
  // the rules of hooks; safe when deal is still null.
  const counterpartyWallet = role === "buyer" ? deal?.seller_wallet : deal?.buyer_wallet;
  const counterpartyName = useDisplayName(counterpartyWallet || null);

  const milestones = deal?.milestones ?? [];
  const releasedCount = milestones.filter((m) => m.status === "Released").length;
  const currentMilestoneIndex = milestones.findIndex(
    (m) => !m.status || m.status === "Pending" || m.status === "In Review"
  );

  useEffect(() => {
    if (messages.length > prevMsgCount.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMsgCount.current = messages.length;
  }, [messages]);

  async function openProof(storageKey: string) {
    setOpeningProof(storageKey);
    try {
      const data = await apiFetchSafe<{ url?: string; error?: string }>(
        `/api/upload/signed?key=${encodeURIComponent(storageKey)}`, {}, {}
      );
      if (data.url) window.open(data.url, "_blank", "noopener,noreferrer");
      else toast.show({ variant: "error", title: "Could not open file. Please try again." });
    } finally {
      setOpeningProof(null);
    }
  }

  // Returns whether the mirror write eventually succeeded. Uses apiFetch (which
  // throws) inside retryWrite so a transient failure is retried rather than
  // silently swallowed — otherwise a released milestone stays "Pending"/"In
  // Review" in the mirror and the UI is stuck on "Confirm & release" (F5).
  async function patchMilestones(updated: Milestone[]): Promise<boolean> {
    return retryWrite(() =>
      apiFetch(`/api/deals/${dealId}`, {
        method: "PATCH",
        wallet: wallet ?? "",
        body: { milestones: updated },
      }),
    );
  }

  async function postMessage(content: string, msgRole = "user") {
    await apiFetchSafe("/api/messages", {
      method: "POST",
      wallet: wallet ?? "",
      body: { deal_id: dealId, role: msgRole, content, wallet },
    }, undefined);
  }

  async function handleUploadProof(file: File, milestoneIndex: number) {
    if (!wallet) return;
    // Guard the 25 MB product cap client-side so the user gets a clear message
    // (and the Drive-link hint) instead of a raw 413 (#10).
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.show({ variant: "error", title: "That file is over 25 MB. Please share a Google Drive link instead (use “paste a link / text”)." });
      return;
    }
    setUploading(milestoneIndex);
    try {
      const form = new FormData();
      form.append("file", file);
      try {
        await apiFetch("/api/upload", {
          method: "POST",
          rawBody: form,
          headers: { "x-wallet": wallet, "x-deal-id": dealId, "x-milestone-index": String(milestoneIndex) },
        });
      } catch (e) {
        toast.show({ variant: "error", title: e instanceof ApiError ? e.message : "Upload failed" });
        return;
      }
      const updated = milestones.map((m, i) =>
        i === milestoneIndex ? { ...m, status: "In Review" } : m
      );
      await patchMilestones(updated);
      // Release stays buyer-only, so the buyer is always the reviewer. When the
      // buyer uploads their own proof, "awaiting your review" reads oddly — keep
      // it generic so either party can submit.
      const tail = role === "buyer" ? "Awaiting your review & release." : "Awaiting buyer review.";
      await postMessage(`📎 Proof submitted for Milestone ${milestoneIndex + 1}: **${milestones[milestoneIndex].description}**. ${tail}`);
      await refreshAll();
    } finally {
      setUploading(null);
    }
  }

  // Submit milestone proof as a link or block of text instead of a file.
  async function handleSubmitLink(milestoneIndex: number) {
    if (!wallet) return;
    const raw = linkProofValue.trim();
    if (!raw) return;
    // Anything that parses as an http/https URL is sent as a link; otherwise
    // it's treated as text proof.
    let isUrl = false;
    try {
      const u = new URL(raw);
      isUrl = u.protocol === "http:" || u.protocol === "https:";
    } catch {
      isUrl = false;
    }
    setSubmittingLink(true);
    try {
      try {
        await apiFetch("/api/deliverables/link", {
          method: "POST",
          wallet,
          body: {
            deal_id: dealId,
            milestone_index: milestoneIndex,
            ...(isUrl ? { url: raw } : { text: raw }),
          },
        });
      } catch (e) {
        toast.show({ variant: "error", title: e instanceof ApiError ? e.message : "Failed to submit proof" });
        return;
      }
      // The proof row is already saved server-side. Update the milestone status
      // + thread best-effort: if these fail, the proof still exists, so don't
      // error out — just close the form and refresh.
      const updated = milestones.map((m, i) =>
        i === milestoneIndex ? { ...m, status: "In Review" } : m
      );
      try {
        await patchMilestones(updated);
        const tail = role === "buyer" ? "Awaiting your review & release." : "Awaiting buyer review.";
        await postMessage(`🔗 Proof submitted for Milestone ${milestoneIndex + 1}: **${milestones[milestoneIndex].description}**. ${tail}`);
      } catch (e) {
        console.error("Link proof saved, but status/message update failed:", e);
      }
      setLinkProofValue("");
      setLinkProofOpen(null);
      await refreshAll();
    } finally {
      setSubmittingLink(false);
    }
  }

  async function handleApprove(milestoneIndex: number) {
    if (!publicKey || !signTransaction || !deal?.seller_wallet) return;
    setApprovingIndex(milestoneIndex);
    setConfirmModal(null);
    try {
      const sellerPubkey = new PublicKey(deal.seller_wallet);
      const mint = getUsdcMint();
      const ensureIx = await buildEnsureAtaIx(publicKey, sellerPubkey, mint);
      // Fee-bearing deals take the seller's fee half from this milestone and send
      // it to the treasury, so release must pass the treasury token account (else
      // the program reverts with TreasuryAccountRequired). Mirrors funding.
      const fee = await fetchFeeConfig(connection);
      const treasuryTa = fee.active
        ? await getAssociatedTokenAddress(mint, new PublicKey(fee.treasury))
        : undefined;
      const releaseIx = await buildReleaseMilestoneIx(publicKey, dealId, milestoneIndex, sellerPubkey, treasuryTa);
      const sig = await sendTx(connection, [ensureIx, releaseIx], signTransaction);

      const updated = milestones.map((m, i) =>
        // Persist the release tx on the milestone (JSONB, no schema change) so it
        // can be linked on the scanner later (N3/N8).
        i === milestoneIndex ? { ...m, status: "Released", release_tx: sig } : m
      );

      if (MOCK_CHAIN) {
        const allReleased = updated.every((m) => m.status === "Released");
        mockEscrow.releaseMilestone(
          dealId,
          sellerPubkey.toBase58(),
          usdcToLamports(milestones[milestoneIndex].amount),
          allReleased
        );
      }
      // The on-chain release already succeeded and is irreversible. Persist to
      // the mirror durably (retries); if it still fails, warn softly — the
      // payment WENT THROUGH, it just hasn't synced — rather than "failed to
      // release", which would be wrong and prompt a confusing re-click (F5).
      const synced = await patchMilestones(updated);
      await postMessage(
        `✅ Milestone ${milestoneIndex + 1} approved. **${formatUsdc(milestones[milestoneIndex].amount)} USDC** released to seller.\n\nTx: \`${sig.slice(0, 8)}...${sig.slice(-8)}\``,
        "assistant"
      );
      await refreshAll();
      if (!synced) {
        toast.show({
          variant: "success",
          title: "Payment released on-chain ✓",
          description: "Syncing the status is taking a moment. It'll update shortly; no need to release again.",
          duration: 9000,
        });
      }
    } catch (err) {
      console.error("Release failed:", err);
      toast.show({ variant: "error", title: "Failed to release payment. Check console for details." });
    } finally {
      setApprovingIndex(null);
    }
  }

  // Buyer requests changes on an In-Review milestone: send it back to Pending so
  // the seller can revise + re-submit, and post the buyer's note to the thread.
  // Off-chain only (no funds move) — mirrors the release flow's mirror-patch shape.
  async function handleRequestChanges(milestoneIndex: number) {
    if (role !== "buyer") return;
    setRequestingChanges(true);
    try {
      const updated = milestones.map((m, i) =>
        i === milestoneIndex ? { ...m, status: "Pending" } : m
      );
      await patchMilestones(updated);
      const note = changesNote.trim();
      await postMessage(
        `🔁 Buyer requested changes on Milestone ${milestoneIndex + 1}: **${milestones[milestoneIndex].description}**.${note ? `\n\n> ${note}` : ""}\n\nPlease revise and re-submit proof.`
      );
      setChangesModal(null);
      setChangesNote("");
      await refreshAll();
    } catch (err) {
      console.error("Request changes failed:", err);
      toast.show({ variant: "error", title: "Could not request changes. Please try again." });
    } finally {
      setRequestingChanges(false);
    }
  }

  async function patchStatus(status: string) {
    await apiFetchSafe(`/api/deals/${dealId}`, {
      method: "PATCH",
      wallet: wallet ?? "",
      body: { status },
    }, undefined);
  }

  // Buyer-only unilateral refund after the 30-day funding timeout — the escape
  // hatch for a ghosting seller. One signature (buyer). On-chain the instruction
  // also closes the escrow vault (rent → buyer). Mirrors handleApprove's shape.
  function handleTimeoutRefund() {
    if (!publicKey || !signTransaction || role !== "buyer") return;
    setPendingConfirm({
      title: "Reclaim your escrowed funds?",
      body: "This ends the deal. Only available after the inactivity timeout.",
      confirmLabel: "Reclaim funds",
      danger: true,
      run: doTimeoutRefund,
    });
  }

  async function doTimeoutRefund() {
    if (!publicKey || !signTransaction || role !== "buyer") return;
    setRefunding(true);
    try {
      const ix = await buildBuyerTimeoutRefundIx(publicKey, dealId);
      const sig = await sendTx(connection, [ix], signTransaction);
      if (MOCK_CHAIN) {
        try { mockEscrow.refund(dealId, publicKey.toBase58()); } catch { /* mock-only */ }
      }
      await patchStatus("refunded");
      await postMessage(
        `↩️ Buyer reclaimed the escrowed funds via inactivity timeout. Deal refunded.\n\nTx: \`${sig.slice(0, 8)}...${sig.slice(-8)}\``,
        "assistant"
      );
      await refreshAll();
    } catch (err) {
      console.error("Timeout refund failed:", err);
      if (err instanceof Error && /Timeout/i.test(err.message)) {
        // The 30-day inactivity timeout is anchored to the on-chain deal.funded_at.
        // The mirror now stores funded_at (set at funding); fall back to updated_at
        // for older deals created before that column existed. Surface the computed
        // unlock date so the buyer knows when reclaim becomes possible, instead of
        // a bare "hasn't elapsed yet".
        // Prefer funded_at (the true funding time). updated_at is only an
        // approximation — it's bumped by later edits, so mark the date "approx"
        // when that's all we have, rather than stating a precise (possibly wrong)
        // unlock date. The chain is authoritative either way.
        const exact = !!deal?.funded_at;
        const fundedRaw = deal?.funded_at ?? deal?.updated_at ?? null;
        const fundedAt = fundedRaw ? new Date(fundedRaw) : null;
        if (fundedAt && !isNaN(fundedAt.getTime())) {
          const unlock = new Date(fundedAt.getTime() + TIMEOUT_SECONDS * 1000);
          toast.show({
            variant: "error",
            title: exact
              ? `You can reclaim these funds after ${unlock.toLocaleDateString()} (30 days after funding). It hasn't elapsed yet.`
              : `The 30-day inactivity window hasn't elapsed yet — reclaim unlocks roughly ${unlock.toLocaleDateString()} (approximate; measured 30 days after funding).`,
            duration: 9000,
          });
        } else {
          toast.show({ variant: "error", title: "You can reclaim these funds 30 days after the deal was funded. That window hasn't elapsed yet.", duration: 9000 });
        }
      } else {
        toast.show({ variant: "error", title: "Refund failed. Check console for details." });
      }
    } finally {
      setRefunding(false);
    }
  }

  // Buyer-only cancel of a not-yet-funded deal — closes the on-chain deal +
  // vault (rent → buyer) and marks the mirror refunded. Real chain call, not a
  // local no-op.
  function handleCancelDeal() {
    if (!publicKey || !signTransaction || role !== "buyer") return;
    setPendingConfirm({
      title: "Cancel this deal?",
      body: "It hasn't been funded, so nothing is escrowed.",
      confirmLabel: "Cancel deal",
      danger: true,
      run: doCancelDeal,
    });
  }

  async function doCancelDeal() {
    if (!publicKey || !signTransaction || role !== "buyer") return;
    setRefunding(true);
    try {
      const ix = await buildCancelDealIx(publicKey, dealId);
      const sig = await sendTx(connection, [ix], signTransaction);
      if (MOCK_CHAIN) {
        try { mockEscrow.refund(dealId, publicKey.toBase58()); } catch { /* mock-only */ }
      }
      await patchStatus("refunded");
      await postMessage(
        `✖️ Buyer cancelled the deal before funding.\n\nTx: \`${sig.slice(0, 8)}...${sig.slice(-8)}\``,
        "assistant"
      );
      await refreshAll();
    } catch (err) {
      console.error("Cancel failed:", err);
      toast.show({ variant: "error", title: "Cancel failed. Check console for details." });
    } finally {
      setRefunding(false);
    }
  }

  // Mutual refund, step 1: the initiator (buyer or seller) builds the refund tx,
  // partial-signs it, and stores it on the relay for the counterparty to co-sign.
  function handleRequestRefund() {
    if (!publicKey || !signTransaction || role === "observer" || !deal?.buyer_wallet || !deal?.seller_wallet) return;
    setPendingConfirm({
      title: "Request a mutual refund?",
      body: "The other party must also sign. Unreleased escrow returns to the buyer.",
      confirmLabel: "Request refund",
      danger: true,
      run: doRequestRefund,
    });
  }

  async function doRequestRefund() {
    if (!publicKey || !signTransaction || role === "observer" || !deal?.buyer_wallet || !deal?.seller_wallet) return;
    setRefunding(true);
    try {
      const buyer = new PublicKey(deal.buyer_wallet);
      const seller = new PublicKey(deal.seller_wallet);
      const ix = await buildRefundIx(buyer, seller, dealId);
      // Durable-nonce based: the partial tx stays valid until the counterparty
      // co-signs, however long that takes (a recent blockhash expired in ~90s,
      // so the handoff almost always failed with "Blockhash not found").
      const { partialTx, nonceAccount, nonce } = await buildAndPartialSign(
        connection, [ix], publicKey, signTransaction
      );
      await apiFetch(`/api/deals/${dealId}/refund`, {
        method: "POST",
        wallet: wallet ?? "",
        body: { partial_tx: partialTx, blockhash: nonce, nonce_account: nonceAccount },
      });
      await postMessage(`↩️ ${role === "buyer" ? "Buyer" : "Seller"} requested a mutual refund. Awaiting the other party's signature.`);
      await refreshAll();
    } catch (err) {
      console.error("Refund request failed:", err);
      const msg = err instanceof Error ? err.message : String(err ?? "");
      // Wallet rejection / user cancelled the signature — not an error, just a
      // cancellation. Phantom/Solflare surface this as a message containing
      // "reject"/"denied", or an object with code 4001.
      // Solana wallet-adapter wraps the provider error in `.error`, so the 4001
      // "user rejected" code lives at err.error.code, not err.code.
      const e = err as { code?: number; error?: { code?: number } } | null;
      const code = e?.code ?? e?.error?.code;
      // Only treat it as a user cancellation on the wallet's explicit signal:
      // the standard 4001 code, or a tight "user rejected/denied" phrase. A loose
      // match on "cancel"/"reject" wrongly swallowed real network/abort errors as
      // "you declined" (which they weren't).
      const userCancelled = code === 4001 || /user (rejected|denied)|rejected the request/i.test(msg);
      if (userCancelled) {
        // A deliberate decline isn't a failure — surface it as info, not error.
        toast.show({ variant: "info", title: "Refund cancelled — you declined the signature." });
      } else if (err instanceof ApiError && err.status === 403) {
        toast.show({ variant: "error", title: "Only the buyer or seller on this deal can start a refund." });
      } else if (/blockhash|fetch|timeout|network|failed to fetch|aborted/i.test(msg)) {
        toast.show({ variant: "error", title: "Couldn't reach the network. Check your connection and try again." });
      } else {
        toast.show({ variant: "error", title: "Couldn't start the refund. Please try again." });
      }
    } finally {
      setRefunding(false);
    }
  }

  // Mutual refund, step 2: the counterparty co-signs the stored partial tx and
  // broadcasts it. On success the mirror is marked refunded and (for the buyer)
  // the vault rent is reclaimed via close_deal.
  function handleCoSignRefund() {
    const req = refundReqQuery.data?.request;
    if (!publicKey || !signTransaction || !req) return;
    setPendingConfirm({
      title: "Approve and submit the mutual refund?",
      body: "Unreleased escrow returns to the buyer and the deal ends.",
      confirmLabel: "Approve refund",
      danger: true,
      run: doCoSignRefund,
    });
  }

  async function doCoSignRefund() {
    const req = refundReqQuery.data?.request;
    if (!publicKey || !signTransaction || !req) return;
    // Legacy request: created before refunds moved to durable nonces, so it
    // carries an expired recent blockhash and can NEVER be co-signed. Clear it
    // and tell the initiator to start again rather than failing cryptically.
    if (!MOCK_CHAIN && !req.nonce_account) {
      await apiFetchSafe(`/api/deals/${dealId}/refund`, { method: "DELETE", wallet: wallet ?? "" }, undefined);
      await refundReqQuery.mutate?.();
      toast.show({
        variant: "error",
        title: "This refund request has expired",
        description: "It was created before the expiry fix. Ask the other party to request the refund again.",
      });
      return;
    }
    setRefunding(true);
    try {
      const sig = await coSignAndSend(connection, req.partial_tx, signTransaction);
      if (MOCK_CHAIN && deal?.buyer_wallet) {
        // Mock ledger is a demo aid, not the source of truth — don't fail the
        // refund if this deal was never funded through it.
        try { mockEscrow.refund(dealId, deal.buyer_wallet); } catch { /* mock-only */ }
      }
      // Reclaim the escrow vault rent (buyer-only, valid once refunded).
      if (role === "buyer") {
        try {
          const closeIx = await buildCloseDealIx(publicKey, dealId);
          await sendTx(connection, [closeIx], signTransaction);
        } catch (e) {
          console.warn("close_deal (rent reclaim) skipped:", e);
        }
      }
      await patchStatus("refunded");
      await apiFetchSafe(`/api/deals/${dealId}/refund?completed=1`, { method: "DELETE", wallet: wallet ?? "" }, undefined);
      await postMessage(
        `↩️ Mutual refund completed. Unreleased escrow returned to the buyer.\n\nTx: \`${sig.slice(0, 8)}...${sig.slice(-8)}\``,
        "assistant"
      );
      await refreshAll();
    } catch (err) {
      console.error("Co-sign refund failed:", err);
      // Show the REAL reason — coSignAndSend already maps Solana's program logs
      // to a specific message (consumed nonce / missing signature / insufficient
      // funds / the failing log line). Don't overwrite it with a guess.
      toast.show({
        variant: "error",
        title: err instanceof Error ? err.message : "Could not complete the refund.",
      });
    } finally {
      setRefunding(false);
    }
  }

  async function handleCancelRefundRequest() {
    if (!wallet) return;
    await apiFetchSafe(`/api/deals/${dealId}/refund`, { method: "DELETE", wallet }, undefined);
    await refreshAll();
  }

  // Report a problem — files a complaint the platform reviews (mediate-only; it
  // does not move funds). Stored via /api/complaints, surfaced in the admin tool.
  async function handleSubmitReport() {
    if (!wallet || !reportMessage.trim()) return;
    setReportSubmitting(true);
    try {
      await apiFetch("/api/complaints", {
        method: "POST",
        wallet,
        body: { deal_id: dealId, category: reportCategory, message: reportMessage.trim() },
      });
      setReportDone(true);
      setReportMessage("");
    } catch (err) {
      toast.show({ variant: "error", title: err instanceof ApiError ? err.message : "Could not submit. Please try again." });
    } finally {
      setReportSubmitting(false);
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

  // Share an image in the chat (#3). Uploads via /api/upload in chat-attachment
  // mode (image-only, no deliverable row), then posts a message carrying the
  // storage key so it renders inline. Buyers use this instead of proof upload.
  async function handleChatAttach(file: File) {
    if (!wallet || sendingMsg) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.show({ variant: "error", title: "That image is over 25 MB. Please attach a smaller one." });
      return;
    }
    setSendingMsg(true);
    try {
      const form = new FormData();
      form.append("file", file);
      let key: string | undefined;
      try {
        const res = await apiFetch<{ storage_key: string }>("/api/upload", {
          method: "POST",
          rawBody: form,
          headers: { "x-wallet": wallet, "x-deal-id": dealId, "x-chat-attachment": "1" },
        });
        key = res.storage_key;
      } catch (e) {
        toast.show({ variant: "error", title: e instanceof ApiError ? e.message : "Image upload failed" });
        return;
      }
      if (key) {
        await apiFetchSafe("/api/messages", {
          method: "POST",
          wallet,
          body: {
            deal_id: dealId,
            role: "user",
            content: `📎 ${file.name}`,
            wallet,
            metadata: { attachment: key, kind: "image" },
          },
        }, undefined);
        await refreshAll();
      }
    } finally {
      setSendingMsg(false);
    }
  }

  const isComplete = milestones.length > 0 && milestones.every((m) => m.status === "Released");
  const currentInReview = currentMilestoneIndex >= 0 && milestones[currentMilestoneIndex]?.status === "In Review";
  const totalValue = milestones.reduce((s, m) => s + m.amount, 0);
  const releasedValue = milestones.filter((m) => m.status === "Released").reduce((s, m) => s + m.amount, 0);

  // Refund/dispute gating. Terminal deals (finished or already refunded) show no
  // refund actions. "Funded" = escrow holds money (funded/in_progress or any
  // milestone released); "unfunded" draft deals can be cancelled instead.
  const dealStatus = (deal?.status ?? "").toLowerCase();
  const isTerminal = isComplete || dealStatus === "completed" || dealStatus === "refunded";
  const isFunded = ["funded", "in_progress"].includes(dealStatus) || releasedCount > 0;
  const isUnfunded = !isFunded && ["draft", "seller-ready", "seller-agreed", "manual-chat", "escalated", "proposed"].includes(dealStatus);

  // If this deal is (or goes back to) a pre-escrow negotiation status — e.g. a
  // funded deal re-opened via renegotiate/escalate — the deal page's milestone
  // view is the wrong place for it; send the user to the negotiation room so a
  // device sitting here doesn't get stuck while the other advances (S3). Guard
  // on a loaded deal + a non-funded negotiation status so a genuinely funded
  // deal is never bounced.
  useEffect(() => {
    if (!deal) return;
    const NEGOTIATION_STATUSES = ["draft", "seller-ready", "seller-agreed", "manual-chat", "proposed", "escalated"];
    if (releasedCount === 0 && NEGOTIATION_STATUSES.includes(dealStatus)) {
      router.replace(`/negotiate/${encodeURIComponent(dealId)}`);
    }
  }, [deal, dealStatus, releasedCount, dealId, router]);

  useEffect(() => {
    if (isComplete && !sealedModalShown) {
      setSealedModalShown(true);
      setShowSealedModal(true);
    }
  }, [isComplete, sealedModalShown]);

  useEffect(() => {
    if (!isComplete || !wallet || role === "observer") {
      setRatingLookup(null);
      return;
    }

    let cancelled = false;
    setRatingLoading(true);
    setRatingError(null);

    apiFetch<RatingLookup>(`/api/ratings?deal_id=${encodeURIComponent(dealId)}`, { wallet })
      .then((data) => {
        if (cancelled) return;
        setRatingLookup(data);
        setRatingStars(data.rating?.stars ?? 0);
        setRatingText(data.rating?.review_text ?? "");
      })
      .catch((error) => {
        if (!cancelled) setRatingError(error instanceof ApiError ? error.message : "Failed to load review status");
      })
      .finally(() => {
        if (!cancelled) setRatingLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dealId, isComplete, role, wallet]);

  async function handleSubmitRating(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!wallet || !ratingLookup?.ratee_wallet || ratingSubmitting) return;
    if (ratingStars < 1 || ratingStars > 5) {
      setRatingError("Choose a rating from 1 to 5 stars.");
      return;
    }

    setRatingSubmitting(true);
    setRatingError(null);

    try {
      const data = await apiFetch<{ id?: string }>("/api/ratings", {
        method: "POST",
        wallet,
        body: {
          deal_id: dealId,
          ratee_wallet: ratingLookup.ratee_wallet,
          stars: ratingStars,
          review_text: ratingText.trim(),
        },
      });

      setRatingLookup({
        ...ratingLookup,
        canRate: false,
        rating: {
          id: data?.id ?? "submitted",
          stars: ratingStars,
          review_text: ratingText.trim(),
          revealed: true,
          submitted_at: new Date().toISOString(),
          ratee_wallet: ratingLookup.ratee_wallet,
        },
      });
    } catch (error) {
      setRatingError(error instanceof Error ? error.message : "Failed to submit review");
    } finally {
      setRatingSubmitting(false);
    }
  }

  if (!wallet) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 24, textAlign: "center", padding: "0 16px" }}>
        <SealedMark size={48} />
        <p style={{ fontSize: 16, color: "var(--primary)", fontWeight: 590 }}>Connect wallet to view deal</p>
        <WalletMultiButton />
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 16, textAlign: "center", padding: "0 16px" }}>
        <p style={{ fontSize: 16, color: "var(--primary)", fontWeight: 590 }}>Deal not found</p>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>{loadError}</p>
        <Link href="/app" className="btn-ghost" style={{ height: 36, padding: "0 20px", borderRadius: 6, fontSize: 13, display: "inline-flex", alignItems: "center" }}>Go home</Link>
      </div>
    );
  }

  if (!deal) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {[0, 150, 300].map((d) => (
            <span key={d} style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--muted)", animation: `sealed-pulse 1.2s ${d}ms infinite ease-in-out` }} />
          ))}
        </div>
      </div>
    );
  }

  const shortSeller = deal.seller_wallet ? `${deal.seller_wallet.slice(0, 4)}…${deal.seller_wallet.slice(-4)}` : "—";
  // View-on-chain must point at the on-chain Deal PDA, not the human-readable
  // deal_id slug (bug #5) — the slug isn't a valid base58 address, so the old
  // link produced "Address ... is not valid" on the explorer.
  // Escrow account (Deal PDA) link + deploy-tx link (N3/N8). The deploy tx was
  // persisted in the deal-creation message metadata; pull it back to link it.
  const explorerUrl = escrowAccountUrl(deal.deal_id);
  const deployTxUrl = (() => {
    const createMsg = messages.find(
      (m) => (m.metadata as { tx_signature?: string } | null)?.tx_signature
    );
    const sig = (createMsg?.metadata as { tx_signature?: string } | null)?.tx_signature;
    return txUrl(sig);
  })();

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", position: "relative" }}>
      <SealedBackdrop />

      {showSealedModal && <ProjectSealedModal onClose={() => setShowSealedModal(false)} />}

      {/* Confirm release modal */}
      {confirmModal !== null && (
        <ConfirmReleaseModal
          milestone={milestones[confirmModal]}
          milestoneIndex={confirmModal}
          sellerWallet={shortSeller}
          loading={approvingIndex === confirmModal}
          onClose={() => setConfirmModal(null)}
          onConfirm={() => handleApprove(confirmModal)}
        />
      )}

      {/* App-style header */}
      <header style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 22px",
        height: 52,
        borderBottom: "1px solid var(--card-border-subtle)",
        background: "var(--panel)",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link href="/app" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--primary)", textDecoration: "none" }}>
            <SealedMark size={22} />
            <span style={{ fontSize: 13, fontWeight: 510 }}>Sealed Agent</span>
          </Link>
          <span style={{ color: "var(--muted)", fontSize: 12 }}>›</span>
          <span style={{ fontSize: 12, color: "var(--foreground)", fontFamily: "ui-monospace, monospace" }}>
            {deal.deal_id.slice(0, 20)}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {deployTxUrl && (
            <a
              href={deployTxUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost"
              style={{ height: 30, padding: "0 12px", borderRadius: 6, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}
              title="Escrow deployment transaction"
            >
              <ExternalLinkIcon />
              Deploy tx
            </a>
          )}
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost"
              style={{ height: 30, padding: "0 12px", borderRadius: 6, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}
              title="Escrow account on Solana Explorer"
            >
              <ExternalLinkIcon />
              Escrow account
            </a>
          )}
        </div>
      </header>

      <div style={{ maxWidth: 1250, margin: "0 auto", padding: "26px 24px", position: "relative", zIndex: 1 }}>
        {/* Header */}
        <div style={{ marginBottom: 18 }}>
          <p style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)", margin: 0, fontWeight: 510 }}>Deal</p>
          <h1 style={{ fontSize: 24, fontWeight: 590, letterSpacing: "-0.022em", color: "var(--primary)", margin: "6px 0 0" }}>
            {deal.title}
          </h1>
          <p style={{ fontSize: 12, color: "var(--subtle)", margin: "6px 0 0", fontFamily: "ui-monospace, monospace" }}>
            {deal.deal_id}
          </p>
        </div>

        {/* Stat strip */}
        <div className="surface-card grid grid-cols-2 gap-y-4 gap-x-0 sm:grid-cols-4" style={{ borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <StatBlock first label="Total value" value={`$${totalValue.toLocaleString()}`} sub="USDC" />
          <StatBlock label="Released" value={`$${releasedValue.toLocaleString()}`} sub={`${releasedCount} of ${milestones.length} milestones`} accent="success" />
          <StatBlock label="Counterparty" value={counterpartyName} sub={`You as ${role}`} />
          <StatBlock last label="Status" value={isComplete ? "Completed" : "In progress"} sub="Buyer confirms releases" accent={isComplete ? "success" : "warning"} />
        </div>

        {/* Two-column main. minmax(0, …) tracks (not bare fr) so a long unbroken
            string in a column — e.g. the on-chain tx signature in the chat —
            can't force the column past its share and overflow the container,
            which made this row wider than the stat strip above it. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          {/* Milestones */}
          <div className="surface-card" style={{ minWidth: 0, borderRadius: 12, padding: 18 }}>
            <p style={{ fontSize: 13, color: "var(--primary)", fontWeight: 590, margin: 0 }}>Milestones</p>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "2px 0 14px" }}>Each release requires your confirmation.</p>
            {/* Timeline. The connector is drawn per-row as two half-segments off
                each dot's center — an "up" half (skipped on the first dot) and a
                "down" half (skipped on the last) — so the line runs only BETWEEN
                dots, with nothing above the first or below the last. Dots stay
                centered on their box regardless of height (N6). */}
            <div style={{ position: "relative", paddingLeft: 24 }}>
              {milestones.map((m, i) => {
                const isReleased = m.status === "Released";
                const isInReview = m.status === "In Review";
                const isPending = !m.status || m.status === "Pending";
                const isActive = isInReview || (isPending && i === currentMilestoneIndex);
                const proofs = deliverables.filter((d) => d.milestone_index === i);
                const isFirst = i === 0;
                const isLast = i === milestones.length - 1;

                return (
                  <div key={i} style={{ position: "relative", paddingBottom: 12 }}>
                    {/* Marker column spans exactly the box's height (the wrapper
                        minus its 12px bottom gap) and flex-centers the dot, so the
                        dot stays vertically centered on the box no matter how tall
                        it grows (N6). */}
                    <div style={{
                      position: "absolute",
                      left: -18,
                      top: 0,
                      bottom: 12,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}>
                      {/* "up" half: box top → dot center (skip on first dot) */}
                      {!isFirst && (
                        <span style={{ position: "absolute", left: 5, top: 0, height: "50%", width: 1, background: "var(--card-border)" }} />
                      )}
                      {/* "down" half: dot center → next dot (through the 12px gap).
                          Skip on the last dot so nothing dangles below it. */}
                      {!isLast && (
                        <span style={{ position: "absolute", left: 5, top: "50%", bottom: -12, width: 1, background: "var(--card-border)" }} />
                      )}
                      <span style={{
                        position: "relative",
                        width: 11,
                        height: 11,
                        borderRadius: "50%",
                        background: isReleased ? "var(--success)" : isInReview ? "var(--warning)" : "var(--muted)",
                        border: "2px solid var(--background)",
                        boxShadow: isActive ? "0 0 0 4px rgba(251,191,36,0.18)" : "none",
                      }} />
                    </div>
                    <div style={{
                      padding: "12px 14px",
                      borderRadius: 10,
                      background: isActive ? "rgba(251,191,36,0.05)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${isActive ? "rgba(251,191,36,0.25)" : "var(--card-border-subtle)"}`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <span style={{ fontSize: 11, color: "var(--subtle)", fontWeight: 510, flexShrink: 0 }}>M{i + 1}</span>
                          <span style={{ fontSize: 13, color: "var(--primary)", fontWeight: 510, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.description}</span>
                          {isReleased && <MiniPill tone="success">Released</MiniPill>}
                          {isInReview && <MiniPill tone="warning">Awaiting confirm</MiniPill>}
                          {isPending && i !== currentMilestoneIndex && <MiniPill tone="muted">Pending</MiniPill>}
                          {m.proof_by && <MiniPill tone="muted">proof: {m.proof_by}</MiniPill>}
                        </div>
                        <span style={{ fontSize: 13, color: "var(--primary)", fontWeight: 510, fontVariantNumeric: "tabular-nums", fontFamily: "ui-monospace, monospace", flexShrink: 0 }}>
                          ${m.amount.toLocaleString()}
                        </span>
                      </div>

                      {/* Released milestone → link its on-chain transaction (N3/N8) */}
                      {isReleased && txUrl(m.release_tx) && (
                        <a
                          href={txUrl(m.release_tx)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ marginTop: 8, fontSize: 11, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 5, textDecoration: "none" }}
                          title="Release transaction on Solana Explorer"
                        >
                          <ExternalLinkIcon />
                          View release transaction
                        </a>
                      )}

                      {/* Proof files */}
                      {(isInReview || isReleased) && proofs.length > 0 && (
                        <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "rgba(0,0,0,0.2)", border: "1px solid var(--card-border-subtle)" }}>
                          <p style={{ fontSize: 11, color: "var(--muted)", fontWeight: 510, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                            Delivery proof
                          </p>
                          {proofs.map((proof) => {
                            // Link/text proofs (no stored file) render inline
                            // rather than routing through the signed-file opener.
                            if (proof.content_type === "text/uri-list") {
                              return (
                                <a
                                  key={proof.id}
                                  href={proof.storage_key}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: "flex", alignItems: "center", gap: 10, width: "100%",
                                    padding: "8px 10px", borderRadius: 7, background: "var(--surface)",
                                    border: "1px solid var(--card-border)", textDecoration: "none",
                                  }}
                                >
                                  <div style={{ width: 28, height: 28, borderRadius: 6, background: "rgba(113,112,255,0.1)", color: "var(--accent)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                    </svg>
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 12, color: "var(--accent)", margin: 0, fontWeight: 510, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{proof.filename}</p>
                                    <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>Link</p>
                                  </div>
                                  <span className="btn-ghost" style={{ height: 24, padding: "0 8px", borderRadius: 4, fontSize: 11, display: "inline-flex", alignItems: "center" }}>Open</span>
                                </a>
                              );
                            }
                            if (proof.content_type === "text/plain") {
                              return (
                                <div
                                  key={proof.id}
                                  style={{
                                    padding: "8px 10px", borderRadius: 7, background: "var(--surface)",
                                    border: "1px solid var(--card-border)",
                                  }}
                                >
                                  <p style={{ fontSize: 11, color: "var(--muted)", margin: "0 0 4px", fontWeight: 510 }}>Text proof</p>
                                  <p style={{ fontSize: 12, color: "var(--primary)", margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{proof.storage_key}</p>
                                </div>
                              );
                            }
                            return (
                              <button
                                key={proof.id}
                                onClick={() => openProof(proof.storage_key)}
                                disabled={openingProof === proof.storage_key}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 10,
                                  width: "100%",
                                  padding: "8px 10px",
                                  borderRadius: 7,
                                  background: "var(--surface)",
                                  border: "1px solid var(--card-border)",
                                  cursor: "pointer",
                                  textAlign: "left",
                                }}
                              >
                                <div style={{ width: 28, height: 28, borderRadius: 6, background: "rgba(113,112,255,0.1)", color: "var(--accent)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                                  </svg>
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontSize: 12, color: "var(--primary)", margin: 0, fontWeight: 510, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{proof.filename}</p>
                                  <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>{(proof.size_bytes / 1024).toFixed(1)} KB</p>
                                </div>
                                <span className="btn-ghost" style={{ height: 24, padding: "0 8px", borderRadius: 4, fontSize: 11, display: "inline-flex", alignItems: "center" }}>Open</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Buyer: confirm CTA */}
                      {role === "buyer" && isInReview && (
                        <div className="anim-fade-up" style={{ marginTop: 12, display: "flex", gap: 8 }}>
                          <button
                            className="btn-ghost"
                            onClick={() => { setChangesModal(i); setChangesNote(""); }}
                            disabled={approvingIndex !== null || requestingChanges}
                            style={{ flex: 1, height: 34, borderRadius: 7, fontSize: 12 }}
                          >
                            Request changes
                          </button>
                          <button
                            className="btn-primary"
                            onClick={() => setConfirmModal(i)}
                            disabled={approvingIndex !== null}
                            style={{ flex: 2, height: 34, borderRadius: 7, fontSize: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                          >
                            {approvingIndex === i ? (
                              <>
                                <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M21 12a9 9 0 1 1-6.22-8.56" strokeLinecap="round" />
                                </svg>
                                Releasing…
                              </>
                            ) : (
                              <>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                Confirm & release ${m.amount.toLocaleString()}
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      {/* The party RESPONSIBLE for this milestone's proof uploads
                          it (#11): seller by default, buyer when proof_by==="buyer"
                          (e.g. "buyer confirms receipt"). Release stays buyer-only. */}
                      {role === (m.proof_by === "buyer" ? "buyer" : "seller") && (isPending || isInReview) && i === currentMilestoneIndex && (
                        <div style={{ marginTop: 10 }}>
                          <input
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg,.docx,.pptx,.xlsx,.md"
                            ref={(el) => { fileInputRefs.current[i] = el; }}
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUploadProof(file, i);
                              e.target.value = "";
                            }}
                            style={{ display: "none" }}
                          />
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <button
                              onClick={() => fileInputRefs.current[i]?.click()}
                              disabled={uploading === i}
                              className="btn-ghost"
                              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}
                            >
                              {uploading === i ? (
                                <>
                                  <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.22-8.56" strokeLinecap="round" /></svg>
                                  Uploading…
                                </>
                              ) : (
                                <>
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                                  {isInReview ? "Re-upload proof" : "Upload proof"}
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => { setLinkProofOpen(linkProofOpen === i ? null : i); setLinkProofValue(""); }}
                              className="btn-ghost"
                              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                              or paste a link / text
                            </button>
                          </div>
                          {linkProofOpen === i && (
                            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                              <textarea
                                value={linkProofValue}
                                onChange={(e) => setLinkProofValue(e.target.value)}
                                placeholder="Paste a link (https://…) or type your proof"
                                rows={2}
                                style={{
                                  width: "100%", resize: "vertical", padding: "8px 10px", borderRadius: 6,
                                  background: "var(--surface)", border: "1px solid var(--card-border)",
                                  color: "var(--foreground)", fontSize: 12, fontFamily: "inherit",
                                }}
                              />
                              <div style={{ display: "flex", gap: 6 }}>
                                <button
                                  onClick={() => handleSubmitLink(i)}
                                  disabled={submittingLink || !linkProofValue.trim()}
                                  className="btn-primary"
                                  style={{ height: 30, padding: "0 12px", borderRadius: 6, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
                                >
                                  {submittingLink ? "Submitting…" : "Submit proof"}
                                </button>
                                <button
                                  onClick={() => { setLinkProofOpen(null); setLinkProofValue(""); }}
                                  disabled={submittingLink}
                                  className="btn-ghost"
                                  style={{ height: 30, padding: "0 12px", borderRadius: 6, fontSize: 12 }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right rail */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Parties */}
            <div className="surface-card" style={{ borderRadius: 12, padding: 16 }}>
              <p style={{ fontSize: 13, color: "var(--primary)", fontWeight: 590, margin: 0 }}>Parties</p>
              <div style={{ marginTop: 12 }}>
                <PartyRow
                  label="Buyer"
                  wallet={deal.buyer_wallet ?? ""}
                  isYou={wallet === deal.buyer_wallet}
                />
                <div style={{ height: 10 }} />
                <PartyRow
                  label="Seller"
                  wallet={deal.seller_wallet ?? ""}
                  isYou={wallet === deal.seller_wallet}
                />
              </div>
            </div>

            {isComplete && role !== "observer" && (
              <CounterpartyReviewCard
                loading={ratingLoading}
                lookup={ratingLookup}
                stars={ratingStars}
                reviewText={ratingText}
                error={ratingError}
                submitting={ratingSubmitting}
                onStarsChange={(stars) => {
                  setRatingStars(stars);
                  if (ratingError) setRatingError(null);
                }}
                onReviewTextChange={setRatingText}
                onSubmit={handleSubmitRating}
              />
            )}

            {/* Activity / chat */}
            <div
              className="surface-card flex flex-col overflow-hidden rounded-xl h-[65vh] min-h-70 lg:h-[calc(100vh-480px)]"
            >
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--card-border-subtle)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, background: "rgba(113,112,255,0.1)", color: "var(--accent)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <SealedMark size={12} />
                </div>
                <p style={{ fontSize: 13, color: "var(--primary)", margin: 0, fontWeight: 510 }}>Sealed Agent</p>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--success)", marginLeft: "auto" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--success)" }} />
                  Online
                </span>
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                {messages.length === 0 && (
                  <div style={{ textAlign: "center", paddingTop: 24 }}>
                    <p style={{ fontSize: 12, color: "var(--muted)" }}>
                      {role === "observer"
                        ? "No activity yet."
                        : role === "seller"
                        ? "Upload proof for the current milestone to get started."
                        : "Send a message or share a file with the seller to get started."}
                    </p>
                  </div>
                )}
                {messages.map((m) => {
                  const isAgent = m.role === "assistant";
                  const isSystem = m.role === "system";
                  if (isSystem) return (
                    <div key={m.id} style={{ textAlign: "center" }}>
                      {/* Break long unbroken strings (e.g. a full tx signature)
                          so a system line can't stretch the chat column and push
                          the two-column row past the container width. */}
                      <span style={{ fontSize: 11, color: "var(--subtle)", padding: "0 8px", overflowWrap: "anywhere", wordBreak: "break-word" }}>{m.content}</span>
                    </div>
                  );
                  // Align by sender: my own messages on the right, the agent and
                  // the counterparty on the left. Fall back to left for messages
                  // with no wallet (agent/legacy) so only mine sit on the right.
                  const isMine = !isAgent && !!wallet && m.wallet === wallet;
                  const showCounterpartyName = !isAgent && !isMine;
                  return (
                    <div key={m.id} style={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start" }}>
                      <div style={{
                        maxWidth: "88%",
                        borderRadius: 11,
                        padding: "9px 13px",
                        fontSize: 12,
                        lineHeight: 1.55,
                        background: isMine ? "var(--brand)" : "rgba(255,255,255,0.025)",
                        border: isMine ? "none" : "1px solid var(--card-border)",
                        color: isMine ? "#ffffff" : "var(--foreground)",
                      }}>
                        {isAgent && (
                          <p style={{ fontSize: 10, color: "var(--accent)", margin: "0 0 4px" }}>Sealed Agent</p>
                        )}
                        {showCounterpartyName && (
                          <CounterpartyMsgName wallet={m.wallet} />
                        )}
                        {m.metadata?.attachment ? (
                          <ChatImageAttachment storageKey={m.metadata.attachment} name={m.content} />
                        ) : (
                          <div style={{ whiteSpace: "pre-wrap" }}>{renderMarkdown(m.content)}</div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Buyer: proof review inline */}
                {role === "buyer" && currentInReview && (() => {
                  const proofs = deliverables.filter((d) => d.milestone_index === currentMilestoneIndex);
                  return proofs.length > 0 ? (
                    <div style={{ padding: 10, borderRadius: 10, background: "rgba(113,112,255,0.04)", border: "1px solid rgba(113,112,255,0.18)", fontSize: 11, color: "var(--muted)" }}>
                      <p style={{ fontSize: 10, color: "var(--accent)", margin: "0 0 6px", fontWeight: 510, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Review Milestone {currentMilestoneIndex + 1}
                      </p>
                      {proofs.map((p) => {
                        // Link/text proofs store the URL/text in storage_key (not a
                        // storage path), so they must NOT go through openProof (which
                        // builds a signed Storage URL and would fail). Render inline.
                        if (p.content_type === "text/uri-list") {
                          return (
                            <a key={p.id} href={p.storage_key} target="_blank" rel="noopener noreferrer"
                              style={{ display: "block", fontSize: 11, color: "var(--accent)", overflowWrap: "anywhere" }}>
                              🔗 {p.filename}
                            </a>
                          );
                        }
                        if (p.content_type === "text/plain") {
                          return (
                            <p key={p.id} style={{ fontSize: 11, color: "var(--primary)", margin: "2px 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                              📝 {p.storage_key}
                            </p>
                          );
                        }
                        return (
                          <button key={p.id} onClick={() => openProof(p.storage_key)} disabled={openingProof === p.storage_key}
                            style={{ display: "block", fontSize: 11, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                            📎 {p.filename}
                          </button>
                        );
                      })}
                    </div>
                  ) : null;
                })()}

                <div ref={messagesEndRef} />
              </div>

              {wallet && (
                <div style={{ borderTop: "1px solid var(--card-border-subtle)", padding: "10px 12px", flexShrink: 0 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg"
                      ref={chatFileRef}
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleChatAttach(file);
                        e.target.value = "";
                      }}
                    />
                    <button
                      onClick={() => chatFileRef.current?.click()}
                      disabled={sendingMsg}
                      className="btn-ghost"
                      title="Share an image"
                      style={{ height: 34, width: 34, borderRadius: 6, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                      </svg>
                    </button>
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                      placeholder="Type a message…"
                      disabled={sendingMsg}
                      style={{
                        flex: 1,
                        height: 34,
                        borderRadius: 6,
                        background: "var(--surface)",
                        border: "1px solid var(--card-border)",
                        padding: "0 12px",
                        fontSize: 12,
                        color: "var(--primary)",
                        outline: "none",
                      }}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!chatInput.trim() || sendingMsg}
                      className="btn-primary"
                      style={{ height: 34, width: 34, borderRadius: 6, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Escrow info */}
            <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(113,112,255,0.04)", border: "1px solid rgba(113,112,255,0.18)", display: "flex", gap: 10 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <p style={{ fontSize: 11, color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>
                Funds stay in escrow until the buyer releases each milestone.
              </p>
            </div>

            {/* Refund / dispute — shown to the two parties on non-terminal deals */}
            {role !== "observer" && !isTerminal && (
              <div className="surface-card" style={{ borderRadius: 12, padding: 16 }}>
                <p style={{ fontSize: 13, color: "var(--primary)", fontWeight: 590, margin: "0 0 4px" }}>Refund &amp; disputes</p>
                <p style={{ fontSize: 11, color: "var(--muted)", margin: "0 0 12px", lineHeight: 1.5 }}>
                  A refund returns unreleased escrow to the buyer. A mutual refund needs both signatures; the buyer can reclaim funds alone after an inactivity timeout.
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* Buyer + unfunded → cancel */}
                  {role === "buyer" && isUnfunded && (
                    <button
                      className="btn-ghost"
                      disabled={refunding}
                      onClick={handleCancelDeal}
                      style={{ height: 34, borderRadius: 7, fontSize: 12 }}
                    >
                      {refunding ? "Cancelling…" : "Cancel deal (not funded)"}
                    </button>
                  )}

                  {/* Buyer + funded → timeout refund (ghost-seller escape hatch) */}
                  {role === "buyer" && isFunded && (
                    <button
                      className="btn-ghost"
                      disabled={refunding}
                      onClick={handleTimeoutRefund}
                      style={{ height: 34, borderRadius: 7, fontSize: 12 }}
                      title="Reclaim your funds if the seller has gone inactive past the timeout window"
                    >
                      {refunding ? "Processing…" : "Reclaim funds (inactivity timeout)"}
                    </button>
                  )}

                  {/* Mutual refund (both sign, via relay). Only meaningful once
                      escrow holds funds. */}
                  {isFunded && (() => {
                    const req = refundReqQuery.data?.request ?? null;
                    if (!req) {
                      return (
                        <button
                          className="btn-ghost"
                          disabled={refunding}
                          onClick={handleRequestRefund}
                          style={{ height: 34, borderRadius: 7, fontSize: 12 }}
                        >
                          {refunding ? "Requesting…" : "Ask for a refund (both sign)"}
                        </button>
                      );
                    }
                    const iInitiated = req.requested_by === wallet;
                    return (
                      <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.25)" }}>
                        <p style={{ fontSize: 11, color: "var(--muted)", margin: "0 0 8px", lineHeight: 1.5 }}>
                          {iInitiated
                            ? "Refund requested — waiting for the other party to approve & sign."
                            : "The other party requested a mutual refund. Approve to return unreleased escrow to the buyer."}
                        </p>
                        {iInitiated ? (
                          <button className="btn-ghost" disabled={refunding} onClick={handleCancelRefundRequest} style={{ height: 32, borderRadius: 6, fontSize: 12, width: "100%" }}>
                            Cancel request
                          </button>
                        ) : (
                          <button className="btn-primary" disabled={refunding} onClick={handleCoSignRefund} style={{ height: 34, borderRadius: 7, fontSize: 12, width: "100%" }}>
                            {refunding ? "Submitting…" : "Approve & sign refund"}
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  {/* Dev-only: fast-forward the funding timestamp so the timeout is
                      testable without waiting 30 days. Mock mode only. */}
                  {MOCK_CHAIN && role === "buyer" && isFunded && (
                    <button
                      className="btn-ghost"
                      onClick={() => { mockEscrow.timeWarp(dealId); toast.show({ variant: "info", title: "Dev: funding backdated past the timeout. You can now reclaim funds." }); }}
                      style={{ height: 28, borderRadius: 6, fontSize: 11, opacity: 0.7 }}
                    >
                      ⏩ Dev: skip timeout
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Report a problem — available to either party, any deal state. */}
            {role !== "observer" && (
              <button
                className="btn-ghost"
                onClick={() => { setReportOpen(true); setReportDone(false); }}
                style={{ height: 32, borderRadius: 7, fontSize: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--muted)" }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Report a problem
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Blocking confirmations (formerly window.confirm): timeout reclaim,
          cancel deal, request mutual refund, co-sign mutual refund. */}
      <ConfirmDialog
        open={pendingConfirm !== null}
        title={pendingConfirm?.title ?? ""}
        body={pendingConfirm?.body}
        confirmLabel={pendingConfirm?.confirmLabel}
        danger={pendingConfirm?.danger}
        busy={refunding}
        busyLabel="Working…"
        onCancel={() => setPendingConfirm(null)}
        onConfirm={() => {
          const action = pendingConfirm?.run;
          setPendingConfirm(null);
          void action?.();
        }}
      />

      {/* Request-changes modal (buyer, In Review) */}
      {changesModal !== null && (
        <div onClick={() => setChangesModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} className="modal-card" style={{ width: "100%", maxWidth: 420, borderRadius: 14, padding: 22 }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--primary)", margin: "0 0 4px" }}>Request changes</p>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 16px", lineHeight: 1.5 }}>
              Send Milestone {changesModal + 1} back to the seller to revise. It returns to <strong>Pending</strong> so they can re-submit proof. No funds move.
            </p>
            <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 6 }}>What needs changing? (optional)</label>
            <textarea
              value={changesNote}
              onChange={(e) => setChangesNote(e.target.value)}
              rows={4}
              placeholder="Describe what the seller should fix…"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--card-border)", color: "var(--primary)", fontSize: 13, resize: "vertical", outline: "none", marginBottom: 16, fontFamily: "inherit" }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-ghost" onClick={() => setChangesModal(null)} style={{ height: 36, borderRadius: 8, fontSize: 13, flex: 1 }}>Cancel</button>
              <button className="btn-primary" disabled={requestingChanges} onClick={() => handleRequestChanges(changesModal)} style={{ height: 36, borderRadius: 8, fontSize: 13, flex: 2 }}>
                {requestingChanges ? "Sending…" : "Send back for changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report-a-problem modal */}
      {reportOpen && (
        <div onClick={() => setReportOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} className="modal-card" style={{ width: "100%", maxWidth: 440, borderRadius: 14, padding: 22 }}>
            {reportDone ? (
              <>
                <p style={{ fontSize: 15, fontWeight: 600, color: "var(--primary)", margin: "0 0 6px" }}>Report received</p>
                <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 18px", lineHeight: 1.5 }}>
                  Thanks — our team will review this and reach out if needed. (We help mediate; we don&apos;t move your escrowed funds.)
                </p>
                <button className="btn-primary" onClick={() => setReportOpen(false)} style={{ height: 36, borderRadius: 8, fontSize: 13, width: "100%" }}>Close</button>
              </>
            ) : (
              <>
                <p style={{ fontSize: 15, fontWeight: 600, color: "var(--primary)", margin: "0 0 4px" }}>Report a problem</p>
                <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 16px", lineHeight: 1.5 }}>
                  Tell us what&apos;s wrong with this deal. Our team reviews reports and helps mediate — we can&apos;t move escrowed funds, but we can step in.
                </p>
                <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 6 }}>Category</label>
                <select value={reportCategory} onChange={(e) => setReportCategory(e.target.value)} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--card-border)", color: "var(--primary)", fontSize: 13, marginBottom: 12 }}>
                  <option value="non_delivery">Work / goods not delivered</option>
                  <option value="quality">Quality issue</option>
                  <option value="communication">Communication / unresponsive</option>
                  <option value="payment">Payment issue</option>
                  <option value="other">Other</option>
                </select>
                <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 6 }}>What happened?</label>
                <textarea
                  value={reportMessage}
                  onChange={(e) => setReportMessage(e.target.value)}
                  rows={4}
                  placeholder="Describe the problem…"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--card-border)", color: "var(--primary)", fontSize: 13, resize: "vertical", outline: "none", marginBottom: 16, fontFamily: "inherit" }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn-ghost" onClick={() => setReportOpen(false)} style={{ height: 36, borderRadius: 8, fontSize: 13, flex: 1 }}>Cancel</button>
                  <button className="btn-primary" disabled={!reportMessage.trim() || reportSubmitting} onClick={handleSubmitReport} style={{ height: 36, borderRadius: 8, fontSize: 13, flex: 2 }}>
                    {reportSubmitting ? "Submitting…" : "Submit report"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function ExternalLinkIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function StatBlock({ label, value, sub, accent, first, last }: { label: string; value: string; sub: string; accent?: "success" | "warning"; first?: boolean; last?: boolean }) {
  const color = accent === "success" ? "var(--success)" : accent === "warning" ? "var(--warning)" : "var(--primary)";
  // On mobile the strip wraps to 2×2, so the single-row divider + asymmetric
  // first/last padding would land mid-grid — use plain per-cell padding there.
  // At ≥sm it's one 4-wide row again: first cell flush-left, last flush-right,
  // a divider only BETWEEN cells (N2). The `sm:` overrides carry that layout.
  return (
    <div
      className={[
        "px-0",
        !last && "sm:border-r sm:border-card-border-subtle",
        first ? "sm:pl-0 sm:pr-4" : last ? "sm:pl-4 sm:pr-0" : "sm:px-4",
      ].filter(Boolean).join(" ")}
    >
      <p style={{ fontSize: 11, color: "var(--muted)", margin: 0, fontWeight: 510, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 590, color, margin: "6px 0 1px", letterSpacing: "-0.015em", fontVariantNumeric: "tabular-nums" }}>{value}</p>
      <p style={{ fontSize: 11, color: "var(--subtle)", margin: 0 }}>{sub}</p>
    </div>
  );
}

// Small sender label above a counterparty chat bubble, so it's clear who wrote
// it now that counterparty messages sit on the left.
function CounterpartyMsgName({ wallet }: { wallet: string | null }) {
  const name = useDisplayName(wallet || null);
  if (!name) return null;
  return <p style={{ fontSize: 10, color: "var(--muted)", margin: "0 0 4px" }}>{name}</p>;
}

function PartyRow({ label, wallet, isYou }: { label: string; wallet: string; isYou: boolean }) {
  // Resolve the wallet to a profile name; keep the short wallet as a secondary
  // line so the address is still available (bug #4).
  const name = useDisplayName(wallet || null);
  const short = wallet ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : "—";
  const initials = wallet ? wallet.slice(0, 2).toUpperCase() : "?";
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <div style={{
        width: 30,
        height: 30,
        borderRadius: "50%",
        background: isYou ? "linear-gradient(135deg, rgba(113,112,255,0.3), rgba(94,106,210,0.15))" : "var(--surface)",
        color: isYou ? "var(--accent)" : "var(--muted)",
        fontWeight: 590,
        fontSize: 11,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1px solid var(--card-border)",
      }}>
        {initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, color: "var(--primary)", fontWeight: 510, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
          {isYou && (
            <span style={{ background: "transparent", border: "1px solid rgba(113,112,255,0.3)", borderRadius: 9999, padding: "1px 8px", fontSize: 10, color: "var(--accent)", fontWeight: 510 }}>You</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "ui-monospace, monospace" }}>{short} · {label}</div>
      </div>
    </div>
  );
}

function CounterpartyReviewCard({
  loading,
  lookup,
  stars,
  reviewText,
  error,
  submitting,
  onStarsChange,
  onReviewTextChange,
  onSubmit,
}: {
  loading: boolean;
  lookup: RatingLookup | null;
  stars: number;
  reviewText: string;
  error: string | null;
  submitting: boolean;
  onStarsChange: (stars: number) => void;
  onReviewTextChange: (text: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  const submitted = lookup?.rating;

  return (
    <div className="surface-card" style={{ borderRadius: 12, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <p style={{ fontSize: 13, color: "var(--primary)", fontWeight: 590, margin: 0 }}>
          Counterparty review
        </p>
        {submitted && <MiniPill tone="success">Submitted</MiniPill>}
      </div>

      {loading ? (
        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          <div style={{ height: 12, width: "70%", borderRadius: 999, background: "var(--surface)", animation: "sealed-pulse 1.2s infinite ease-in-out" }} />
          <div style={{ height: 40, borderRadius: 8, background: "var(--surface)", animation: "sealed-pulse 1.2s 120ms infinite ease-in-out" }} />
        </div>
      ) : submitted ? (
        <div style={{ marginTop: 12 }}>
          <StarRatingPicker value={submitted.stars} onChange={() => {}} disabled />
          {submitted.review_text && (
            <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--foreground)", lineHeight: 1.5 }}>
              {submitted.review_text}
            </p>
          )}
          <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--muted)" }}>
            This rating is included in their public profile.
          </p>
        </div>
      ) : lookup?.canRate ? (
        <form onSubmit={onSubmit} style={{ marginTop: 12 }} aria-busy={submitting}>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontSize: 12, color: "var(--muted)", fontWeight: 510, marginBottom: 8 }}>
              Rating
            </legend>
            <StarRatingPicker value={stars} onChange={onStarsChange} disabled={submitting} />
          </fieldset>

          <label htmlFor="counterparty-review-text" style={{ display: "block", marginTop: 12 }}>
            <span style={{ display: "block", fontSize: 12, color: "var(--muted)", fontWeight: 510, marginBottom: 6 }}>
              Review note
            </span>
            <textarea
              id="counterparty-review-text"
              value={reviewText}
              onChange={(e) => onReviewTextChange(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Share a short note"
              disabled={submitting}
              aria-invalid={error ? "true" : undefined}
              aria-describedby={error ? "counterparty-review-error" : undefined}
              style={{
                width: "100%",
                resize: "vertical",
                minHeight: 82,
                borderRadius: 8,
                background: "var(--surface)",
                border: "1px solid var(--card-border)",
                color: "var(--primary)",
                padding: "9px 10px",
                fontSize: 12,
                lineHeight: 1.5,
                outline: "none",
              }}
            />
          </label>

          {error && (
            <p id="counterparty-review-error" style={{ margin: "8px 0 0", fontSize: 11, color: "var(--danger)" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary"
            style={{
              marginTop: 12,
              width: "100%",
              minHeight: 40,
              borderRadius: 8,
              fontSize: 12,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {submitting ? "Submitting..." : "Submit review"}
          </button>
        </form>
      ) : (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 8, border: "1px solid var(--card-border)", color: "var(--muted)", fontSize: 12 }}>
          {error ?? "Review opens when this deal is completed."}
        </div>
      )}
    </div>
  );
}

function StarRatingPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= value;
        return (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            disabled={disabled}
            aria-label={`${star} star${star === 1 ? "" : "s"}`}
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              border: `1px solid ${filled ? "rgba(245,158,11,0.4)" : "var(--card-border)"}`,
              background: filled ? "rgba(245,158,11,0.08)" : "var(--surface)",
              color: filled ? "var(--warning)" : "var(--muted)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: disabled ? "default" : "pointer",
              opacity: disabled && !filled ? 0.65 : 1,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

function MiniPill({ tone, children }: { tone: string; children: React.ReactNode }) {
  const tones: Record<string, { c: string; bd: string }> = {
    success: { c: "var(--success)", bd: "rgba(16,185,129,0.3)" },
    warning: { c: "var(--warning)", bd: "rgba(251,191,36,0.3)" },
    muted:   { c: "var(--muted)",   bd: "rgba(255,255,255,0.08)" },
  };
  const t = tones[tone] ?? tones.muted;
  return (
    <span style={{ fontSize: 10, color: t.c, border: `1px solid ${t.bd}`, borderRadius: 9999, padding: "1px 6px", fontWeight: 510, flexShrink: 0, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function ConfirmReleaseModal({
  milestone,
  milestoneIndex,
  sellerWallet,
  loading,
  onClose,
  onConfirm,
}: {
  milestone: Milestone;
  milestoneIndex: number;
  sellerWallet: string;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "sealed-fade-up 0.2s ease-out both",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="surface-card"
        style={{
          background: "var(--panel)",
          borderRadius: 14,
          padding: 22,
          maxWidth: 400,
          width: "100%",
          boxShadow: "0 24px 48px -12px rgba(0,0,0,0.55)",
        }}
      >
        <p style={{ fontSize: 16, fontWeight: 590, color: "var(--primary)", margin: 0 }}>
          Confirm milestone delivery?
        </p>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "8px 0 16px" }}>
          You&apos;ll sign one transaction. The escrow will release{" "}
          <span style={{ color: "var(--primary)", fontWeight: 510, fontVariantNumeric: "tabular-nums" }}>
            ${milestone.amount.toLocaleString()} USDC
          </span>{" "}
          to seller. This cannot be reversed without their signature.
        </p>
        <div style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.07)", border: "1px solid var(--card-border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: "var(--muted)" }}>Milestone</span>
            <span style={{ color: "var(--foreground)" }}>M{milestoneIndex + 1}: {milestone.description}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: "var(--muted)" }}>Recipient</span>
            <span style={{ color: "var(--foreground)", fontFamily: "ui-monospace, monospace" }}>{sellerWallet}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: "var(--muted)" }}>Network</span>
            <span style={{ color: "var(--foreground)" }}>Solana · ~0.000005 SOL fee</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button onClick={onClose} className="btn-ghost" style={{ flex: 1, height: 38, borderRadius: 7, fontSize: 13 }}>Cancel</button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="btn-primary"
            style={{ flex: 2, height: 38, borderRadius: 7, fontSize: 13, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            {loading ? (
              <>
                <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.22-8.56" strokeLinecap="round" />
                </svg>
                Releasing…
              </>
            ) : "Sign & release"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectSealedModal({ onClose }: { onClose: () => void }) {
  return (
    <>
      <style>{`
        @keyframes circle-draw { from { stroke-dashoffset: 283; } to { stroke-dashoffset: 0; } }
        @keyframes check-draw { from { stroke-dashoffset: 100; opacity: 0; } to { stroke-dashoffset: 0; opacity: 1; } }
        @keyframes modal-in { from { opacity: 0; transform: scale(0.88); } to { opacity: 1; transform: scale(1); } }
        @keyframes overlay-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes badge-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); } 50% { box-shadow: 0 0 0 16px rgba(34,197,94,0); } }
      `}</style>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center px-4"
        style={{ background: "rgba(0,0,0,0.72)", animation: "overlay-in 0.25s ease both" }}
        onClick={onClose}
      >
        <div
          className="relative bg-[#0D1117] border border-[rgba(255,255,255,0.08)] rounded-2xl px-10 py-10 flex flex-col items-center gap-5 max-w-sm w-full shadow-2xl"
          style={{ animation: "modal-in 0.35s cubic-bezier(0.34,1.56,0.64,1) both" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ animation: "badge-pulse 2s ease-in-out 0.8s infinite" }} className="rounded-full">
            <svg width="88" height="88" viewBox="0 0 88 88" fill="none">
              <circle cx="44" cy="44" r="40" stroke="#22C55E" strokeWidth="3.5" fill="none" strokeDasharray="251" strokeDashoffset="251" strokeLinecap="round" style={{ animation: "circle-draw 0.55s ease-out 0.1s both" }} />
              <circle cx="44" cy="44" r="36" fill="rgba(34,197,94,0.08)" />
              <polyline points="26,44 38,56 62,30" stroke="#22C55E" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="100" strokeDashoffset="100" style={{ animation: "check-draw 0.4s ease-out 0.65s both" }} />
            </svg>
          </div>
          <div className="text-center space-y-1.5">
            <h2 className="text-[22px] text-white" style={{ fontWeight: 700, letterSpacing: "-0.022em" }}>Project Sealed</h2>
            <p className="text-[14px] text-[#8b949e] leading-relaxed">All milestones completed. Funds have been released to the seller.</p>
          </div>
          <div className="w-full h-px bg-[rgba(255,255,255,0.06)]" />
          <button onClick={onClose} className="w-full h-10 rounded-lg bg-[#22C55E] text-white text-[14px] hover:bg-[#16a34a] transition-colors" style={{ fontWeight: 600 }}>Done</button>
        </div>
      </div>
    </>
  );
}

// Renders a chat image attachment (#3). Fetches a short-lived signed URL for the
// private storage key and shows the image; falls back to the filename if the URL
// isn't available (e.g. offline mock mode).
function ChatImageAttachment({ storageKey, name }: { storageKey: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    apiFetchSafe<{ url?: string }>(`/api/upload/signed?key=${encodeURIComponent(storageKey)}`, {}, {})
      .then((d) => { if (!cancelled) setUrl(d.url ?? null); });
    return () => { cancelled = true; };
  }, [storageKey]);

  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={name}
          style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 8, display: "block" }}
        />
      </a>
    );
  }
  return <div style={{ whiteSpace: "pre-wrap", opacity: 0.9 }}>{name}</div>;
}

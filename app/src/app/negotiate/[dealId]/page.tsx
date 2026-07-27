"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAppWallet as useWallet } from "@/lib/use-app-wallet";
import { useAppConnection as useConnection } from "@/lib/use-app-connection";
import { SealedMark } from "@/components/SealedLogo";
import { NotificationMenu } from "@/components/NotificationMenu";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useBusinessMemory } from "@/memory/localstorage-store";
import { getLlmHeaders } from "@/lib/llm-headers";
import { isAgentConfigError } from "@/lib/agent-config-error";
import { useProfileStore, encodeInvite } from "@/lib/profile-store";
import { fetchShortInviteLink } from "@/lib/invite-link";
import { useDealsStore, clearDealJoinSignals } from "@/lib/deals-store";
import { atDisplayHandle } from "@/lib/user-display";
import {
  DealParams,
  DealStatus,
  MilestoneStatus,
  PublicProfile,
  formatUsdc,
  usdcToLamports,
} from "@/lib/types";
import type { Deal, SupabaseDeal, SupabaseMilestone } from "@/lib/types";
import { labelStyle, headingStyle } from "@/lib/typography";
import type { Proposal, Revision } from "@/negotiation/types";
import { defaultSellerBoundaries } from "@/negotiation/types";
import { buildCreateDealIx, buildFundEscrowIx, buildEnsureAtaIx, getUsdcMint, getUsdcBalance, sendTx, fetchFeeConfig, resolveBuyerFeeBps, sideFeeLamports } from "@/lib/escrow-client";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { MOCK_CHAIN, MOCK_DATA } from "@/lib/env";
import { mockEscrow } from "@/lib/mock-escrow";
import { PublicKey } from "@solana/web3.js";
import { renderMarkdown } from "@/lib/render-markdown";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { apiFetch, apiFetchSafe } from "@/lib/api-client";
import { retryWrite } from "@/lib/retry-write";
import { useApi, POLL_MS } from "@/lib/swr";
import { useDeal } from "@/lib/hooks/use-deal";
import { AgentRole } from "@/agents/types";
import { ArrowLeft } from "lucide-react";

import WalletMultiButton from "@/components/AppWalletButton";
import WalletMenu from "@/components/WalletMenu";

type NegState =
  | { kind: "idle" }
  // `rounds` accumulates each streamed revision so the room shows the
  // back-and-forth live instead of one opaque spinner (T-2).
  | { kind: "running"; rounds: Revision[] }
  | { kind: "done"; proposal: Proposal }
  | { kind: "error"; message: string };

type RenegotiationNotice = {
  content: string;
  wallet: string | null;
  created_at: string | null;
};

type DbMsg = {
  id: string;
  role: string;
  content: string;
  wallet: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

function dealStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Draft",
    "seller-ready": "Counterparty reviewing",
    "seller-agreed": "Ready to fund",
    escalated: "Renegotiation requested",
    proposed: "Ready to sign",
    funded: "Funded",
    in_progress: "In progress",
    completed: "Sealed",
    refunded: "Refunded",
    disputed: "Disputed",
  };
  return labels[status] ?? status;
}

// Statuses where escrow is not yet on-chain, so terms may still change. Mirrors
// PRE_ESCROW_STATUSES in api/deals/[dealId]/route.ts — that server list is
// authoritative; this one only decides whether to show the UI.
const PRE_ESCROW_UI_STATUSES = new Set([
  "draft",
  "seller-ready",
  "seller-agreed",
  "manual-chat",
  "proposed",
  "escalated",
]);

/** The newest terms proposal that hasn't been accepted or rejected yet, or null.
 *  Resolutions are messages too, so "live" means: latest proposal, with no
 *  resolution after it. */
function liveProposalFromMessages(
  messages: DbMsg[]
): { terms: ProposedTerms; proposedBy: string | null } | null {
  let latest: { terms: ProposedTerms; proposedBy: string | null } | null = null;
  for (const m of messages) {
    const type = m.metadata?.type;
    if (type === "terms_proposal") {
      const terms = m.metadata?.terms as ProposedTerms | undefined;
      // Ignore malformed proposals rather than rendering an empty diff.
      if (terms && typeof terms.totalAmount === "number" && Array.isArray(terms.milestones)) {
        latest = {
          terms,
          proposedBy: typeof m.metadata?.proposed_by === "string" ? m.metadata.proposed_by : m.wallet ?? null,
        };
      }
    } else if (type === "terms_resolution") {
      latest = null;
    }
  }
  return latest;
}

function renegotiationNoticeFromMessages(messages: DbMsg[]): RenegotiationNotice | null {
  const requestMessages = messages.filter(
    (message) => message.metadata?.type === "renegotiation_request"
  );
  const latest = requestMessages.at(-1);
  if (!latest) return null;

  const request =
    typeof latest.metadata?.request === "string"
      ? latest.metadata.request.trim()
      : latest.content.trim();

  return {
    content: request || latest.content,
    wallet: latest.wallet ?? null,
    created_at: latest.created_at ?? null,
  };
}

export default function NegotiateRoom() {
  const params = useParams();
  const dealId = (Array.isArray(params.dealId) ? params.dealId[0] : params.dealId) ?? null;
  const router = useRouter();

  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const wallet = publicKey?.toBase58() ?? null;

  const { memory } = useBusinessMemory(publicKey ?? null);
  const { profile } = useProfileStore(wallet);
  const { deals, addDeal, updateDeal } = useDealsStore(publicKey ?? null);

  // Deal state machine (load + 4s poll + focus/reconnect revalidation + Realtime
  // + storage sync + optimistic writes with rollback) lives in useDeal.
  const {
    deal,
    loadError: dealLoadError,
    applyServerPatch,
    patchDeal,
  } = useDeal(dealId);
  // Separate "loading timed out" message, set only by the 10s fallback below.
  const [timeoutError, setTimeoutError] = useState<string | null>(null);
  const loadError = dealLoadError ?? timeoutError;
  const [cpProfile, setCpProfile] = useState<PublicProfile | null>(null);
  const [cpHandle, setCpHandle] = useState<string | null>(null);
  const [negState, setNegState] = useState<NegState>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [dealSealedId, setDealSealedId] = useState<string | null>(null);
  const [renegotiateOpen, setRenegotiateOpen] = useState(false);
  const [renegotiateRequest, setRenegotiateRequest] = useState("");
  const [renegotiateError, setRenegotiateError] = useState<string | null>(null);
  // Reject-and-recycle (#19) confirm modal.
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [renegotiationNotice, setRenegotiationNotice] = useState<RenegotiationNotice | null>(null);
  // Milestone editor (#9): open state + in-flight guard for propose/accept.
  const [editingTerms, setEditingTerms] = useState(false);
  const [termsBusy, setTermsBusy] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);
  // Seller's chosen negotiation mode ("choice" = not decided yet).
  //  - "manual": chat with the buyer's AI agent (it auto-replies)
  //  - "fully-manual": human↔human chat; no auto-reply, but a button can summon
  //     the seller's OWN agent to draft a reply to the counterparty
  //  - "agent-waiting": full auto agent-vs-agent negotiation
  const [sellerView, setSellerView] = useState<"choice" | "manual" | "fully-manual" | "agent-waiting">("choice");

  // Load (Supabase-first → sessionStorage fallback → mirror-retry) now lives in
  // useDeal's fetcher. This effect only preserves the old 10s "loading timed
  // out" guard: if useDeal still has no deal after 10s, surface the message
  // (the fetcher's own sessionStorage fallback covers the recoverable cases).
  useEffect(() => {
    if (!dealId) return;
    setTimeoutError(null);
    const timer = setTimeout(() => {
      if (!deal) setTimeoutError("Loading timed out — please refresh the page.");
    }, 10000);
    return () => clearTimeout(timer);
    // Re-arm whenever the deal arrives (clears any pending timeout) or id changes.
  }, [dealId, deal]);

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
        applyServerPatch((prev) => (prev ? { ...prev, seller_wallet: wallet } : prev));
      }
    } catch {}
  }, [wallet, deal, applyServerPatch]);

  // Supabase cross-device sync is now useDeal's refreshInterval poll (+ focus/
  // reconnect revalidation). This interval only re-checks the same-device
  // localStorage signals the old poll read inline, patching the cached deal.
  // Depends only on dealId so it never restarts mid-cycle.
  useEffect(() => {
    if (!dealId) return;
    const interval = setInterval(() => {
      try {
        const joined = localStorage.getItem(`sealed:seller-joined:${dealId}`);
        if (joined) {
          applyServerPatch((prev) => {
            if (!prev) return prev;
            // Server already filled (this or another) seller — signal done.
            if (prev.seller_wallet) {
              if (prev.seller_wallet !== joined) localStorage.removeItem(`sealed:seller-joined:${dealId}`);
              return prev;
            }
            return { ...prev, seller_wallet: joined };
          });
        }
        // Neutral join signal — fills whichever party slot is still empty (the
        // joiner's). Works whether the inviter was the buyer or the seller.
        const cpJoined = localStorage.getItem(`sealed:counterparty-joined:${dealId}`);
        if (cpJoined) {
          applyServerPatch((prev) => {
            if (!prev) return prev;
            if (!prev.seller_wallet && prev.buyer_wallet !== cpJoined) return { ...prev, seller_wallet: cpJoined };
            if (!prev.buyer_wallet && prev.seller_wallet !== cpJoined) return { ...prev, buyer_wallet: cpJoined };
            // Both slots settled — nothing left for this signal to fill.
            return prev;
          });
        }
        // A status signal is only valid while the server is BEHIND it. Once the
        // server reaches that status OR moves past it (e.g. reject resets to
        // draft, or the deal advances to escalated/funded), the signal is stale
        // and must be cleared — otherwise it replays forever and fights the
        // authoritative status every tick (the room "oscillates"). S1/S4.
        const agreed = localStorage.getItem(`sealed:seller-agreed:${dealId}`);
        if (agreed) {
          applyServerPatch((prev) => {
            if (!prev) return prev;
            if (prev.status === "seller-agreed") return prev; // caught up; leave until it moves past
            // Only re-assert while still pre-agreement (draft with a seller).
            if (prev.status === "draft" && prev.seller_wallet) {
              return { ...prev, status: "seller-agreed" };
            }
            // Server moved past or reset (escalated/funded/…/reject→draft-no-seller): drop it.
            localStorage.removeItem(`sealed:seller-agreed:${dealId}`);
            return prev;
          });
        }
        const escalated = localStorage.getItem(`sealed:deal-escalated:${dealId}`);
        if (escalated) {
          applyServerPatch((prev) => {
            if (!prev) return prev;
            if (prev.status === "escalated") return prev; // caught up
            // Re-assert only from the pre-escalation negotiation states.
            if (prev.status === "draft" || prev.status === "seller-agreed") {
              return { ...prev, status: "escalated" };
            }
            // Advanced past negotiation (funded/in_progress/completed/…): drop it.
            localStorage.removeItem(`sealed:deal-escalated:${dealId}`);
            return prev;
          });
        }
      } catch {}
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [dealId, applyServerPatch]);

  // Supabase Realtime — instant cross-device updates (fallback: 4s poll above)
  useEffect(() => {
    if (!dealId) return;
    if (MOCK_DATA) return; // offline: no Realtime; the poll + storage events cover it

    const channel = supabaseBrowser
      .channel(`deal:${dealId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sealed_deals", filter: `deal_id=eq.${dealId}` },
        (payload) => {
          const updated = payload.new as SupabaseDeal;
          applyServerPatch((prev) => {
            if (!prev) return updated;
            const changed =
              updated.status !== prev.status ||
              (updated.seller_wallet ?? "") !== (prev.seller_wallet ?? "") ||
              // buyer_wallet: a buyer joining a seller-created deal from another
              // device changes only this field — without it the seller never
              // leaves "Waiting for counterparty".
              (updated.buyer_wallet ?? "") !== (prev.buyer_wallet ?? "");
            return changed ? updated : prev;
          });
        }
      )
      .subscribe();

    return () => { supabaseBrowser.removeChannel(channel); };
  }, [dealId, applyServerPatch]);

  // Instant cross-tab detection via localStorage storage event
  useEffect(() => {
    if (!dealId) return;
    function handleStorage(e: StorageEvent) {
      if (e.key === `sealed:seller-joined:${dealId}` && e.newValue) {
        applyServerPatch((prev) => {
          if (!prev || (prev.seller_wallet ?? "") === e.newValue) return prev;
          return { ...prev, seller_wallet: e.newValue! };
        });
      }
      if (e.key === `sealed:counterparty-joined:${dealId}` && e.newValue) {
        const v = e.newValue;
        applyServerPatch((prev) => {
          if (!prev) return prev;
          if (!prev.seller_wallet && prev.buyer_wallet !== v) return { ...prev, seller_wallet: v };
          if (!prev.buyer_wallet && prev.seller_wallet !== v) return { ...prev, buyer_wallet: v };
          return prev;
        });
      }
      if (e.key === `sealed:seller-agreed:${dealId}` && e.newValue) {
        applyServerPatch((prev) => {
          if (!prev || prev.status === "seller-agreed") return prev;
          return { ...prev, status: "seller-agreed" };
        });
      }
      if (e.key === `sealed:deal-escalated:${dealId}` && e.newValue) {
        applyServerPatch((prev) => {
          if (!prev || prev.status === "escalated") return prev;
          return { ...prev, status: "escalated" };
        });
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [dealId, applyServerPatch]);

  // Load the shared renegotiation request so the counterparty sees why the
  // terms were reopened, even on a different device. SWR polls messages only
  // while escalated (null key otherwise); the notice is derived from them.
  const isEscalated = deal?.status === "escalated";
  const noticeMessages = useApi<{ messages?: DbMsg[] }>(
    isEscalated && dealId ? `/api/messages?deal_id=${dealId}` : null,
    null,
    { refreshInterval: POLL_MS }
  );
  // The old code did an extra one-shot re-fetch 1200ms after escalation to
  // catch the counterparty's request before the 4s cadence; mutate() reproduces
  // it exactly (same endpoint, same timing, just an early revalidation).
  const refetchNotice = noticeMessages.mutate;
  useEffect(() => {
    if (!isEscalated) return;
    const retry = window.setTimeout(() => void refetchNotice(), 1200);
    return () => window.clearTimeout(retry);
  }, [isEscalated, refetchNotice]);
  // Clear the notice when leaving escalated; otherwise set it from server data
  // when present (never overwrite an optimistic local notice with null).
  useEffect(() => {
    if (!isEscalated) {
      setRenegotiationNotice(null);
      return;
    }
    const next = renegotiationNoticeFromMessages(noticeMessages.data?.messages ?? []);
    if (next) setRenegotiationNotice(next);
  }, [isEscalated, noticeMessages.data]);

  // Redirect both parties once escrow is funded or deal is in any post-negotiate state.
  // Covers the case where the mirror call failed silently and Supabase still has
  // "seller-agreed" when the seller refreshes — they should never land back on negotiate.
  // One-shot: router.push is a soft nav that doesn't unmount synchronously, so
  // without this the effect can fire again on a later render and stack a second
  // navigation to the same route (#10).
  const redirectedRef = useRef(false);
  useEffect(() => {
    if (!deal || redirectedRef.current) return;
    const postNeg = ["funded", "in_progress", "completed", "refunded", "disputed"];
    if (postNeg.includes(deal.status)) {
      redirectedRef.current = true;
      router.push(`/deals/${deal.deal_id}`);
    }
  }, [deal?.status, deal?.deal_id, router]);

  // Fetch counterparty public profile
  useEffect(() => {
    if (!deal || !wallet) return;
    const cpWallet = deal.buyer_wallet === wallet ? deal.seller_wallet : deal.buyer_wallet;
    if (!cpWallet) return;
    apiFetch<PublicProfile>(`/api/users/${cpWallet}/public`)
      .then((data) => {
        setCpProfile(data);
        setCpHandle(atDisplayHandle(data.handle));
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

  // Reject-and-recycle sync (T-1): when the buyer rejects, they clear MY slot on
  // the server. My own device kept replaying stale join signals to re-add me, so
  // my side stayed stuck. Once I've been a party and then find myself no longer
  // in either slot on a real (buyer-known) deal, I've been released: purge my
  // local signals so they stop resurrecting me, and leave the room.
  const wasPartyRef = useRef(false);
  useEffect(() => {
    if (!deal || !wallet) return;
    const iAmParty = deal.buyer_wallet === wallet || deal.seller_wallet === wallet;
    if (iAmParty) {
      wasPartyRef.current = true;
      return;
    }
    // Not a party now. Only a *release* if I was one before AND the deal is a
    // real server deal that still has its owner (buyer) — not a mid-join gap.
    if (wasPartyRef.current && deal.buyer_wallet && deal.buyer_wallet !== wallet) {
      wasPartyRef.current = false;
      clearDealJoinSignals(deal.deal_id);
      router.replace("/app");
    }
  }, [deal, wallet, router]);

  // I'm a party (inviter) and the counterparty slot is still empty — show the
  // invite/share UI. Works whether I created as the buyer or the seller.
  const awaitingCounterparty =
    (role === "buyer" && !deal?.seller_wallet) ||
    (role === "seller" && !deal?.buyer_wallet);

  const counterpartyWallet =
    role === "buyer" ? deal?.seller_wallet : deal?.buyer_wallet;

  // A deal moving back to escalated reopens the negotiation room for both
  // parties. Without this, a counterparty sitting on an old "agreed" result
  // keeps seeing the stale funding/waiting state.
  useEffect(() => {
    if (!deal || deal.status !== "escalated") return;
    setNegState((prev) => {
      if (prev.kind === "running") return prev;
      if (prev.kind === "done" && prev.proposal.status === "escalated") return prev;
      return { kind: "idle" };
    });
    if (role === "seller") setSellerView("manual");
  }, [deal, role]);

  // Initialize sellerView from deal status on load (handles page refresh)
  useEffect(() => {
    if (!deal || role !== "seller") return;
    if (deal.status === "seller-ready") setSellerView("agent-waiting");
    if (deal.status === "seller-agreed") setSellerView("manual");
    // Fully-manual chat: restore the seller into it on refresh.
    if (deal.status === "manual-chat" && sellerView === "choice") setSellerView("fully-manual");
    // AI negotiation concluded (buyer PATCHed "proposed"): the seller ran no
    // stream, so pull them out of the "agent-waiting" spinner and back into the
    // shared conversation + result view (bug #2). "choice" lets the result panel
    // and persisted turns render; the synthetic-proposal effect below fills negState.
    if (deal.status === "proposed" && sellerView === "agent-waiting") setSellerView("choice");
  }, [deal?.status, role, sellerView]);

  // Restore seller's accepted state when they refresh after agreeing.
  // Without this, negState resets to "idle" and they see the choice screen again.
  useEffect(() => {
    if (!deal || role !== "seller" || deal.status !== "seller-agreed" || negState.kind !== "idle") return;
    const now = Date.now();
    const terms: DealParams = {
      dealId: deal.deal_id,
      title: deal.title,
      sellerWallet: deal.seller_wallet ?? "",
      totalAmount: deal.total_amount_usdc,
      milestones: (deal.milestones ?? []).map((m) => ({ description: m.description, amount: m.amount })),
    };
    setNegState({
      kind: "done",
      proposal: {
        id: `${deal.deal_id}-restored`,
        origin: "manual",
        buyerWallet: deal.buyer_wallet ?? "",
        sellerWallet: deal.seller_wallet ?? "",
        initialTerms: terms,
        revisions: [],
        status: "agreed",
        finalTerms: terms,
        summary: {
          pros: ["You accepted the deal terms"],
          cons: [],
          keyConcessions: [],
          riskFlags: [],
          confidenceScore: 1,
          recommendation: "accept",
          recommendationReasoning: "You accepted the terms. Waiting for the buyer to deploy escrow.",
        },
        buyerBoundaries: defaultSellerBoundaries(),
        sellerBoundaries: defaultSellerBoundaries(),
        createdAt: now,
        updatedAt: now,
      },
    });
  }, [deal?.status, role, negState.kind]);

  // Show the AI-negotiation result to the seller once the buyer PATCHes "proposed"
  // (bug #2). The seller never runs the stream, so negState stays "idle" and they'd
  // otherwise sit on the "Agents negotiating" spinner forever. Build a synthetic
  // "done" proposal from the concluded terms so NegotiationResult renders (read-only
  // for the seller — the Accept & Deploy controls are buyer-gated). The turn-by-turn
  // exchange itself is already visible in the shared ConversationView (turns are
  // persisted to chat server-side after the run).
  useEffect(() => {
    // Both parties need a result panel once the deal is `proposed`. Previously
    // seller-only, which left the BUYER's left column empty at `proposed` (no
    // idle-branch matches that status for the buyer) — the deal terms card
    // floated to the top with no negotiation panel above it. The buyer is the
    // funder, so their panel carries the Accept & Deploy action; the seller's is
    // the "waiting for buyer" acknowledgement.
    if (!deal || role === "observer" || deal.status !== "proposed" || negState.kind !== "idle") return;
    const now = Date.now();
    const terms: DealParams = {
      dealId: deal.deal_id,
      title: deal.title,
      sellerWallet: deal.seller_wallet ?? "",
      totalAmount: deal.total_amount_usdc,
      milestones: (deal.milestones ?? []).map((m) => ({ description: m.description, amount: m.amount })),
    };
    setNegState({
      kind: "done",
      proposal: {
        id: `${deal.deal_id}-proposed`,
        origin: "manual",
        buyerWallet: deal.buyer_wallet ?? "",
        sellerWallet: deal.seller_wallet ?? "",
        initialTerms: terms,
        revisions: [],
        status: "agreed",
        finalTerms: terms,
        summary: {
          pros: ["Both parties agreed on these terms"],
          cons: [],
          keyConcessions: [],
          riskFlags: [],
          confidenceScore: 1,
          recommendation: "accept",
          recommendationReasoning:
            role === "buyer"
              ? "These terms are agreed. Accept to fund and deploy the escrow."
              : "Agreed. Waiting for the buyer to accept and deploy the escrow.",
        },
        buyerBoundaries: defaultSellerBoundaries(),
        sellerBoundaries: defaultSellerBoundaries(),
        createdAt: now,
        updatedAt: now,
      },
    });
  }, [deal?.status, role, negState.kind]);

  // Buyer auto-starts AI negotiation when seller signals they're using their agent.
  // Depend on whether memory has loaded (`!!memory`), not just status/role — if
  // memory resolves a beat after the status flips to seller-ready, this effect
  // must re-run so the buyer's agent actually starts instead of hanging on
  // "Starting negotiation…" (S5). The idle-guard prevents a double-start.
  useEffect(() => {
    if (!deal || deal.status !== "seller-ready") return;
    if (role !== "buyer" || negState.kind !== "idle" || !memory) return;
    startNegotiation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal?.status, role, negState.kind, !!memory]);

  // Generate invite link.
  //
  // Preferred form is the short /i/{code} link — the old /invite/{base64} links
  // ran 800-1000+ chars (the whole deal payload lived in the URL) and chat apps
  // wrapped or truncated them. Minting a code is a server round trip, so the
  // legacy long link is built synchronously below and used until the short one
  // arrives; that keeps the share box populated on first paint and means a
  // failed mint degrades to a working link instead of an empty field.
  const [shortInviteLink, setShortInviteLink] = useState("");

  const legacyInviteLink = useMemo(() => {
    if (!deal || !profile || typeof window === "undefined") return "";
    const payload = {
      dealId: deal.deal_id,
      dealTitle: deal.title,
      inviterName: profile.name,
      inviterWallet: wallet ?? "",
      // The inviter's side, so the joiner takes the opposite slot.
      inviterRole: (deal.seller_wallet === wallet ? "seller" : "buyer") as "buyer" | "seller",
      amount: deal.total_amount_usdc,
      currency: "USDC",
      milestoneCount: (deal.milestones ?? []).length,
      milestones: (deal.milestones ?? []).map((m) => ({ description: m.description, amount: m.amount })),
      description: profile.bio ?? "",
    };
    return `${window.location.origin}/invite/${encodeURIComponent(encodeInvite(payload))}`;
  }, [deal, profile, wallet]);

  const dealIdForInvite = deal?.deal_id;
  useEffect(() => {
    if (!dealIdForInvite || !wallet || typeof window === "undefined") return;

    let cancelled = false;
    fetchShortInviteLink(dealIdForInvite, wallet, window.location.origin)
      .then((link) => {
        if (!cancelled && link) setShortInviteLink(link);
      })
      .catch(() => {
        /* keep the legacy link — it still resolves */
      });

    return () => {
      cancelled = true;
    };
  }, [dealIdForInvite, wallet]);

  const inviteLink = shortInviteLink || legacyInviteLink;

  const dealParams: DealParams = deal
    ? {
        dealId: deal.deal_id,
        sellerWallet: deal.seller_wallet ?? "",
        totalAmount: deal.total_amount_usdc,
        milestones: (deal.milestones ?? []).map((m) => ({
          description: m.description,
          amount: m.amount,
        })),
      }
    : { dealId: "", sellerWallet: "", totalAmount: 0, milestones: [] };

  // ── Milestone editor (#9) ────────────────────────────────────────────────
  //
  // Terms are editable only while escrow is still off-chain. The server
  // enforces this too (PATCH rejects term changes outside PRE_ESCROW_STATUSES
  // with 409) — the x-wallet header is unsigned, so UI gating alone wouldn't
  // hold. Observers never edit.
  const termsEditable =
    !!deal && role !== "observer" && PRE_ESCROW_UI_STATUSES.has(deal.status);

  // Poll messages for the live proposal. Same cadence and endpoint as the
  // escalation notice; keyed off termsEditable so we stop once terms lock.
  const proposalMessages = useApi<{ messages?: DbMsg[] }>(
    termsEditable && dealId ? `/api/messages?deal_id=${dealId}` : null,
    null,
    { refreshInterval: POLL_MS }
  );
  const refetchProposal = proposalMessages.mutate;
  const liveProposal = useMemo(
    () => liveProposalFromMessages(proposalMessages.data?.messages ?? []),
    [proposalMessages.data]
  );

  const proposeTerms = useCallback(async (terms: ProposedTerms) => {
    if (!deal || !wallet) return;
    setTermsBusy(true);
    setTermsError(null);
    try {
      // A proposal is only a message — the deal row is untouched until the
      // counterparty accepts. Nothing to roll back if this fails.
      await apiFetch("/api/messages", {
        method: "POST",
        wallet,
        body: {
          deal_id: deal.deal_id,
          role: "user",
          wallet,
          content: "Proposed new terms",
          metadata: { type: "terms_proposal", proposed_by: wallet, terms },
        },
      });
      setEditingTerms(false);
      await refetchProposal();
    } catch (error) {
      setTermsError(error instanceof Error ? error.message : "Could not send the proposal.");
    } finally {
      setTermsBusy(false);
    }
  }, [deal, wallet, refetchProposal]);

  const resolveProposal = useCallback(async (accept: boolean) => {
    if (!deal || !wallet || !liveProposal) return;
    setTermsBusy(true);
    setTermsError(null);
    try {
      if (accept) {
        // Apply first: if the PATCH is rejected (409 locked, 400 unbalanced)
        // we must NOT record an acceptance that never took effect.
        await patchDeal(
          {
            total_amount_usdc: liveProposal.terms.totalAmount,
            milestones: liveProposal.terms.milestones.map((m) => ({
              description: m.description,
              amount: m.amount,
            })),
          },
          async () => {
            await apiFetch(`/api/deals/${deal.deal_id}`, {
              method: "PATCH",
              wallet,
              body: {
                total_amount_usdc: liveProposal.terms.totalAmount,
                milestones: liveProposal.terms.milestones,
              },
            });
          }
        );
      }
      await apiFetch("/api/messages", {
        method: "POST",
        wallet,
        body: {
          deal_id: deal.deal_id,
          role: "user",
          wallet,
          content: accept ? "Accepted the proposed terms" : "Rejected the proposed terms",
          metadata: { type: "terms_resolution", accepted: accept, resolved_by: wallet },
        },
      });
      await refetchProposal();
    } catch (error) {
      setTermsError(
        error instanceof Error ? error.message : "Could not apply the proposed terms."
      );
    } finally {
      setTermsBusy(false);
    }
  }, [deal, wallet, liveProposal, patchDeal, refetchProposal]);

  const markDealEscalated = useCallback(async (requestText: string) => {
    if (!deal || !wallet) return false;
    const createdAt = new Date().toISOString();
    const requestedByRole =
      deal.buyer_wallet === wallet ? "buyer" : deal.seller_wallet === wallet ? "seller" : "party";
    const requestLabel = requestedByRole === "buyer" ? "Buyer" : requestedByRole === "seller" ? "Seller" : "Counterparty";

    try {
      localStorage.setItem(`sealed:deal-escalated:${deal.deal_id}`, requestText || "1");
    } catch {}

    // Optimistically show the notice; patchDeal flips status to "escalated"
    // instantly and auto-rolls-back the cached deal if the PATCH fails.
    setRenegotiationNotice({ content: requestText, wallet, created_at: createdAt });

    try {
      await patchDeal({ status: "escalated" }, async () => {
        try {
          await apiFetch("/api/messages", {
            method: "POST",
            body: {
              deal_id: deal.deal_id,
              role: "system",
              content: `${requestLabel} requested renegotiation:\n\n${requestText}`,
              wallet,
              metadata: {
                type: "renegotiation_request",
                request: requestText,
                requested_by: wallet,
                requested_by_role: requestedByRole,
              },
            },
          });
        } catch (error) {
          console.warn("[renegotiate] Could not persist request message", error);
        }

        // Throws on failure → patchDeal rolls the cached deal back.
        await apiFetch(`/api/deals/${deal.deal_id}`, {
          method: "PATCH",
          wallet,
          body: { status: "escalated" },
        });
      });
    } catch (error) {
      // patchDeal already rolled the deal back; undo the other optimistic
      // side-effects (notice + localStorage signal) to match the old behavior.
      try {
        localStorage.removeItem(`sealed:deal-escalated:${deal.deal_id}`);
      } catch {}
      setRenegotiationNotice(null);
      throw error;
    }

    return true;
  }, [deal, wallet, patchDeal]);

  const startNegotiation = useCallback(async (renegotiationRequest?: string) => {
    if (!deal || !wallet || !memory) return;
    setDeployError(null);
    setNegState({ kind: "running", rounds: [] });

    const buyerBoundaries = role === "buyer" ? memory.boundaries : defaultSellerBoundaries();
    const sellerBoundaries = role === "seller" ? memory.boundaries : defaultSellerBoundaries();

    // Offline mode: skip the LLM rounds. Treat the current terms as agreed so the
    // existing Accept & Deploy controls appear — you drive the decision manually.
    if (MOCK_DATA) {
      const now = Date.now();
      setNegState({
        kind: "done",
        proposal: {
          id: `${deal.deal_id}-mock`,
          origin: "manual",
          buyerWallet: deal.buyer_wallet ?? "",
          sellerWallet: dealParams.sellerWallet,
          initialTerms: dealParams,
          revisions: [
            {
              round: 0,
              by: AgentRole.Structurer,
              onBehalfOf: "buyer",
              action: "open",
              proposedTerms: dealParams,
              reasoning: "Offline mode — manual deal, no AI negotiation.",
              concessions: [],
              asks: [],
              timestamp: now,
            },
          ],
          status: "agreed",
          finalTerms: dealParams,
          summary: {
            pros: ["Offline manual deal — terms as entered."],
            cons: [],
            keyConcessions: [],
            riskFlags: [],
            confidenceScore: 1,
            recommendation: "accept",
            recommendationReasoning: "Manual offline deal; accept to fund the escrow.",
          },
          buyerBoundaries,
          sellerBoundaries,
          createdAt: now,
          updatedAt: now,
        },
      });
      return;
    }

    try {
      // Stream the negotiation so each round appears as it happens (T-2), instead
      // of a single opaque wait. The route emits SSE: a "revision" per round, a
      // terminal "done" with the proposal, or a terminal "error".
      const res = await fetch("/api/negotiate/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet": wallet,
          ...getLlmHeaders(wallet),
        },
        body: JSON.stringify({
          proposalId: `${deal.deal_id}-${Date.now()}`,
          buyerWallet: deal.buyer_wallet ?? "",
          initialTerms: dealParams,
          buyerBoundaries,
          sellerBoundaries,
          renegotiationRequest,
        }),
      });
      if (!res.ok || !res.body) {
        throw new Error("Negotiation failed to start. Please try again.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamError: string | null = null;
      let finalProposal: Proposal | null = null;

      // Parse SSE frames ("data: {json}\n\n") as they arrive.
      readLoop: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, sep).trim();
          buffer = buffer.slice(sep + 2);
          if (!frame.startsWith("data:")) continue;
          let evt: { type: string; revision?: Revision; proposal?: Proposal; message?: string };
          try {
            evt = JSON.parse(frame.slice(5).trim());
          } catch {
            continue;
          }
          if (evt.type === "revision" && evt.revision) {
            const rev = evt.revision;
            setNegState((prev) =>
              prev.kind === "running" ? { kind: "running", rounds: [...prev.rounds, rev] } : prev,
            );
          } else if (evt.type === "done" && evt.proposal) {
            finalProposal = evt.proposal;
            break readLoop;
          } else if (evt.type === "error") {
            streamError = evt.message ?? "Negotiation failed";
            break readLoop;
          }
        }
      }

      if (streamError) throw new Error(streamError);
      if (!finalProposal) throw new Error("Negotiation ended unexpectedly. Please try again.");

      setNegState({ kind: "done", proposal: finalProposal });
      if (finalProposal.status === "escalated") {
        // Auto-escalation (agents couldn't agree) must sync to the shared deal
        // too — otherwise the seller, who never runs the stream, is stranded on
        // the "Agents negotiating" spinner forever (same failure as #2, on the
        // escalated branch). Durable write so a transient failure doesn't strand.
        applyServerPatch((prev) => (prev ? { ...prev, status: "escalated" } : prev));
        const escWallet = wallet;
        void retryWrite(() =>
          apiFetch(`/api/deals/${deal.deal_id}`, {
            method: "PATCH",
            wallet: escWallet,
            body: { status: "escalated" },
          })
        );
      } else {
        // Negotiation concluded on the buyer's device only. Persist "proposed"
        // ("Ready to sign") to the shared deal so the seller — who never runs the
        // stream — leaves the "Agents negotiating" spinner and sees the result
        // (bug #2). Agents may change the amount/milestones during negotiation, so
        // write the AGREED terms too (not just status) — otherwise the seller's
        // result panel shows the pre-negotiation numbers as "agreed" (divergence).
        const agreedTerms = finalProposal.finalTerms;
        const patchBody: Record<string, unknown> = { status: "proposed" };
        if (agreedTerms) {
          patchBody.total_amount_usdc = agreedTerms.totalAmount;
          patchBody.milestones = agreedTerms.milestones.map((m) => ({
            description: m.description,
            amount: m.amount,
            status: "Pending",
          }));
        }
        applyServerPatch((prev) =>
          prev
            ? {
                ...prev,
                status: "proposed",
                ...(agreedTerms
                  ? {
                      total_amount_usdc: agreedTerms.totalAmount,
                      milestones: (patchBody.milestones as SupabaseDeal["milestones"]),
                    }
                  : {}),
              }
            : prev
        );
        // Durable write (retry): if this doesn't land, the seller is stranded on
        // the spinner forever — the exact failure #2 targets — so don't leave it
        // to a single fire-and-forget PATCH.
        const patchWallet = wallet;
        void retryWrite(() =>
          apiFetch(`/api/deals/${deal.deal_id}`, {
            method: "PATCH",
            wallet: patchWallet,
            body: patchBody,
          })
        );
      }
    } catch (err) {
      // A failed run (rate limit, out of credits, provider error) is an error to
      // retry — not a "renegotiate" recommendation, which reads as a dispute
      // even though no negotiation happened (bug #11). The server already returns
      // a clean, user-facing message (bug #12); surface it in the retry state.
      const message = err instanceof Error ? err.message : "Negotiation failed";
      setNegState({ kind: "error", message });
    }
  }, [deal, wallet, memory, role, dealParams, applyServerPatch]);

  // If the seller requests renegotiation, the buyer's room should actively
  // restart the agent flow instead of staying on a stale result — but ONLY for
  // agent-mode deals. A manual/fully-manual deal renegotiates by reopening the
  // editor (editingTerms), never by auto-running the agent; firing it here would
  // auto-agree and lock the seller out of a human reply.
  useEffect(() => {
    if (!deal || deal.status !== "escalated") return;
    if (role !== "buyer" || negState.kind !== "idle" || !memory) return;
    if (sellerView === "manual" || sellerView === "fully-manual") return;
    if (!renegotiationNotice?.content || renegotiationNotice.wallet === wallet) return;
    startNegotiation(renegotiationNotice.content);
  }, [
    sellerView,
    deal,
    role,
    negState.kind,
    memory,
    renegotiationNotice?.content,
    renegotiationNotice?.wallet,
    wallet,
    startNegotiation,
  ]);

  function getDeployErrorMessage(err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (/reject|cancel/i.test(message)) {
      return "Transaction was cancelled in your wallet.";
    }
    if (/insufficient funds/i.test(message)) {
      return "Insufficient devnet USDC in this wallet. Add USDC, then try deploying escrow again.";
    }
    return message || "Escrow deployment failed. Please try again.";
  }

  async function submitRenegotiation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextRequest = renegotiateRequest.trim();
    if (!nextRequest) {
      setRenegotiateError("Tell your agent what you want to change.");
      return;
    }
    if (!deal || !wallet || !memory) {
      setRenegotiateError("Agent setup is still loading. Try again in a moment.");
      return;
    }
    setRenegotiateError(null);
    try {
      await markDealEscalated(nextRequest);
      setRenegotiateOpen(false);
      setRenegotiateRequest("");
      startNegotiation(nextRequest);
    } catch (error) {
      setRenegotiateError(error instanceof Error ? error.message : "Could not escalate the deal.");
    }
  }

  // Reject-and-recycle (#19): release the current counterparty and reopen the
  // deal so the SAME invite link can be reused for someone else — no new deal
  // needed. Clears the counterparty's slot and resets the deal to "draft".
  async function handleReject() {
    if (!deal || !wallet) return;
    const iAmBuyer = deal.buyer_wallet === wallet;
    const counterpartyField = iAmBuyer ? "seller_wallet" : "buyer_wallet";
    try {
      await patchDeal(
        { [counterpartyField]: null, status: "draft" } as Partial<SupabaseDeal>,
        () =>
          apiFetch(`/api/deals/${encodeURIComponent(deal.deal_id)}`, {
            method: "PATCH",
            wallet,
            body: { [counterpartyField]: null, status: "draft" },
          })
      );
      // Clear THIS device's stale local state too (S2): the sessionStorage
      // `deal:<id>` draft still holds the old counterparty, and the seller-
      // agreed/joined signals would otherwise replay and re-add them — on any
      // transient GET failure retryMirrorSync could re-POST the old slot and
      // undo the reject. clearDealJoinSignals wipes the draft + all four signals.
      clearDealJoinSignals(deal.deal_id);
      // Back to the invite/awaiting state; the stateless invite link re-derives.
      setNegState({ kind: "idle" });
      setRejectOpen(false);
    } catch (error) {
      setRejectError(error instanceof Error ? error.message : "Could not reject the deal.");
    }
  }

  // Shared "accept the manual-chat terms" handler — works for EITHER party
  // (seller or buyer) in manual chat. Concludes to "seller-agreed" (buyer funds
  // next), preserving proof_by, and shows the result panel. Party-agnostic:
  // seller_wallet always comes from the deal, not the caller's wallet.
  async function handleManualAgree(deal: SupabaseDeal, negotiatedTerms?: NegotiatedTerms) {
    if (!deal) return;
    try { localStorage.setItem(`sealed:seller-agreed:${deal.deal_id}`, "1"); } catch {}
    const finalAmount = negotiatedTerms?.totalAmount ?? deal.total_amount_usdc;
    const finalMilestones = negotiatedTerms?.milestones
      ? negotiatedTerms.milestones.map((m, i) => {
          const byDesc = (deal.milestones ?? []).find((dm) => dm.description === m.description);
          const carried = byDesc?.proof_by ?? deal.milestones?.[i]?.proof_by;
          return carried ? { ...m, proof_by: carried } : m;
        })
      : (deal.milestones ?? []);
    const sellerW = deal.seller_wallet ?? "";
    try {
      await apiFetch(`/api/deals/${deal.deal_id}`, {
        method: "PATCH",
        wallet: wallet ?? "",
        body: { status: "seller-agreed", total_amount_usdc: finalAmount, milestones: finalMilestones },
      });
    } catch {
      await apiFetchSafe("/api/deals/mirror", {
        method: "POST",
        wallet: wallet ?? deal.buyer_wallet ?? sellerW,
        body: {
          deal_id: deal.deal_id, seller_wallet: sellerW, title: deal.title,
          description: deal.description ?? "", total_amount_usdc: finalAmount,
          milestones: finalMilestones, status: "seller-agreed",
        },
      }, undefined);
    }
    applyServerPatch((prev) => prev ? { ...prev, status: "seller-agreed", total_amount_usdc: finalAmount, milestones: finalMilestones } : prev);
    const now = Date.now();
    const terms: DealParams = {
      dealId: deal.deal_id,
      title: deal.title,
      sellerWallet: sellerW,
      totalAmount: finalAmount,
      milestones: finalMilestones.map((m) => ({ description: m.description, amount: m.amount })),
    };
    setNegState({ kind: "done", proposal: {
      id: `${deal.deal_id}-manual-${now}`, origin: "manual",
      buyerWallet: deal.buyer_wallet ?? "", sellerWallet: sellerW,
      initialTerms: terms, revisions: [], status: "agreed", finalTerms: terms,
      summary: { pros: ["Terms accepted in manual chat"], cons: [], keyConcessions: [], riskFlags: [], confidenceScore: 1, recommendation: "accept", recommendationReasoning: negotiatedTerms ? "Terms were updated during the chat. Review the final values before deploying escrow." : "Terms accepted. The buyer deploys the escrow." },
      buyerBoundaries: defaultSellerBoundaries(), sellerBoundaries: defaultSellerBoundaries(),
      createdAt: now, updatedAt: now,
    }});
  }

  async function handleAcceptAndDeploy(finalTerms: DealParams) {
    if (!publicKey || !signTransaction) {
      setDeployError("Connect a wallet that can sign this transaction.");
      return;
    }
    setDeploying(true);
    setDeployError(null);

    try {
      const mint = getUsdcMint();
      // The buyer pays the contract + their platform fee up front. The fee is
      // TIER-AWARE and must match what the chain charges (resolveBuyerFeeBps),
      // or the balance check demands more than fund_escrow actually takes — e.g.
      // an SSS-creator deal charges the buyer 0%, not the flat half.
      const fee = await fetchFeeConfig(connection);
      const buyerBps =
        fee.active && creatorWallet
          ? await resolveBuyerFeeBps(connection, {
              globalFeeBps: fee.feeBps,
              creatorWallet: new PublicKey(creatorWallet),
              creatorIsBuyer,
            })
          : 0;
      const buyerFeeUsdc = sideFeeLamports(finalTerms.totalAmount * 1_000_000, buyerBps) / 1_000_000;
      const totalToDeposit = finalTerms.totalAmount + buyerFeeUsdc;

      const balance = await getUsdcBalance(connection, publicKey, mint);
      if (balance < totalToDeposit) {
        setDeployError(
          `Insufficient devnet USDC. This wallet has ${formatUsdc(balance)} USDC but funding needs ${formatUsdc(totalToDeposit)} USDC (contract + ${formatUsdc(buyerFeeUsdc)} fee).`
        );
        setDeploying(false);
        return;
      }

      // Treasury token account for fee-bearing deals (undefined → fee-free).
      const treasuryTa = fee.active
        ? await getAssociatedTokenAddress(mint, new PublicKey(fee.treasury))
        : undefined;

      const ensureAtaIx = await buildEnsureAtaIx(publicKey, publicKey, mint);
      const createIx = await buildCreateDealIx(publicKey, finalTerms, connection);
      const fundIx = await buildFundEscrowIx(publicKey, finalTerms.dealId, finalTerms.totalAmount, treasuryTa);
      const sig = await sendTx(connection, [ensureAtaIx, createIx, fundIx], signTransaction);

      const now = Math.floor(Date.now() / 1000);
      const fundedAmount = usdcToLamports(finalTerms.totalAmount);

      if (MOCK_CHAIN) {
        // Record create + full funding in the fake ledger (lamports).
        mockEscrow.createDeal(finalTerms.dealId, fundedAmount);
        mockEscrow.fundEscrow(
          finalTerms.dealId,
          publicKey.toBase58(),
          fundedAmount,
          fundedAmount
        );
      }
      const fundedDeal: Deal = {
        dealId: finalTerms.dealId,
        buyer: publicKey,
        seller: new PublicKey(finalTerms.sellerWallet),
        mint,
        escrowTokenAccount: PublicKey.default,
        totalAmount: fundedAmount,
        fundedAmount,
        releasedAmount: 0,
        status: DealStatus.Funded,
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

      if (deals.some((d) => d.dealId === finalTerms.dealId)) {
        updateDeal(finalTerms.dealId, () => fundedDeal);
      } else {
        addDeal(fundedDeal);
      }

      const mirroredDeal = {
        deal_id: finalTerms.dealId,
        seller_wallet: finalTerms.sellerWallet,
        title: deal?.title || finalTerms.title || finalTerms.dealId,
        description: finalTerms.milestones.map((m) => m.description).join(" | "),
        total_amount_usdc: finalTerms.totalAmount,
        milestones: finalTerms.milestones.map((m, idx) => {
          // Carry the per-milestone proof responsibility (#11) from the existing
          // deal (set at creation). Match by DESCRIPTION, not blind index — the
          // negotiation engine can reorder/recount milestones, so index-matching
          // would attach the wrong party's proof_by. Fall back to same-index only
          // when the description is unique-matchable fails and counts are equal.
          const byDesc = deal?.milestones?.find((dm) => dm.description === m.description);
          const sameCount = deal?.milestones?.length === finalTerms.milestones.length;
          const carried = byDesc?.proof_by ?? (sameCount ? deal?.milestones?.[idx]?.proof_by : undefined);
          return {
            description: m.description,
            amount: m.amount,
            status: "Pending",
            ...(carried ? { proof_by: carried } : {}),
          };
        }),
        tx_signature: sig,
        status: "funded",
        // Stamp the funding time so the reclaim UI can show when the 30-day
        // buyer-timeout window elapses (#9).
        funded_at: new Date().toISOString(),
      };
      const mirrorPatch = {
        seller_wallet: mirroredDeal.seller_wallet,
        title: mirroredDeal.title,
        description: mirroredDeal.description,
        total_amount_usdc: mirroredDeal.total_amount_usdc,
        milestones: mirroredDeal.milestones,
        status: mirroredDeal.status,
        funded_at: mirroredDeal.funded_at,
      };

      // On-chain deploy already succeeded — reflect the funded state locally.
      applyServerPatch((prev) =>
        prev
          ? {
              ...prev,
              seller_wallet: finalTerms.sellerWallet,
              title: mirroredDeal.title,
              description: mirroredDeal.description,
              total_amount_usdc: finalTerms.totalAmount,
              milestones: mirroredDeal.milestones,
              status: "funded",
              funded_at: mirroredDeal.funded_at,
            }
          : prev
      );
      try {
        sessionStorage.setItem(`deal:${finalTerms.dealId}`, JSON.stringify({
          buyer_wallet: publicKey.toBase58(),
          ...mirroredDeal,
        }));
      } catch {}

      // Escrow is funded ON-CHAIN and irreversible. The mirror write drives the
      // UI (which page you land on, the funded status both parties see), so make
      // it durable: retry POST, then PATCH, rather than a single best-effort try
      // that could strand a funded deal at "seller-agreed" (F3). Warn softly if
      // it still won't sync — the money is safe; it just hasn't mirrored.
      const mirrorWallet = publicKey.toBase58();
      const synced = await retryWrite(() =>
        apiFetch("/api/deals/mirror", { method: "POST", wallet: mirrorWallet, body: mirroredDeal }).catch(() =>
          apiFetch(`/api/deals/${finalTerms.dealId}`, { method: "PATCH", wallet: mirrorWallet, body: mirrorPatch }),
        ),
      );
      if (!synced) {
        console.error("Mirror sync failed after retries for funded deal", finalTerms.dealId);
      }

      setDealSealedId(finalTerms.dealId);
      setDeploying(false);
    } catch (err) {
      console.error("On-chain deploy failed:", err);
      setDeployError(getDeployErrorMessage(err));
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

  const roomStatusLabel = dealStatusLabel(deal.status);

  // Who created the deal, for tier-aware fee display. creator_role is recorded
  // at creation (Phase 0); default to buyer (the common case, and what
  // create_deal defaults to) when a legacy deal predates the column.
  const creatorIsBuyer = deal.creator_role !== "seller";
  const creatorWallet = creatorIsBuyer
    ? (deal.buyer_wallet ?? null)
    : (deal.seller_wallet ?? null);

  // Whether the right-hand conversation column renders. Hidden before a
  // counterparty exists (nothing to converse with), and in the seller's manual
  // modes where ManualNegotiationPanel already IS the chat — showing both
  // stacked two transcripts on top of each other. Drives the left column's
  // span too, so the two can't disagree.
  const showConversation =
    !!deal.seller_wallet &&
    !(role === "seller" && (sellerView === "manual" || sellerView === "fully-manual"));

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
            deal.status === "draft" || deal.status === "escalated" ? "text-warning" : "text-accent"
          }`}>
            {roomStatusLabel}
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

        {/* The live conversation owns the right column; everything about the
            deal — your negotiation actions, terms, milestones, parties — sits
            together on the left (#20). Chat gets the wider 2/3 track so a long
            transcript stays readable. */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: negotiation actions + deal terms + parties. Spans the full
              grid when the chat is hidden, so the column doesn't sit in a 1/3
              track with two-thirds of the row empty. */}
          <div className={`space-y-4 ${showConversation ? "" : "lg:col-span-3"}`}>
            {/* Negotiation actions — mode choice, agent progress, accept /
                renegotiate. Heads the left column, above the deal terms. */}
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
                  {role === "seller" && sellerView === "choice" && deal.status !== "escalated" && (
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
                            // Signal the buyer (cross-device) that we're in manual
                            // chat so their room renders a manual panel too.
                            await apiFetchSafe(`/api/deals/${deal.deal_id}`, {
                              method: "PATCH",
                              wallet: wallet ?? "",
                              body: { status: "manual-chat" },
                            }, undefined);
                            applyServerPatch((prev) => prev ? { ...prev, status: "manual-chat" } : prev);
                            setSellerView("fully-manual");
                          }}
                          className="w-full flex items-start gap-3 px-4 py-3 rounded-xl border border-card-border bg-surface hover:border-accent/40 transition-colors text-left"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-accent mt-0.5 shrink-0">
                            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                          </svg>
                          <div>
                            <p className="text-[13px] text-primary" style={labelStyle}>Manual chat</p>
                            <p className="text-[12px] text-muted mt-0.5">
                              You reply by hand — no auto agent. A button can draft a reply with your agent when you want.
                            </p>
                          </div>
                        </button>

                        <button
                          onClick={async () => {
                            if (!memory) return;
                            await apiFetchSafe(`/api/deals/${deal.deal_id}`, {
                              method: "PATCH",
                              wallet: wallet ?? "",
                              body: { status: "seller-ready" },
                            }, undefined);
                            applyServerPatch((prev) => prev ? { ...prev, status: "seller-ready" } : prev);
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

                  {/* ── SELLER — manual chat (assisted or fully-manual) ── */}
                  {role === "seller" && (sellerView === "manual" || sellerView === "fully-manual") && (
                    <ManualNegotiationPanel
                      deal={deal}
                      wallet={wallet ?? ""}
                      mode={sellerView === "fully-manual" ? "fully-manual" : "assisted"}
                      party="seller"
                      // Fully-manual is human↔human: renegotiate must reopen the
                      // terms editor, never the agent modal (which would auto-run
                      // and lock the counterparty out). Assisted mode IS a chat with
                      // the buyer's agent, so the agent modal is appropriate there.
                      onRenegotiate={
                        sellerView === "fully-manual"
                          ? () => { setEditingTerms(true); setTermsError(null); }
                          : () => setRenegotiateOpen(true)
                      }
                      onBack={async () => {
                        // Going back must also clear the shared status. Manual
                        // chat sets the deal to "manual-chat"; resetting only the
                        // local view left the restore effect to immediately put
                        // us back, so Back appeared to do nothing (R7 #1).
                        if (deal.status === "manual-chat") {
                          applyServerPatch((prev) => (prev ? { ...prev, status: "draft" } : prev));
                          await apiFetchSafe(`/api/deals/${deal.deal_id}`, {
                            method: "PATCH",
                            wallet: wallet ?? "",
                            body: { status: "draft" },
                          }, undefined);
                        }
                        setSellerView("choice");
                      }}
                      onAgree={(negotiatedTerms) => handleManualAgree(deal, negotiatedTerms)}
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

                  {/* ── INVITER — waiting for the counterparty to join ── */}
                  {awaitingCounterparty && (
                    <div className="p-5 space-y-2">
                      <p className="text-[13px] text-primary" style={labelStyle}>Waiting for counterparty</p>
                      <p className="text-[12px] text-muted">
                        Share the invite link above. Negotiation starts automatically once they join.
                      </p>
                    </div>
                  )}

                  {/* ── BUYER — seller agreed (rendered directly, no useEffect lag) ── */}
                  {role === "buyer" && deal.status === "seller-agreed" && (
                    <NegotiationResult
                      proposal={{
                        id: `${deal.deal_id}-seller-agreed`,
                        origin: "manual",
                        buyerWallet: deal.buyer_wallet ?? "",
                        sellerWallet: deal.seller_wallet ?? "",
                        initialTerms: dealParams,
                        revisions: [],
                        status: "agreed",
                        finalTerms: dealParams,
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
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                      }}
                      role={role}
                      deploying={deploying}
                      deployError={deployError}
                      onAccept={handleAcceptAndDeploy}
                      // These terms were reached by MANUAL negotiation, so
                      // renegotiate reopens the editor rather than firing the
                      // agent — the counterparty must be able to respond by hand.
                      onRenegotiate={() => { setEditingTerms(true); setTermsError(null); }}
                      onReject={deal.seller_wallet ? () => { setRejectError(null); setRejectOpen(true); } : undefined}
                      creatorWallet={creatorWallet}
                      creatorIsBuyer={creatorIsBuyer}
                    />
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

                  {/* ── BUYER — seller chose Manual chat: buyer's manual panel ── */}
                  {role === "buyer" && deal.status === "manual-chat" && (
                    <ManualNegotiationPanel
                      deal={deal}
                      wallet={wallet ?? ""}
                      mode="fully-manual"
                      party="buyer"
                      // Renegotiate in a MANUAL chat must stay manual — reopen the
                      // terms editor, NOT the agent modal. Routing this into the
                      // agent (RenegotiateModal → startNegotiation) auto-negotiated
                      // and auto-agreed, locking the seller out of a human reply.
                      onRenegotiate={() => { setEditingTerms(true); setTermsError(null); }}
                      onAgree={(negotiatedTerms) => handleManualAgree(deal, negotiatedTerms)}
                    />
                  )}

                  {deal.status === "escalated" && !(role === "seller" && sellerView === "manual") && (
                    <EscalatedRenegotiationPanel
                      role={role}
                      notice={renegotiationNotice}
                      isOwnRequest={!!wallet && renegotiationNotice?.wallet === wallet}
                      memoryReady={!!memory}
                      onOpenChat={() => setSellerView("manual")}
                      onStartAgent={() =>
                        startNegotiation(
                          renegotiationNotice?.content || "Counterparty requested renegotiation."
                        )
                      }
                      onAddRequest={() => setRenegotiateOpen(true)}
                    />
                  )}
                </>
              )}

              {negState.kind === "running" && (
                <div className="py-6 px-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-accent/10 text-accent shrink-0">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse" aria-hidden="true">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[15px] text-primary" style={headingStyle}>Agents negotiating</p>
                      <p className="text-[12px] text-muted">
                        {negState.rounds.length > 0
                          ? `${negState.rounds.filter((r) => r.round > 0).length} exchange${negState.rounds.filter((r) => r.round > 0).length !== 1 ? "s" : ""} so far`
                          : "Opening the negotiation…"}
                      </p>
                    </div>
                  </div>

                  {/* Live turn-by-turn feed — each round appears as it streams in. */}
                  <div className="space-y-2">
                    {negState.rounds.map((r, i) => (
                      <NegotiationTurnLine key={`${r.round}-${i}`} revision={r} />
                    ))}
                    <div className="flex items-center gap-2 text-[12px] text-subtle pl-1 pt-1">
                      <span className="flex gap-1">
                        {[0, 150, 300].map((d) => (
                          <span key={d} className="h-1.5 w-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: `${d}ms` }} />
                        ))}
                      </span>
                      <span>Waiting for the next reply…</span>
                    </div>
                  </div>
                </div>
              )}

              {negState.kind === "error" && (() => {
                const isConfig = isAgentConfigError(negState.message);
                return (
                <div className="flex flex-col items-center justify-center py-12 gap-4 text-center px-6">
                  <div className={isConfig ? "text-accent" : "text-danger"}>
                    {isConfig ? (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </svg>
                    ) : (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    )}
                  </div>
                  <p className="text-[14px] text-primary" style={headingStyle}>
                    {isConfig ? "Set up your AI agent first" : "Negotiation failed"}
                  </p>
                  <p className="text-[13px] text-muted max-w-85">
                    {isConfig
                      ? "Your agent needs an AI provider to negotiate. Add your API key on the Agent Setup page."
                      : negState.message}
                  </p>
                  {isConfig ? (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setNegState({ kind: "idle" })} className="btn-ghost h-9 px-4 rounded-md text-[13px]">
                        Not now
                      </button>
                      <Link
                        href={wallet ? `/profile/${wallet}?tab=settings` : "/profile"}
                        className="btn-primary h-9 px-4 rounded-md text-[13px] inline-flex items-center gap-1.5"
                        style={{ textDecoration: "none" }}
                      >
                        Go to Agent Setup
                      </Link>
                    </div>
                  ) : (
                    <button onClick={() => setNegState({ kind: "idle" })} className="btn-ghost h-9 px-4 rounded-md text-[13px]">
                      Try again
                    </button>
                  )}
                </div>
                );
              })()}

              {negState.kind === "done" && (
                <NegotiationResult
                  proposal={negState.proposal}
                  role={role}
                  deploying={deploying}
                  deployError={deployError}
                  onAccept={handleAcceptAndDeploy}
                  onRenegotiate={() => setRenegotiateOpen(true)}
                  onReject={
                    (role === "buyer" ? deal.seller_wallet : deal.buyer_wallet)
                      ? () => { setRejectError(null); setRejectOpen(true); }
                      : undefined
                  }
                  creatorWallet={creatorWallet}
                  creatorIsBuyer={creatorIsBuyer}
                />
              )}
            </div>

            {/* Invite counterparty (buyer only, no seller yet) */}
            {awaitingCounterparty && deal.status === "draft" && inviteLink && (
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
            {/* Terms proposal — either side's pending edit, awaiting approval (#9) */}
            {liveProposal && !editingTerms && (
              <TermsProposalCard
                proposal={liveProposal.terms}
                current={deal}
                mine={liveProposal.proposedBy === wallet}
                busy={termsBusy}
                onAccept={() => void resolveProposal(true)}
                onReject={() => void resolveProposal(false)}
              />
            )}

            {termsError && (
              <p className="text-[12px] text-danger px-1">{termsError}</p>
            )}

            {/* Milestone editor (#9) */}
            {editingTerms ? (
              <MilestoneEditor
                deal={deal}
                submitting={termsBusy}
                onCancel={() => { setEditingTerms(false); setTermsError(null); }}
                onPropose={(terms) => void proposeTerms(terms)}
              />
            ) : (
            <div className="surface-card rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] text-primary" style={labelStyle}>Deal terms</p>
                {/* Hidden while a proposal is pending — two competing edits
                    would race, and the last PATCH would silently win. */}
                {termsEditable && !liveProposal && (
                  <button
                    onClick={() => { setEditingTerms(true); setTermsError(null); }}
                    className="text-[12px] text-accent hover:text-accent-hover transition-colors"
                  >
                    Edit
                  </button>
                )}
              </div>
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
                    <div key={i} className="flex items-center justify-between gap-2 text-[12px] bg-[rgba(255,255,255,0.02)] border border-card-border-subtle rounded-md px-3 py-2">
                      <span className="truncate text-foreground min-w-0">
                        <span className="text-subtle mr-1.5">{i + 1}.</span>
                        {m.description}
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        {/* Which side uploads this milestone's proof (#3). Defaults
                            to seller when unset. */}
                        <span className="text-[10px] uppercase tracking-[0.04em] text-subtle border border-card-border-subtle rounded px-1.5 py-0.5">
                          proof: {m.proof_by ?? "seller"}
                        </span>
                        <span className="font-mono text-muted">${formatUsdc(m.amount ?? 0)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            )}

            <PartyCard
              label="Buyer"
              wallet={deal.buyer_wallet ?? ""}
              isYou={wallet === deal.buyer_wallet}
              profile={wallet === deal.buyer_wallet ? null : (role === "seller" ? cpProfile : null)}
              handle={wallet === deal.buyer_wallet ? (profile?.name ?? null) : cpHandle}
            />
            <PartyCard
              label="Seller"
              wallet={deal.seller_wallet ?? ""}
              isYou={wallet === deal.seller_wallet}
              profile={wallet === deal.seller_wallet ? null : (role === "buyer" ? cpProfile : null)}
              handle={wallet === deal.seller_wallet ? (profile?.name ?? null) : cpHandle}
            />
          </div>

          {/* Right: the live conversation, on the wider 2/3 track. */}
          {showConversation && (
            <div className="lg:col-span-2">
              <ConversationView dealId={deal.deal_id} buyerView={role === "buyer"} myWallet={wallet} />
            </div>
          )}
        </div>
      </div>

      {dealSealedId && (
        <DealSealedModal onClose={() => router.push(`/deals/${dealSealedId}`)} />
      )}
      {renegotiateOpen && (
        <RenegotiateModal
          value={renegotiateRequest}
          error={renegotiateError}
          running={negState.kind === "running"}
          onChange={(value) => {
            setRenegotiateRequest(value);
            if (renegotiateError) setRenegotiateError(null);
          }}
          onClose={() => {
            if (negState.kind !== "running") setRenegotiateOpen(false);
          }}
          onSubmit={submitRenegotiation}
        />
      )}

      {/* Reject-and-recycle confirmation (#19) */}
      {rejectOpen && (
        <div
          onClick={() => setRejectOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} className="modal-card" style={{ width: "100%", maxWidth: 420, borderRadius: 14, padding: 22 }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--primary)", margin: "0 0 6px" }}>Reject this counterparty?</p>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 16px", lineHeight: 1.5 }}>
              This removes the current counterparty and reopens the deal. Your <b style={{ color: "var(--foreground)" }}>same invite link</b> will work again for someone else — no need to recreate the deal. No funds are involved (nothing is in escrow yet).
            </p>
            {rejectError && <p style={{ fontSize: 12, color: "var(--danger)", margin: "0 0 12px" }}>{rejectError}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-ghost" onClick={() => setRejectOpen(false)} style={{ height: 38, borderRadius: 8, fontSize: 13, flex: 1 }}>Cancel</button>
              <button
                onClick={handleReject}
                style={{ height: 38, borderRadius: 8, fontSize: 13, flex: 1, background: "var(--danger)", color: "#fff", border: "none", fontWeight: 510, cursor: "pointer" }}
              >
                Reject &amp; reopen
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

/* ── Deal Sealed popup (shown after buyer accepts & deploys escrow) ─────── */

function DealSealedModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <>
      <style>{`
        @keyframes ds-circle-draw {
          from { stroke-dashoffset: 283; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes ds-check-draw {
          from { stroke-dashoffset: 100; opacity: 0; }
          to   { stroke-dashoffset: 0;   opacity: 1; }
        }
        @keyframes ds-modal-in {
          from { opacity: 0; transform: scale(0.88); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes ds-overlay-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes ds-badge-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); }
          50%       { box-shadow: 0 0 0 16px rgba(34,197,94,0); }
        }
      `}</style>

      <div
        className="fixed inset-0 z-50 flex items-center justify-center px-4"
        style={{ background: "rgba(0,0,0,0.72)", animation: "ds-overlay-in 0.25s ease both" }}
        onClick={onClose}
      >
        <div
          className="relative bg-[#0D1117] border border-[rgba(255,255,255,0.08)] rounded-2xl px-10 py-10 flex flex-col items-center gap-5 max-w-sm w-full shadow-2xl"
          style={{ animation: "ds-modal-in 0.35s cubic-bezier(0.34,1.56,0.64,1) both" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ animation: "ds-badge-pulse 2s ease-in-out 0.8s infinite" }} className="rounded-full">
            <svg width="88" height="88" viewBox="0 0 88 88" fill="none">
              <circle
                cx="44" cy="44" r="40"
                stroke="#22C55E" strokeWidth="3.5" fill="none"
                strokeDasharray="251" strokeDashoffset="251"
                strokeLinecap="round"
                style={{ animation: "ds-circle-draw 0.55s ease-out 0.1s both" }}
              />
              <circle cx="44" cy="44" r="36" fill="rgba(34,197,94,0.08)" />
              <polyline
                points="26,44 38,56 62,30"
                stroke="#22C55E" strokeWidth="4" fill="none"
                strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray="100" strokeDashoffset="100"
                style={{ animation: "ds-check-draw 0.4s ease-out 0.65s both" }}
              />
            </svg>
          </div>

          <div className="text-center space-y-1.5">
            <h2 className="text-[22px] text-white" style={{ fontWeight: 700, letterSpacing: "-0.022em" }}>
              Deal Sealed
            </h2>
            <p className="text-[14px] text-[#8b949e] leading-relaxed">
              Escrow deployed. Funds are locked and protected until milestones are confirmed.
            </p>
          </div>

          <div className="w-full h-px bg-[rgba(255,255,255,0.06)]" />

          <button
            onClick={onClose}
            className="w-full h-10 rounded-lg bg-[#22C55E] text-white text-[14px] hover:bg-[#16a34a] transition-colors"
            style={{ fontWeight: 600 }}
          >
            View Deal
          </button>
        </div>
      </div>
    </>
  );
}

/* ── Party card with credibility ────────────────────────────────────────── */

function RenegotiateModal({
  value,
  error,
  running,
  onChange,
  onClose,
  onSubmit,
}: {
  value: string;
  error: string | null;
  running: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black">
      <form
        onSubmit={onSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="renegotiate-title"
        className="surface-card w-full max-w-lg rounded-xl border border-card-border bg-panel p-5 space-y-4 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 id="renegotiate-title" className="text-[18px] text-primary" style={headingStyle}>
              Renegotiate terms
            </h2>
            <p className="text-[13px] text-muted leading-relaxed">
              Tell your agent what you want changed before it talks to the counterparty again.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            aria-label="Close renegotiation dialog"
            className="h-10 w-10 rounded-md text-muted hover:text-primary hover:bg-surface-hover transition-colors disabled:opacity-50 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <label className="space-y-1.5 block">
          <span className="block text-[12px] text-primary" style={labelStyle}>
            What do you want?
          </span>
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Example: lower the first milestone payment and extend delivery by one week."
            rows={5}
            disabled={running}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error ? "renegotiate-error" : "renegotiate-help"}
            className="w-full resize-none rounded-lg border border-card-border bg-surface px-3 py-2.5 text-[13px] text-primary outline-none transition-colors placeholder:text-subtle focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-60"
          />
        </label>
        {error ? (
          <p id="renegotiate-error" className="text-[12px] text-danger">
            {error}
          </p>
        ) : (
          <p id="renegotiate-help" className="text-[12px] text-muted">
            Your agent will use this as the instruction for the next negotiation round.
          </p>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            className="btn-ghost h-10 px-4 rounded-md text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={running}
            aria-busy={running}
            className="btn-primary h-10 px-4 rounded-md text-[13px] flex items-center justify-center gap-2 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            {running ? "Sending..." : "Send to agent"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Milestone editor (#9) ─────────────────────────────────────────────────
 *
 * Direct manipulation of terms during negotiation. Edits are a PROPOSAL, not a
 * write: the counterparty sees the diff and accepts or rejects. Neither side
 * can unilaterally rewrite terms the other already agreed to.
 *
 * The proposal rides on sealed_messages.metadata rather than a new table — it
 * gives us the counterparty's view, ordering, and an audit trail for free, and
 * needs no migration. The newest message with metadata.kind === "terms-proposal"
 * and no later resolution is the live one.
 */

type ProposedTerms = { totalAmount: number; milestones: Array<{ description: string; amount: number }> };

/** A milestone row while being edited: amounts are strings so a half-typed
 *  "1." or "" doesn't collapse to 0 or NaN under the user's cursor. */
type DraftMilestone = { description: string; amount: string };

function toDraft(milestones: SupabaseMilestone[]): DraftMilestone[] {
  return (milestones ?? []).map((m) => ({
    description: m.description ?? "",
    amount: String(m.amount ?? ""),
  }));
}

function MilestoneEditor({
  deal,
  onCancel,
  onPropose,
  submitting,
}: {
  deal: SupabaseDeal;
  onCancel: () => void;
  onPropose: (terms: ProposedTerms) => void;
  submitting: boolean;
}) {
  const [rows, setRows] = useState<DraftMilestone[]>(() => toDraft(deal.milestones ?? []));
  const [totalInput, setTotalInput] = useState(() => String(deal.total_amount_usdc ?? ""));

  const total = parseFloat(totalInput) || 0;
  const allocated = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const remaining = Math.round((total - allocated) * 100) / 100;
  const balanced = Math.abs(remaining) < 0.005;

  const blank = rows.some((r) => !r.description.trim());
  // The server enforces the same sum rule (a mismatch is rejected with 400), so
  // block here rather than let the user submit into a guaranteed failure.
  const canPropose = rows.length > 0 && !blank && balanced && total > 0 && !submitting;

  const update = (i: number, key: keyof DraftMilestone, v: string) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, [key]: v } : r)));

  const distributeEvenly = () => {
    if (rows.length === 0 || total <= 0) return;
    const each = Math.floor((total / rows.length) * 100) / 100;
    // Give the rounding remainder to the last row so the sum lands exactly on
    // the total instead of a cent short.
    const last = Math.round((total - each * (rows.length - 1)) * 100) / 100;
    setRows((prev) => prev.map((r, i) => ({ ...r, amount: String(i === prev.length - 1 ? last : each) })));
  };

  return (
    <div className="surface-card rounded-xl p-5 space-y-4">
      <div>
        <p className="text-[13px] text-primary" style={labelStyle}>Edit terms</p>
        <p className="text-[12px] text-muted mt-0.5">
          Changes are sent to the other party for approval — nothing updates until they accept.
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] text-muted uppercase tracking-[0.06em]" style={labelStyle}>Total value (USDC)</p>
        <input
          type="number"
          value={totalInput}
          onChange={(e) => setTotalInput(e.target.value)}
          className="w-32 bg-[rgba(255,255,255,0.02)] border border-card-border rounded-lg px-3 py-2 text-[13px] text-foreground focus:outline-none focus:border-accent/50 transition-colors"
        />
      </div>

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[11px] text-subtle w-4 text-center shrink-0">{i + 1}</span>
            <input
              type="text"
              value={r.description}
              onChange={(e) => update(i, "description", e.target.value)}
              placeholder="Milestone description"
              className="flex-1 min-w-0 bg-[rgba(255,255,255,0.02)] border border-card-border rounded-lg px-3 py-2 text-[13px] text-foreground placeholder:text-subtle focus:outline-none focus:border-accent/50 transition-colors"
            />
            <input
              type="number"
              value={r.amount}
              onChange={(e) => update(i, "amount", e.target.value)}
              placeholder="USDC"
              className="w-24 shrink-0 bg-[rgba(255,255,255,0.02)] border border-card-border rounded-lg px-3 py-2 text-[13px] text-foreground placeholder:text-subtle focus:outline-none focus:border-accent/50 transition-colors"
            />
            {rows.length > 1 && (
              <button
                onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                className="text-subtle hover:text-danger transition-colors shrink-0"
                aria-label={`Remove milestone ${i + 1}`}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M1 1l10 10M11 1L1 11" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setRows((prev) => [...prev, { description: "", amount: "" }])}
            disabled={rows.length >= 10}
            className="text-[12px] text-accent hover:text-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 1v10M1 6h10" />
            </svg>
            Add milestone
          </button>
          {!balanced && rows.length > 0 && total > 0 && (
            <button onClick={distributeEvenly} className="text-[12px] text-muted hover:text-foreground transition-colors">
              Split evenly
            </button>
          )}
        </div>
        <span className={`text-[12px] ${balanced ? "text-success" : "text-warning"}`} style={labelStyle}>
          {balanced
            ? "✓ Total balanced"
            : remaining > 0
            ? `${remaining} USDC unallocated`
            : `${Math.abs(remaining)} USDC over`}
        </span>
      </div>

      {blank && (
        <p className="text-[12px] text-warning">Every milestone needs a description.</p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() =>
            onPropose({
              totalAmount: total,
              milestones: rows.map((r) => ({
                description: r.description.trim(),
                amount: Math.round((parseFloat(r.amount) || 0) * 100) / 100,
              })),
            })
          }
          disabled={!canPropose}
          className="btn-primary h-9 px-4 rounded-md text-[13px] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? "Sending…" : "Propose changes"}
        </button>
        <button onClick={onCancel} disabled={submitting} className="btn-ghost h-9 px-4 rounded-md text-[13px]">
          Cancel
        </button>
      </div>
    </div>
  );
}

/** The counterparty's view of an incoming proposal: what changed, accept/reject. */
function TermsProposalCard({
  proposal,
  current,
  mine,
  onAccept,
  onReject,
  busy,
}: {
  proposal: ProposedTerms;
  current: SupabaseDeal;
  mine: boolean;
  onAccept: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  const before = current.milestones ?? [];
  const after = proposal.milestones;
  const totalChanged = Math.abs((current.total_amount_usdc ?? 0) - proposal.totalAmount) > 0.005;

  return (
    <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 space-y-3">
      <div>
        <p className="text-[12px] text-accent uppercase tracking-[0.06em]" style={{ fontWeight: 510 }}>
          {mine ? "Changes proposed — awaiting their approval" : "Changes proposed"}
        </p>
        <p className="text-[12.5px] text-foreground mt-1">
          {mine
            ? "You proposed new terms. They apply once the other party accepts."
            : "The other party proposed new terms. Review the changes below."}
        </p>
      </div>

      {totalChanged && (
        <p className="text-[12.5px] text-foreground">
          Total{" "}
          <span className="text-muted line-through">${formatUsdc(current.total_amount_usdc ?? 0)}</span>{" "}
          → <b>${formatUsdc(proposal.totalAmount)}</b>
        </p>
      )}

      <div className="space-y-1">
        {after.map((m, i) => {
          const prev = before[i];
          const isNew = !prev;
          const descChanged = !isNew && prev.description !== m.description;
          const amtChanged = !isNew && Math.abs((prev.amount ?? 0) - m.amount) > 0.005;
          return (
            <div
              key={i}
              className="flex items-center justify-between gap-2 text-[12px] bg-[rgba(255,255,255,0.02)] border border-card-border-subtle rounded-md px-3 py-2"
            >
              <span className="truncate min-w-0 text-foreground">
                <span className="text-subtle mr-1.5">{i + 1}.</span>
                {m.description}
                {isNew && <span className="text-accent ml-2 text-[10px] uppercase">new</span>}
                {descChanged && <span className="text-warning ml-2 text-[10px] uppercase">edited</span>}
              </span>
              <span className="font-mono shrink-0">
                {amtChanged && <span className="text-muted line-through mr-1.5">${formatUsdc(prev.amount ?? 0)}</span>}
                <span className={amtChanged ? "text-warning" : "text-muted"}>${formatUsdc(m.amount)}</span>
              </span>
            </div>
          );
        })}
        {before.length > after.length && (
          <p className="text-[12px] text-danger">
            {before.length - after.length} milestone{before.length - after.length === 1 ? "" : "s"} removed
          </p>
        )}
      </div>

      {!mine && (
        <div className="flex gap-2 pt-1">
          <button onClick={onAccept} disabled={busy} className="btn-primary h-9 px-4 rounded-md text-[13px] disabled:opacity-40">
            {busy ? "Applying…" : "Accept changes"}
          </button>
          <button onClick={onReject} disabled={busy} className="btn-ghost h-9 px-4 rounded-md text-[13px] disabled:opacity-40">
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

function EscalatedRenegotiationPanel({
  role,
  notice,
  isOwnRequest,
  memoryReady,
  onOpenChat,
  onStartAgent,
  onAddRequest,
}: {
  role: "buyer" | "seller" | "observer";
  notice: RenegotiationNotice | null;
  isOwnRequest: boolean;
  memoryReady: boolean;
  onOpenChat: () => void;
  onStartAgent: () => void;
  onAddRequest: () => void;
}) {
  const requestLabel = isOwnRequest ? "Your request" : "Counterparty request";

  return (
    <div className="p-5 space-y-4">
      <div className="space-y-1">
        <p className="text-[13px] text-primary" style={labelStyle}>Renegotiation reopened</p>
        <p className="text-[12px] text-muted">
          The deal is back in negotiation. Continue here before accepting or deploying escrow.
        </p>
      </div>

      {notice?.content && (
        <div className="rounded-lg border border-warning/25 bg-warning/5 px-3 py-2.5 space-y-1">
          <p className="text-[11px] text-warning uppercase tracking-[0.06em]" style={{ fontWeight: 510 }}>
            {requestLabel}
          </p>
          <p className="text-[13px] text-foreground whitespace-pre-wrap">{notice.content}</p>
        </div>
      )}

      {role === "seller" && (
        <button onClick={onOpenChat} className="btn-primary h-10 px-4 rounded-md text-[13px]">
          Respond in negotiation chat
        </button>
      )}

      {role === "buyer" && (
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={onStartAgent}
            disabled={!memoryReady}
            className="btn-primary h-10 px-4 rounded-md text-[13px] disabled:opacity-50"
          >
            Run agent renegotiation
          </button>
          <button onClick={onAddRequest} className="btn-ghost h-10 px-4 rounded-md text-[13px]">
            Add request
          </button>
        </div>
      )}

      {role === "buyer" && !memoryReady && (
        <p className="text-[12px] text-warning">
          Complete agent setup before running the next negotiation round.
        </p>
      )}
    </div>
  );
}

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
  const profileName = profile?.display_name?.trim() || atDisplayHandle(profile?.handle);
  const displayName = wallet ? (profileName ?? handle ?? shortWallet) : "Not assigned yet";
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

/* ── Streamed negotiation turn (T-2) ───────────────────────────────────────
   One line in the live feed while agents negotiate. The round-0 seed is the
   buyer's opening; later rounds are agent counters/accepts/rejects. */
function NegotiationTurnLine({ revision }: { revision: Revision }) {
  const isSeed = revision.round === 0;
  const who = revision.onBehalfOf === "buyer" ? "Buyer agent" : "Seller agent";
  const label = isSeed
    ? "Opening offer"
    : revision.action === "accept"
    ? "Accepted"
    : revision.action === "reject"
    ? "Declined"
    : "Counter";
  const tone =
    revision.action === "accept"
      ? { color: "var(--success)", bg: "rgba(63,185,80,0.12)" }
      : revision.action === "reject"
      ? { color: "var(--danger)", bg: "rgba(248,113,113,0.12)" }
      : { color: "var(--accent)", bg: "rgba(113,112,255,0.12)" };
  const amount = revision.proposedTerms?.totalAmount;

  return (
    <div className="surface-card rounded-lg px-3 py-2.5 flex items-start gap-3">
      <span
        className="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 mt-0.5"
        style={{ color: "var(--subtle)", background: "rgba(255,255,255,0.04)" }}
      >
        {isSeed ? "start" : `R${revision.round}`}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12.5px] text-primary" style={{ fontWeight: 560 }}>{who}</span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full"
            style={{ color: tone.color, background: tone.bg, fontWeight: 600 }}
          >
            {label}
          </span>
          {typeof amount === "number" && (
            <span className="text-[11px] text-muted font-mono tabular-nums">${amount.toLocaleString()} USDC</span>
          )}
        </div>
        {revision.reasoning && (
          <p className="text-[12px] text-muted mt-1 leading-snug">{revision.reasoning}</p>
        )}
      </div>
    </div>
  );
}

/* ── Negotiation result ─────────────────────────────────────────────────── */

// Deposit breakdown shown to the buyer before funding: contract + their 0.5%
// platform fee + total to deposit. Fetches the live fee; renders nothing when
// there's no active fee (fee-free deals), so it's invisible until fees are on.
function FeeBreakdown({
  contractAmount,
  creatorWallet,
  creatorIsBuyer,
}: {
  contractAmount: number;
  creatorWallet: string | null;
  creatorIsBuyer: boolean;
}) {
  const { connection } = useConnection();
  // Resolve the BUYER's actual fee the way the contract does — via the
  // creator's tier, not the flat global rate. Without this the panel showed a
  // 1% fee (and a $0.51 total) for a deal whose SSS creator is charged 0%, so
  // Phantom asked for $0.50 and the numbers disagreed.
  const [state, setState] = useState<{ active: boolean; buyerBps: number } | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const fee = await fetchFeeConfig(connection);
      if (!fee.active || !creatorWallet) {
        if (alive) setState({ active: fee.active, buyerBps: 0 });
        return;
      }
      const buyerBps = await resolveBuyerFeeBps(connection, {
        globalFeeBps: fee.feeBps,
        creatorWallet: new PublicKey(creatorWallet),
        creatorIsBuyer,
      });
      if (alive) setState({ active: fee.active, buyerBps });
    })().catch(() => alive && setState({ active: false, buyerBps: 0 }));
    return () => { alive = false; };
  }, [connection, creatorWallet, creatorIsBuyer]);

  if (!state || !state.active) return null;
  const buyerFee = sideFeeLamports(contractAmount * 1_000_000, state.buyerBps) / 1_000_000;
  const total = contractAmount + buyerFee;
  return (
    <div className="space-y-1 pt-2 mt-1 border-t border-card-border-subtle text-[12px]">
      <div className="flex justify-between text-muted"><span>Contract</span><span className="tabular-nums">${formatUsdc(contractAmount)}</span></div>
      <div className="flex justify-between text-muted"><span>Platform fee ({(state.buyerBps / 100).toFixed(2)}%)</span><span className="tabular-nums">${formatUsdc(buyerFee)}</span></div>
      <div className="flex justify-between text-primary" style={{ fontWeight: 590 }}><span>Total to deposit</span><span className="tabular-nums">${formatUsdc(total)} USDC</span></div>
    </div>
  );
}

function NegotiationResult({
  proposal,
  role,
  deploying,
  deployError,
  onAccept,
  onRenegotiate,
  onReject,
  creatorWallet,
  creatorIsBuyer,
}: {
  proposal: Proposal;
  role: "buyer" | "seller" | "observer";
  deploying: boolean;
  deployError?: string | null;
  onAccept: (terms: DealParams) => void;
  onRenegotiate: () => void;
  onReject?: () => void;
  creatorWallet: string | null;
  creatorIsBuyer: boolean;
}) {
  const summary = proposal.summary;
  const finalTerms = proposal.finalTerms;
  const agreed = proposal.status === "agreed" && finalTerms;
  const isBuyer = role === "buyer";
  // Terms currently on the table when nothing was auto-agreed: the last
  // revision's proposed terms, falling back to the buyer's initial offer.
  const lastRevision = proposal.revisions[proposal.revisions.length - 1];
  const latestTerms: DealParams = lastRevision?.proposedTerms ?? proposal.initialTerms;
  // Whose figure is on the table matters: when the negotiation did NOT settle,
  // the last revision is often the COUNTERPARTY's un-accepted counter-offer, so
  // deploying it would fund an amount that was never agreed. Name it in the
  // confirm dialog so the buyer isn't blind-funding the seller's last demand.
  const latestBy = lastRevision?.onBehalfOf; // "buyer" | "seller" | undefined
  const latestFromSeller = latestBy === "seller";

  // Blocking confirmation before funding escrow at un-agreed terms. Modal state
  // rather than window.confirm — the action runs from the dialog's Confirm.
  const [acceptOpen, setAcceptOpen] = useState(false);
  const acceptAmount = latestTerms.totalAmount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const acceptWhose = latestFromSeller
    ? "the seller's last counter-offer — this was NOT a settled agreement"
    : "your last offer";

  function confirmAccept() {
    setAcceptOpen(true);
  }

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
          {/* Buyer sees the fee breakdown they'll deposit. */}
          {isBuyer && (
            <FeeBreakdown
              contractAmount={finalTerms.totalAmount}
              creatorWallet={creatorWallet}
              creatorIsBuyer={creatorIsBuyer}
            />
          )}
        </div>
      )}

      {/* Actions */}
      {isBuyer && agreed && finalTerms && (
        <div className="flex gap-3 pt-1">
          <button
            onClick={() => onAccept(finalTerms)}
            disabled={deploying}
            aria-busy={deploying}
            className="btn-primary flex-1 h-10 rounded-md text-[13px] flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
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
            className="btn-ghost h-10 px-4 rounded-md text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            Renegotiate
          </button>
        </div>
      )}
      {/* Reject-and-recycle (#19): drop this counterparty and reuse the invite
          link for someone else. Only before escrow (the whole result view is
          pre-deploy), and only when a counterparty is present to reject. */}
      {onReject && (
        <button
          onClick={onReject}
          disabled={deploying}
          className="btn-ghost h-9 px-4 rounded-md text-[12px] text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/50"
        >
          Reject &amp; find another counterparty
        </button>
      )}
      {isBuyer && agreed && finalTerms && deployError && (
        <p className="text-[12px] text-danger" role="alert">
          {deployError}
        </p>
      )}

      {!isBuyer && agreed && (
        <p className="text-[12px] text-muted pt-1 border-t border-card-border-subtle">
          Waiting for the buyer to accept and deploy the escrow.
        </p>
      )}

      {!agreed && (
        <div className="space-y-2">
          <div className="flex gap-3">
            {/* Buyer can still accept the terms on the table even when the AI
                recommends renegotiating (no auto-agreement was reached). */}
            {isBuyer && (
              <button
                onClick={confirmAccept}
                disabled={deploying}
                aria-busy={deploying}
                className="btn-primary flex-1 h-10 rounded-md text-[13px] flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                {deploying ? (
                  <>
                    <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 1 1-6.22-8.56" strokeLinecap="round" />
                    </svg>
                    Deploying…
                  </>
                ) : (
                  `Accept ${latestFromSeller ? "seller's" : "current"} terms ($${latestTerms.totalAmount.toLocaleString()}) & deploy`
                )}
              </button>
            )}
            <button onClick={onRenegotiate} disabled={deploying} className="btn-ghost h-9 px-4 rounded-md text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
              Renegotiate
            </button>
          </div>
          {isBuyer && deployError && (
            <p className="text-[12px] text-danger" role="alert">
              {deployError}
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={acceptOpen}
        title={`Deploy escrow at $${acceptAmount} USDC?`}
        body={
          <>
            <p style={{ margin: "0 0 10px" }}>
              These are {acceptWhose}. Escrow will be funded for this exact amount and split across{" "}
              {latestTerms.milestones.length} milestone(s).
            </p>
            <p style={{ margin: 0 }}>Continue?</p>
          </>
        }
        confirmLabel="Deploy escrow"
        busy={deploying}
        busyLabel="Deploying…"
        onCancel={() => setAcceptOpen(false)}
        onConfirm={() => { setAcceptOpen(false); onAccept(latestTerms); }}
      />
    </div>
  );
}

/* ── Shared conversation view ───────────────────────────────────────────── */

function ConversationView({ dealId, buyerView, myWallet }: { dealId: string; buyerView: boolean; myWallet: string | null }) {
  // SWR refreshInterval replaces the 4s poll (errors → empty list, same as the
  // old apiFetchSafe fallback). Memoized so the scroll effect's dep is stable.
  const { data } = useApi<{ messages?: DbMsg[] }>(
    `/api/messages?deal_id=${dealId}`, null, { refreshInterval: POLL_MS });
  const msgs = useMemo(() => data?.messages ?? [], [data]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevMsgCount = useRef(0);

  useEffect(() => {
    if (msgs.length > prevMsgCount.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMsgCount.current = msgs.length;
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

      <div className="px-4 py-4 space-y-3 max-h-112 overflow-y-auto">
        {msgs.map((m) => {
          if (m.role === "system") {
            return (
              <div key={m.id} className="flex justify-center">
                <div className="max-w-[88%] rounded-xl border border-warning/25 bg-warning/5 px-3.5 py-2.5 text-[12px] text-foreground leading-relaxed">
                  <p className="text-[10px] text-warning uppercase tracking-[0.06em] mb-1">Renegotiation</p>
                  <div className="whitespace-pre-wrap">{renderMarkdown(m.content)}</div>
                </div>
              </div>
            );
          }
          const isAgent = m.role === "assistant";
          // Align by SENDER identity, not just role: my own messages go right,
          // the counterparty's (and the agent's) go left — otherwise both human
          // parties render on the same side (bug #13). Fall back to the old
          // role-based split only when the message has no wallet to compare.
          const isMine = isAgent
            ? false
            : myWallet != null && m.wallet != null
            ? m.wallet === myWallet
            : !buyerView;
          const label = isAgent
            ? buyerView
              ? "Your agent"
              : "Buyer's agent"
            : isMine
            ? "You"
            : "Counterparty";
          return (
            <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[82%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                isMine ? "bg-brand text-white" : "surface-card text-foreground"
              }`}>
                <p className={`text-[10px] mb-1 ${isAgent ? "text-accent" : "opacity-70"}`}>
                  {label}
                </p>
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

type ChatMsg = { role: "user" | "assistant" | "system"; content: string; error?: boolean; wallet?: string };

type NegotiatedTerms = { totalAmount: number; milestones: Array<{ description: string; amount: number }> };

function ManualNegotiationPanel({
  deal,
  wallet,
  onBack,
  onAgree,
  onRenegotiate,
  mode = "assisted",
  party = "seller",
}: {
  deal: SupabaseDeal;
  wallet: string;
  onBack?: () => void;
  onAgree: (negotiatedTerms?: NegotiatedTerms) => void;
  /** Reopen the terms for renegotiation. Available to BOTH parties — previously
   *  only the buyer's result panel offered this, so a seller who wanted to
   *  revise had no way to ask (R7 #2). */
  onRenegotiate?: () => void;
  // "assisted": the buyer's AI agent auto-replies to each seller message.
  // "fully-manual": no auto-reply; a party can summon their OWN agent to draft a
  // reply on demand via a button (human↔human otherwise).
  mode?: "assisted" | "fully-manual";
  // Which side is using this panel. In fully-manual both parties get one; in
  // assisted mode only the seller does (the buyer is the auto-replying agent).
  party?: "seller" | "buyer";
}) {
  const fullyManual = mode === "fully-manual";
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [agreedByAgent, setAgreedByAgent] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState<NegotiatedTerms | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const openingFired = useRef(false);
  const prevManualMsgCount = useRef(0);

  // Load existing messages from Supabase on mount. In fully-manual mode BOTH
  // parties post as role "user", so we also read the message wallet to tell own
  // vs counterparty apart; re-poll so each party sees the other's new messages.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      apiFetchSafe<{ messages?: Array<{ role: string; content: string; wallet?: string }> }>(`/api/messages?deal_id=${deal.deal_id}`, {}, { messages: [] })
        .then((data) => {
          if (cancelled) return;
          const dbMsgs = data.messages ?? [];
          if (dbMsgs.length > 0) {
            setMessages(dbMsgs.map((m) => ({
              role: m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user",
              content: m.content,
              wallet: m.wallet,
            })));
          }
        });
    };
    load();
    // Fully-manual is human↔human, so poll for the counterparty's messages.
    const t = fullyManual ? setInterval(load, 4000) : null;
    return () => { cancelled = true; if (t) clearInterval(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal.deal_id, fullyManual]);

  // Auto-trigger buyer's agent opening message when conversation is empty.
  // Skipped in fully-manual mode — no agent speaks unless the seller summons it.
  useEffect(() => {
    if (fullyManual) return;
    if (messages.length > 0 || loading || openingFired.current) return;
    openingFired.current = true;
    setLoading(true);
    const dealContext = {
      title: deal.title,
      totalAmount: deal.total_amount_usdc,
      milestones: (deal.milestones ?? []).map((m) => ({ description: m.description, amount: m.amount })),
      buyerWallet: deal.buyer_wallet ?? "",
    };
    apiFetchSafe<{ response?: string }>("/api/negotiate/manual", {
      method: "POST",
      wallet,
      body: { dealId: deal.deal_id, messages: [], isOpening: true, sellerWallet: wallet, dealContext },
    }, {})
      .then((data) => {
        if (data.response) {
          setMessages([{ role: "assistant", content: data.response }]);
        }
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  useEffect(() => {
    if (messages.length > prevManualMsgCount.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevManualMsgCount.current = messages.length;
  }, [messages]);

  // Run the agent turn against a given transcript (which already ends with the
  // seller's message). Shared by send() and retry() so "Try again" re-runs the
  // same turn without re-appending the user message.
  async function runAgentTurn(transcript: ChatMsg[]) {
    setLoading(true);
    try {
      const dealContext = {
        title: deal.title,
        totalAmount: deal.total_amount_usdc,
        milestones: (deal.milestones ?? []).map((m) => ({ description: m.description, amount: m.amount })),
        buyerWallet: deal.buyer_wallet ?? "",
      };
      const data = await apiFetch<{ response: string; agreed?: boolean; agreedTerms?: typeof agreedTerms }>("/api/negotiate/manual", {
        method: "POST",
        wallet,
        body: { dealId: deal.deal_id, messages: transcript, sellerWallet: wallet, dealContext },
      });
      setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
      if (data.agreed) {
        setAgreedByAgent(true);
        if (data.agreedTerms) setAgreedTerms(data.agreedTerms);
      }
    } catch (err) {
      // The buyer's AI agent (server-side LLM) is unreachable. The seller can't
      // fix that (it's the server's key, not theirs) — but they aren't blocked:
      // they can accept the terms as-is or reject, and Try again re-runs the
      // turn once it's back. Render as a system notice, never as something the
      // agent "said" (bugs #11/#12).
      const configError = isAgentConfigError(err);
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          error: true,
          content: configError
            ? "The buyer's AI agent is unavailable right now. You can still accept the terms as-is or reject the deal — you don't need the agent to proceed."
            : err instanceof Error ? err.message : "The negotiation service is temporarily unavailable. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // Re-run the last agent turn: drop the trailing error notice and re-post the
  // transcript up to and including the seller's last message.
  async function retry() {
    if (loading) return;
    let transcript = messages;
    if (transcript[transcript.length - 1]?.error) {
      transcript = transcript.slice(0, -1);
      setMessages(transcript);
    }
    if (transcript.length === 0) return;
    await runAgentTurn(transcript);
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    if (!text) setInput("");

    const updated: ChatMsg[] = [...messages, { role: "user", content, wallet }];
    setMessages(updated);
    if (fullyManual) {
      // Human↔human: just persist this party's message so the counterparty sees
      // it; no agent reply unless they explicitly summon one.
      void apiFetchSafe(`/api/messages`, {
        method: "POST",
        wallet,
        body: { deal_id: deal.deal_id, role: "user", content, wallet },
      }, undefined);
      return;
    }
    await runAgentTurn(updated);
  }

  // Fully-manual: summon the seller's OWN agent to DRAFT a reply to the
  // conversation so far, placed in the input box for the seller to edit/send —
  // it is NOT auto-sent. Uses the seller's own LLM config (x-llm-* headers).
  async function draftWithAgent() {
    if (loading) return;
    setLoading(true);
    try {
      const dealContext = {
        title: deal.title,
        totalAmount: deal.total_amount_usdc,
        milestones: (deal.milestones ?? []).map((m) => ({ description: m.description, amount: m.amount })),
        buyerWallet: deal.buyer_wallet ?? "",
      };
      // In fully-manual both parties are stored as role "user", so tag the
      // transcript by OWNERSHIP (mine → "assistant", counterparty → "user") so
      // the model drafts as me responding to them. (The route flips one more time
      // for non-manual; here we've already normalized to the model's POV.)
      const draftMessages = messages.map((m) =>
        m.role === "system"
          ? m
          : { role: (m.wallet === wallet ? "user" : "assistant") as "user" | "assistant", content: m.content }
      );
      const data = await apiFetch<{ response: string }>("/api/negotiate/manual", {
        method: "POST",
        wallet,
        // Forward the caller's OWN LLM config (profile key) — this is "draft with
        // MY agent", so it must use the user's key, not the server's.
        headers: getLlmHeaders(wallet),
        body: {
          dealId: deal.deal_id,
          messages: draftMessages,
          sellerWallet: wallet,
          dealContext,
          // Draft from the CURRENT party's perspective (seller or buyer).
          draftForParty: party,
        },
      });
      // Drop the draft into the input for the seller to review/edit before send.
      if (data.response) setInput(data.response);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          error: true,
          content: isAgentConfigError(err)
            ? "Your agent isn't configured. Set it up in Agent Setup, or reply manually."
            : "Couldn't draft a reply right now. Please try again or reply manually.",
        },
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
            {fullyManual ? "Manual chat" : "Chat with buyer's agent"}
          </p>
          <p className="text-[12px] text-muted mt-0.5">
            {fullyManual
              ? "Reply by hand. Use “Draft with my agent” for an AI-suggested reply you can edit."
              : "Propose changes or accept the current terms directly."}
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
            m.role === "system" ? (
              <div key={i} className="flex justify-center">
                <div
                  className={`max-w-[88%] rounded-xl border px-3.5 py-2.5 text-[12px] text-foreground leading-relaxed ${
                    m.error ? "border-danger/30 bg-danger/5" : "border-warning/25 bg-warning/5"
                  }`}
                >
                  <p
                    className={`text-[10px] uppercase tracking-[0.06em] mb-1 ${
                      m.error ? "text-danger" : "text-warning"
                    }`}
                  >
                    {m.error ? "Couldn't reach the agent" : "Renegotiation"}
                  </p>
                  <div className="whitespace-pre-wrap">{renderMarkdown(m.content)}</div>
                  {m.error && i === messages.length - 1 && (
                    <button
                      type="button"
                      onClick={retry}
                      disabled={loading}
                      className="mt-2 text-[11px] text-accent hover:underline disabled:opacity-50"
                    >
                      {loading ? "Retrying…" : "Try again"}
                    </button>
                  )}
                </div>
              </div>
            ) : (() => {
              // Ownership: in fully-manual BOTH parties post as role "user", so
              // distinguish by wallet (mine = right). In assisted mode fall back
              // to role (the buyer's agent is "assistant" = left).
              const isMine = fullyManual
                ? (m.wallet ? m.wallet === wallet : m.role === "user")
                : m.role === "user";
              return (
              <div key={i} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                    isMine ? "bg-brand text-white" : "surface-card text-foreground"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{renderMarkdown(m.content)}</div>
                </div>
              </div>
              );
            })()
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
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={messages.length === 0 ? "Type your message…" : "Type your message or counteroffer…"}
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
          {/* Fully-manual: summon your own agent to draft a reply into the box. */}
          {fullyManual && (
            <button
              onClick={draftWithAgent}
              disabled={loading}
              className="btn-ghost h-8 px-3 rounded-md text-[12px] flex items-center gap-1.5 disabled:opacity-40"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
              </svg>
              {loading ? "Drafting…" : "Draft with my agent"}
            </button>
          )}
        </div>
      )}

      {/* Accept button */}
      {(agreedByAgent || messages.length > 0) && (() => {
        // Guard: if the agent proposed terms whose milestone amounts don't add up
        // to the total, don't let them slide silently into escrow. Surface an
        // explicit Confirm (auto-balances to the total) / Back-to-editing choice
        // instead of a dead-end message (bug #14).
        const milestones = agreedTerms?.milestones ?? [];
        const allocated = milestones.reduce((s, m) => s + (Number(m.amount) || 0), 0);
        const total = agreedTerms?.totalAmount ?? 0;
        const mismatch =
          agreedTerms != null && milestones.length > 0 && Math.abs(allocated - total) > 0.005;

        if (mismatch) {
          return (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3.5 space-y-3">
              <div className="space-y-1">
                <p className="text-[12px] text-warning uppercase tracking-[0.06em]" style={{ fontWeight: 510 }}>
                  Milestone amounts don&apos;t add up
                </p>
                <p className="text-[12.5px] text-foreground leading-relaxed">
                  The milestones total <b>${allocated.toLocaleString()}</b>, but the deal total is{" "}
                  <b>${total.toLocaleString()}</b>. Confirm to scale the milestones to match the total, or go back to adjust them.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    // Rescale milestone amounts proportionally to sum to the total.
                    const factor = allocated > 0 ? total / allocated : 0;
                    const balanced = milestones.map((m) => ({
                      ...m,
                      amount: Math.round((Number(m.amount) || 0) * factor * 100) / 100,
                    }));
                    onAgree({ totalAmount: total, milestones: balanced });
                  }}
                  className="btn-primary h-9 px-4 rounded-md text-[13px] flex-1"
                >
                  Confirm corrected allocation
                </button>
                <button
                  onClick={() => {
                    // Return to editing: clear the agreed state so the input re-opens.
                    setAgreedByAgent(false);
                    setAgreedTerms(null);
                  }}
                  className="btn-ghost h-9 px-4 rounded-md text-[13px]"
                >
                  Back to editing
                </button>
              </div>
            </div>
          );
        }

        return (
          <div className="flex gap-2">
            <button
              onClick={() => onAgree(agreedTerms ?? undefined)}
              className="btn-primary h-10 px-6 rounded-md text-[13px] flex-1"
            >
              {agreedByAgent ? "Confirm agreement ✓" : "Accept current terms as-is"}
            </button>
            {/* Either party can reopen the terms from the chat (R7 #2) — the
                seller previously had no renegotiate entry point at all. */}
            {onRenegotiate && (
              <button
                onClick={onRenegotiate}
                className="btn-ghost h-10 px-4 rounded-md text-[13px] shrink-0"
              >
                Renegotiate
              </button>
            )}
          </div>
        );
      })()}
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
    if (!wallet) {
      const timer = window.setTimeout(() => setLoading(false), 0);
      return () => window.clearTimeout(timer);
    }
    apiFetchSafe<{ friends?: FriendInviteEntry[] }>("/api/friends", { wallet }, { friends: [] })
      .then((data) => setFriends(data.friends ?? []))
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
  const router = useRouter();
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between px-6 h-14 border-b border-card-border-subtle bg-panel">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back"
            className="h-9 w-9 rounded-md text-muted hover:text-primary hover:bg-surface-hover transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <Link href="/app" className="flex items-center gap-2 text-primary">
            <SealedMark size={28} title="Sealed Agent" />
            <span className="text-[15px] tracking-tight" style={{ fontWeight: 510 }}>Sealed Agent</span>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <NotificationMenu wallet={wallet} />
          {wallet ? <WalletMenu /> : <WalletMultiButton />}
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

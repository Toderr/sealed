"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAppWallet as useWallet } from "@/lib/use-app-wallet";
import { useAppConnection as useConnection } from "@/lib/use-app-connection";
import { SealedMark } from "@/components/SealedLogo";
import { NotificationMenu } from "@/components/NotificationMenu";
import { useBusinessMemory } from "@/memory/localstorage-store";
import { getLlmHeaders } from "@/lib/llm-headers";
import { useProfileStore, encodeInvite } from "@/lib/profile-store";
import { useDealsStore } from "@/lib/deals-store";
import { atDisplayHandle } from "@/lib/user-display";
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
import { buildCreateDealIx, buildFundEscrowIx, buildEnsureAtaIx, getUsdcMint, getUsdcBalance, sendTx } from "@/lib/escrow-client";
import { MOCK_CHAIN, MOCK_DATA } from "@/lib/env";
import { mockEscrow } from "@/lib/mock-escrow";
import { PublicKey } from "@solana/web3.js";
import { renderMarkdown } from "@/lib/render-markdown";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { NegotiationBoundaries } from "@/memory/types";
import { AgentRole } from "@/agents/types";
import { ArrowLeft } from "lucide-react";

import WalletMultiButton from "@/components/AppWalletButton";

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

type EscalatedProposalArgs = {
  deal: SupabaseDeal;
  dealParams: DealParams;
  role: "buyer" | "seller" | "observer";
  buyerBoundaries: NegotiationBoundaries;
  sellerBoundaries: NegotiationBoundaries;
  renegotiationRequest: string;
  reason: string;
};

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

function isRateLimitedNegotiationError(message: string) {
  return /429|rate.?limit|temporarily rate-limited|quota/i.test(message);
}

function dealStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Draft",
    "seller-ready": "Counterparty reviewing",
    "seller-agreed": "Ready to fund",
    escalated: "Escalated",
    proposed: "Ready to sign",
    funded: "Funded",
    in_progress: "In progress",
    completed: "Sealed",
    refunded: "Refunded",
    disputed: "Disputed",
  };
  return labels[status] ?? status;
}

function buildEscalatedProposal({
  deal,
  dealParams,
  role,
  buyerBoundaries,
  sellerBoundaries,
  renegotiationRequest,
  reason,
}: EscalatedProposalArgs): Proposal {
  const now = Date.now();
  return {
    id: `${deal.deal_id}-escalated-${now}`,
    origin: "manual",
    buyerWallet: deal.buyer_wallet,
    sellerWallet: dealParams.sellerWallet ?? "",
    initialTerms: dealParams,
    revisions: [
      {
        round: 1,
        by: AgentRole.Negotiator,
        onBehalfOf: role === "seller" ? "seller" : "buyer",
        action: "counter",
        proposedTerms: dealParams,
        reasoning: renegotiationRequest,
        concessions: [],
        asks: [renegotiationRequest],
        timestamp: now,
      },
    ],
    status: "escalated",
    summary: {
      pros: ["Renegotiation request captured for both parties"],
      cons: ["The automated negotiation needs manual review before it can continue"],
      keyConcessions: [],
      riskFlags: [reason],
      confidenceScore: 0.35,
      recommendation: "renegotiate",
      recommendationReasoning: reason,
    },
    buyerBoundaries,
    sellerBoundaries,
    createdAt: now,
    updatedAt: now,
  };
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
  const dealId = Array.isArray(params.dealId) ? params.dealId[0] : params.dealId;
  const router = useRouter();

  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const wallet = publicKey?.toBase58() ?? null;

  const { memory } = useBusinessMemory(publicKey ?? null);
  const { profile } = useProfileStore(wallet);
  const { deals, addDeal, updateDeal } = useDealsStore(publicKey ?? null);

  const [deal, setDeal] = useState<SupabaseDeal | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
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
  const [renegotiationNotice, setRenegotiationNotice] = useState<RenegotiationNotice | null>(null);
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
        const escalated = localStorage.getItem(`sealed:deal-escalated:${dealId}`);
        if (escalated) {
          setDeal((prev) => {
            if (!prev || prev.status === "escalated") return prev;
            return { ...prev, status: "escalated" };
          });
        }
      } catch {}

      // Also poll Supabase for cross-device sync
      fetch(`/api/deals/${dealId}`)
        .then((r) => r.json())
        .then((data) => {
          console.log("[poll] status from Supabase:", data.deal?.status ?? "NOT FOUND");
          if (!data.deal) return; // Don't retryMirrorSync here — it would overwrite seller_wallet
          const updated = data.deal as SupabaseDeal;
          setDeal((prev) => {
            if (!prev) return updated;
            const sellerChanged = (updated.seller_wallet ?? "") !== (prev.seller_wallet ?? "");
            const statusChanged = updated.status !== prev.status;
            return sellerChanged || statusChanged ? updated : prev;
          });
        })
        .catch((e) => console.error("[poll] error:", e));
    }, 4000);

    return () => clearInterval(interval);
  }, [dealId]); // stable — never restarts

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
          setDeal((prev) => {
            if (!prev) return updated;
            const changed =
              updated.status !== prev.status ||
              (updated.seller_wallet ?? "") !== (prev.seller_wallet ?? "");
            return changed ? updated : prev;
          });
        }
      )
      .subscribe();

    return () => { supabaseBrowser.removeChannel(channel); };
  }, [dealId]);

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
      if (e.key === `sealed:deal-escalated:${dealId}` && e.newValue) {
        setDeal((prev) => {
          if (!prev || prev.status === "escalated") return prev;
          return { ...prev, status: "escalated" };
        });
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [dealId]);

  // Load the shared renegotiation request so the counterparty sees why the
  // terms were reopened, even on a different device.
  useEffect(() => {
    if (!dealId || deal?.status !== "escalated") {
      setRenegotiationNotice(null);
      return;
    }

    let cancelled = false;
    async function loadNotice() {
      try {
        const res = await fetch(`/api/messages?deal_id=${dealId}`);
        const data = (await res.json()) as { messages?: DbMsg[] };
        if (cancelled) return;
        const next = renegotiationNoticeFromMessages(data.messages ?? []);
        if (next) setRenegotiationNotice(next);
      } catch {}
    }

    loadNotice();
    const retry = window.setTimeout(loadNotice, 1200);
    const interval = window.setInterval(loadNotice, 4000);
    return () => {
      cancelled = true;
      window.clearTimeout(retry);
      window.clearInterval(interval);
    };
  }, [dealId, deal?.status]);

  // Redirect both parties once escrow is funded or deal is in any post-negotiate state.
  // Covers the case where the mirror call failed silently and Supabase still has
  // "seller-agreed" when the seller refreshes — they should never land back on negotiate.
  useEffect(() => {
    if (!deal) return;
    const postNeg = ["funded", "in_progress", "completed", "refunded", "disputed"];
    if (postNeg.includes(deal.status)) {
      router.push(`/deals/${deal.deal_id}`);
    }
  }, [deal?.status, deal?.deal_id, router]);

  // Fetch counterparty public profile
  useEffect(() => {
    if (!deal || !wallet) return;
    const cpWallet = deal.buyer_wallet === wallet ? deal.seller_wallet : deal.buyer_wallet;
    if (!cpWallet) return;
    fetch(`/api/users/${cpWallet}/public`)
      .then((r) => r.json())
      .then((data: PublicProfile) => {
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
  }, [deal?.status, role]);

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
        buyerWallet: deal.buyer_wallet,
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

  // Buyer auto-starts AI negotiation when seller signals they're using their agent
  useEffect(() => {
    if (!deal || deal.status !== "seller-ready") return;
    if (role !== "buyer" || negState.kind !== "idle" || !memory) return;
    startNegotiation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal?.status, role, negState.kind]);


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

  const markDealEscalated = useCallback(async (requestText: string) => {
    if (!deal || !wallet) return false;
    const previousStatus = deal.status;
    const createdAt = new Date().toISOString();
    const requestedByRole =
      deal.buyer_wallet === wallet ? "buyer" : deal.seller_wallet === wallet ? "seller" : "party";
    const requestLabel = requestedByRole === "buyer" ? "Buyer" : requestedByRole === "seller" ? "Seller" : "Counterparty";

    try {
      localStorage.setItem(`sealed:deal-escalated:${deal.deal_id}`, requestText || "1");
    } catch {}

    setRenegotiationNotice({ content: requestText, wallet, created_at: createdAt });
    setDeal((prev) => (prev ? { ...prev, status: "escalated" } : prev));

    try {
      try {
        const messageRes = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
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
          }),
        });
        if (!messageRes.ok) {
          console.warn("[renegotiate] Could not persist request message", await messageRes.text());
        }
      } catch (error) {
        console.warn("[renegotiate] Could not persist request message", error);
      }

      const res = await fetch(`/api/deals/${deal.deal_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-wallet": wallet },
        body: JSON.stringify({ status: "escalated" }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Could not update deal status");
      }
    } catch (error) {
      try {
        localStorage.removeItem(`sealed:deal-escalated:${deal.deal_id}`);
      } catch {}
      setRenegotiationNotice(null);
      setDeal((prev) => (prev ? { ...prev, status: previousStatus } : prev));
      throw error;
    }

    return true;
  }, [deal, wallet]);

  const startNegotiation = useCallback(async (renegotiationRequest?: string) => {
    if (!deal || !wallet || !memory) return;
    setDeployError(null);
    setNegState({ kind: "running" });

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
          buyerWallet: deal.buyer_wallet,
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
          renegotiationRequest,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `API error ${res.status}`);
      }

      const data = (await res.json()) as { proposal: Proposal };
      setNegState({ kind: "done", proposal: data.proposal });
      if (data.proposal.status === "escalated") {
        setDeal((prev) => (prev ? { ...prev, status: "escalated" } : prev));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Negotiation failed";
      if (renegotiationRequest && isRateLimitedNegotiationError(message)) {
        setNegState({
          kind: "done",
          proposal: buildEscalatedProposal({
            deal,
            dealParams,
            role,
            buyerBoundaries,
            sellerBoundaries,
            renegotiationRequest,
            reason: "The automated negotiation paused before reaching a clear agreement. Both parties should review the requested changes before signing.",
          }),
        });
        return;
      }
      setNegState({
        kind: "error",
        message,
      });
    }
  }, [deal, wallet, memory, role, dealParams]);

  // If the seller requests renegotiation, the buyer's room should actively
  // restart the agent flow instead of staying on a stale result.
  useEffect(() => {
    if (!deal || deal.status !== "escalated") return;
    if (role !== "buyer" || negState.kind !== "idle" || !memory) return;
    if (!renegotiationNotice?.content || renegotiationNotice.wallet === wallet) return;
    startNegotiation(renegotiationNotice.content);
  }, [
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

  async function handleAcceptAndDeploy(finalTerms: DealParams) {
    if (!publicKey || !signTransaction) {
      setDeployError("Connect a wallet that can sign this transaction.");
      return;
    }
    setDeploying(true);
    setDeployError(null);

    try {
      const mint = getUsdcMint();
      const balance = await getUsdcBalance(connection, publicKey, mint);
      if (balance < finalTerms.totalAmount) {
        setDeployError(
          `Insufficient devnet USDC. This wallet has ${formatUsdc(balance)} USDC but escrow needs ${formatUsdc(finalTerms.totalAmount)} USDC.`
        );
        setDeploying(false);
        return;
      }

      const ensureAtaIx = await buildEnsureAtaIx(publicKey, publicKey, mint);
      const createIx = await buildCreateDealIx(publicKey, finalTerms);
      const fundIx = await buildFundEscrowIx(publicKey, finalTerms.dealId, finalTerms.totalAmount);
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
        milestones: finalTerms.milestones.map((m) => ({
          description: m.description,
          amount: m.amount,
          status: "Pending",
        })),
        tx_signature: sig,
        status: "funded",
      };
      const mirrorHeaders = {
        "Content-Type": "application/json",
        "x-wallet": publicKey.toBase58(),
      };
      const mirrorPatch = {
        seller_wallet: mirroredDeal.seller_wallet,
        title: mirroredDeal.title,
        description: mirroredDeal.description,
        total_amount_usdc: mirroredDeal.total_amount_usdc,
        milestones: mirroredDeal.milestones,
        status: mirroredDeal.status,
      };

      setDeal((prev) =>
        prev
          ? {
              ...prev,
              seller_wallet: finalTerms.sellerWallet,
              title: mirroredDeal.title,
              description: mirroredDeal.description,
              total_amount_usdc: finalTerms.totalAmount,
              milestones: mirroredDeal.milestones,
              status: "funded",
            }
          : prev
      );
      try {
        sessionStorage.setItem(`deal:${finalTerms.dealId}`, JSON.stringify({
          buyer_wallet: publicKey.toBase58(),
          ...mirroredDeal,
        }));
      } catch {}

      try {
        const mirrorRes = await fetch("/api/deals/mirror", {
          method: "POST",
          headers: mirrorHeaders,
          body: JSON.stringify(mirroredDeal),
        });
        if (!mirrorRes.ok) {
          const mirrorErr = await mirrorRes.json().catch(() => ({}));
          console.error("Mirror sync failed:", mirrorErr);
          await fetch(`/api/deals/${finalTerms.dealId}`, {
            method: "PATCH",
            headers: mirrorHeaders,
            body: JSON.stringify(mirrorPatch),
          });
        }
      } catch {
        try {
          await fetch(`/api/deals/${finalTerms.dealId}`, {
            method: "PATCH",
            headers: mirrorHeaders,
            body: JSON.stringify(mirrorPatch),
          });
        } catch {
          // non-fatal
        }
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

            {/* Shared conversation view — buyer always, seller only in non-manual mode */}
            {!!deal.seller_wallet && !(role === "seller" && sellerView === "manual") && (
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
                      onAgree={async (negotiatedTerms?: { totalAmount: number; milestones: Array<{ description: string; amount: number }> }) => {
                        // Signal instantly to buyer's tab via localStorage
                        try {
                          localStorage.setItem(`sealed:seller-agreed:${deal.deal_id}`, "1");
                        } catch {}
                        // Update Supabase. PATCH first; if the deal row is missing
                        // (404) fall back to mirror upsert which creates-or-updates
                        // with the agreed status in one call so the buyer's poll
                        // and Realtime subscription can detect the change.
                        const finalAmount = negotiatedTerms?.totalAmount ?? deal.total_amount_usdc;
                        const finalMilestones = negotiatedTerms?.milestones ?? deal.milestones ?? [];
                        try {
                          const patchRes = await fetch(`/api/deals/${deal.deal_id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json", "x-wallet": wallet ?? "" },
                            body: JSON.stringify({
                              seller_wallet: wallet ?? "",
                              status: "seller-agreed",
                              total_amount_usdc: finalAmount,
                              milestones: finalMilestones,
                            }),
                          });
                          console.log("[onAgree] PATCH status:", patchRes.status);
                          if (!patchRes.ok) {
                            console.warn("[onAgree] PATCH failed, trying mirror fallback");
                            const mirrorRes = await fetch("/api/deals/mirror", {
                              method: "POST",
                              headers: { "Content-Type": "application/json", "x-wallet": deal.buyer_wallet },
                              body: JSON.stringify({
                                deal_id: deal.deal_id,
                                seller_wallet: wallet ?? "",
                                title: deal.title,
                                description: deal.description ?? "",
                                total_amount_usdc: finalAmount,
                                milestones: finalMilestones,
                                status: "seller-agreed",
                              }),
                            });
                            console.log("[onAgree] mirror fallback status:", mirrorRes.status);
                          }
                        } catch (e) { console.error("[onAgree] error:", e); }
                        setDeal((prev) => prev ? {
                          ...prev,
                          status: "seller-agreed",
                          total_amount_usdc: finalAmount,
                          milestones: finalMilestones,
                        } : prev);
                        const now = Date.now();
                        const terms: DealParams = {
                          dealId: deal.deal_id,
                          title: deal.title,
                          sellerWallet: deal.seller_wallet ?? wallet ?? "",
                          totalAmount: negotiatedTerms?.totalAmount ?? deal.total_amount_usdc,
                          milestones: (negotiatedTerms?.milestones ?? deal.milestones ?? []).map((m) => ({ description: m.description, amount: m.amount })),
                        };
                        setNegState({ kind: "done", proposal: {
                          id: `${deal.deal_id}-manual-${now}`, origin: "manual",
                          buyerWallet: deal.buyer_wallet, sellerWallet: deal.seller_wallet ?? "",
                          initialTerms: terms, revisions: [], status: "agreed", finalTerms: terms,
                          summary: { pros: ["Seller accepted the negotiated terms"], cons: [], keyConcessions: [], riskFlags: [], confidenceScore: 1, recommendation: "accept", recommendationReasoning: negotiatedTerms ? "Terms were updated during negotiation. Review the final values before deploying escrow." : "You accepted the original terms. Waiting for the buyer to deploy escrow." },
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

                  {/* ── BUYER — seller agreed (rendered directly, no useEffect lag) ── */}
                  {role === "buyer" && deal.status === "seller-agreed" && (
                    <NegotiationResult
                      proposal={{
                        id: `${deal.deal_id}-seller-agreed`,
                        origin: "manual",
                        buyerWallet: deal.buyer_wallet,
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
                      onRenegotiate={() => setRenegotiateOpen(true)}
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
                  deployError={deployError}
                  onAccept={handleAcceptAndDeploy}
                  onRenegotiate={() => setRenegotiateOpen(true)}
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

/* ── Negotiation result ─────────────────────────────────────────────────── */

function NegotiationResult({
  proposal,
  role,
  deploying,
  deployError,
  onAccept,
  onRenegotiate,
}: {
  proposal: Proposal;
  role: "buyer" | "seller" | "observer";
  deploying: boolean;
  deployError?: string | null;
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
        <button onClick={onRenegotiate} className="btn-ghost h-9 px-4 rounded-md text-[13px]">
          Renegotiate
        </button>
      )}
    </div>
  );
}

/* ── Shared conversation view ───────────────────────────────────────────── */

function ConversationView({ dealId, buyerView }: { dealId: string; buyerView: boolean }) {
  const [msgs, setMsgs] = useState<DbMsg[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevMsgCount = useRef(0);

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

      <div className="px-4 py-4 space-y-3 max-h-72 overflow-y-auto">
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

type ChatMsg = { role: "user" | "assistant" | "system"; content: string };

type NegotiatedTerms = { totalAmount: number; milestones: Array<{ description: string; amount: number }> };

function ManualNegotiationPanel({
  deal,
  wallet,
  onBack,
  onAgree,
}: {
  deal: SupabaseDeal;
  wallet: string;
  onBack?: () => void;
  onAgree: (negotiatedTerms?: NegotiatedTerms) => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [agreedByAgent, setAgreedByAgent] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState<NegotiatedTerms | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const openingFired = useRef(false);
  const prevManualMsgCount = useRef(0);

  // Load existing messages from Supabase on mount
  useEffect(() => {
    fetch(`/api/messages?deal_id=${deal.deal_id}`)
      .then((r) => r.json())
      .then((data) => {
        const dbMsgs: Array<{ role: string; content: string }> = data.messages ?? [];
        if (dbMsgs.length > 0) {
          setMessages(dbMsgs.map((m) => ({
            role: m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user",
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
    if (messages.length > prevManualMsgCount.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevManualMsgCount.current = messages.length;
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
      if (data.agreed) {
        setAgreedByAgent(true);
        if (data.agreedTerms) setAgreedTerms(data.agreedTerms);
      }
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
            m.role === "system" ? (
              <div key={i} className="flex justify-center">
                <div className="max-w-[88%] rounded-xl border border-warning/25 bg-warning/5 px-3.5 py-2.5 text-[12px] text-foreground leading-relaxed">
                  <p className="text-[10px] text-warning uppercase tracking-[0.06em] mb-1">Renegotiation</p>
                  <div className="whitespace-pre-wrap">{renderMarkdown(m.content)}</div>
                </div>
              </div>
            ) : (
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
            )
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
          onClick={() => onAgree(agreedTerms ?? undefined)}
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
    if (!wallet) {
      const timer = window.setTimeout(() => setLoading(false), 0);
      return () => window.clearTimeout(timer);
    }
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
          <WalletMultiButton />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

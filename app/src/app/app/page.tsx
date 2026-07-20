"use client";

import { Suspense, useMemo, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import ChatInterface, { PartialDeal } from "@/components/ChatInterface";
import SettingsModal from "@/components/SettingsModal";
import { useToast } from "@/components/Toast";
import { NotificationMenu } from "@/components/NotificationMenu";
import { useProfileStore } from "@/lib/profile-store";
import { purgeDealLocally } from "@/lib/deals-store";
import { POLL_MS } from "@/lib/swr";
import { atDisplayHandle, displayHandle } from "@/lib/user-display";
import { type DealParams, type PublicProfile, type SupabaseDeal, formatUsdc, usdcToLamports } from "@/lib/types";
import { useAppWallet as useWallet } from "@/lib/use-app-wallet";
import { useAppConnection as useConnection } from "@/lib/use-app-connection";
import { PublicKey } from "@solana/web3.js";
import { buildEnsureAtaIx, buildReleaseMilestoneIx, getUsdcMint, sendTx, fetchFeeConfig } from "@/lib/escrow-client";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { escrowAccountUrl } from "@/lib/explorer";
import { MOCK_CHAIN } from "@/lib/env";
import { mockEscrow } from "@/lib/mock-escrow";
import { apiFetch, apiFetchSafe, ApiError } from "@/lib/api-client";
import { retryWrite } from "@/lib/retry-write";
import { SealedMark } from "@/components/SealedLogo";
import { SealedBackdrop } from "@/components/SealedBackdrop";

import WalletMultiButton from "@/components/AppWalletButton";
import WalletMenu from "@/components/WalletMenu";

type CounterpartyProfile = Pick<PublicProfile, "handle" | "display_name" | "avatar_url">;

function isMilestoneDone(status: string | undefined) {
  const normalized = status?.toLowerCase();
  return normalized === "released" || normalized === "completed";
}

function inferDealStatus(deal: SupabaseDeal) {
  const raw = (deal.status ?? "").toLowerCase();
  const milestones = deal.milestones ?? [];
  if (milestones.length > 0 && milestones.every((m) => isMilestoneDone(m.status))) {
    return "completed";
  }
  if (raw === "inprogress") return "in_progress";
  if (raw === "created") return "draft";
  return raw;
}

function dealHref(deal: SupabaseDeal) {
  const status = inferDealStatus(deal);
  if (status === "draft" || status === "seller-ready" || status === "seller-agreed" || status === "manual-chat" || status === "proposed" || status === "escalated") {
    return `/negotiate/${deal.deal_id}`;
  }
  return `/deals/${deal.deal_id}`;
}

function getCounterpartyWallet(deal: SupabaseDeal, wallet: string | null) {
  if (!wallet) return null;
  return deal.buyer_wallet === wallet ? deal.seller_wallet : deal.buyer_wallet;
}

function counterpartyDisplayName(profile?: CounterpartyProfile | null) {
  const displayName = profile?.display_name?.trim();
  if (displayName) return displayName;
  const handle = atDisplayHandle(profile?.handle);
  if (handle) return handle;
  return "Counterparty joined";
}

function counterpartyInitials(profile?: CounterpartyProfile | null) {
  const source = profile?.display_name?.trim() || displayHandle(profile?.handle) || "CP";
  return source
    .replace(/^@/, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

async function fetchCounterpartyProfileMap(wallets: string[]) {
  const entries = await Promise.all(
    wallets.map(async (profileWallet) => {
      const profile = await apiFetchSafe<CounterpartyProfile | null>(
        `/api/users/${encodeURIComponent(profileWallet)}/public`,
        {},
        null
      );
      return profile ? ([profileWallet, profile] as const) : null;
    })
  );

  return Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, CounterpartyProfile]>);
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [livePartial, setLivePartial] = useState<PartialDeal | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [liveDeal, setLiveDeal] = useState<DealParams | null>(null);
  // Which side the creator takes for the deal being drafted. Chosen in the
  // pre-composer role step (below) before the chat/form opens; the agent can
  // also override it via creator_role in the parsed deal.
  const [creatorRole, setCreatorRole] = useState<"buyer" | "seller">("buyer");
  // Gates the composer: until the creator picks a side, the composer shows the
  // buyer/seller choice screen instead of the chat. Cleared on every open so
  // each new deal starts at the choice.
  const [roleChosen, setRoleChosen] = useState(false);

  const { publicKey } = useWallet();
  const { profile, loaded: profileLoaded } = useProfileStore(
    publicKey?.toBase58() ?? null
  );
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Deep-link: /app?compose=1 (or the legacy ?view=chat) opens the New Deal
  // composer, so links from other pages land users straight in it. Derived as
  // the initial state (not a post-mount effect) to avoid a cascading render;
  // the param is stripped from the URL below so refresh/back won't re-open it.
  const composeIntent =
    searchParams.get("compose") === "1" || searchParams.get("view") === "chat";
  const [composerOpen, setComposerOpen] = useState(composeIntent);

  // Redirect to onboarding if wallet connected but profile not set up.
  // Depend on the boolean, not the `profile` object: useProfileStore returns a
  // fresh object (JSON.parse) every render, so depending on it re-fired this
  // effect endlessly and looped /app ↔ /onboarding ↔ /profile.
  const onboardingComplete = profile?.onboardingComplete ?? false;
  const walletKey = publicKey?.toBase58() ?? null;
  useEffect(() => {
    if (profileLoaded && walletKey && !onboardingComplete) {
      router.replace("/onboarding");
    }
  }, [profileLoaded, walletKey, onboardingComplete, router]);

  // Strip the compose intent param once consumed, so a refresh/back doesn't
  // force the composer open again.
  useEffect(() => {
    if (composeIntent) router.replace("/app", { scroll: false });
  }, [composeIntent, router]);

  // Store drafted deal in state (display in LiveDealSheet; user navigates via button)
  async function handleDealDrafted(params: DealParams): Promise<void> {
    if (!publicKey) {
      toast.show({
        variant: "info",
        title: "Connect wallet first",
        description: "Connect your wallet to create a deal.",
      });
      return;
    }
    setLiveDeal(params);
    // The agent can set the creator's side in the parsed deal ("I'm the seller").
    if (params.creatorRole) setCreatorRole(params.creatorRole);
  }

  // Save draft and navigate to negotiation room (called from LiveDealSheet button)
  async function handleInviteCounterparty(params: DealParams): Promise<void> {
    if (!publicKey) return;

    const dealTitle = params.title ?? params.dealId;
    const me = publicKey.toBase58();
    // The creator takes the slot matching their chosen role; the counterparty
    // (entered wallet, if any) takes the opposite slot. The lifted toggle state is
    // the source of truth (falls back to the parsed deal, then buyer). The entered
    // counterparty is normalized to null when blank OR equal to the creator's own
    // wallet — so the slot stays genuinely empty (the deal won't appear on the
    // counterparty's board until they accept) and the two slots never collapse.
    const role = creatorRole ?? params.creatorRole ?? "buyer";
    // params.sellerWallet carries the COUNTERPARTY's wallet (an explicitly-entered
    // address, if any) — the seller when the creator is the buyer, the buyer when
    // the creator is the seller. Normalize to null when blank OR equal to the
    // creator's own wallet, so the two slots never collapse to one.
    const entered = params.sellerWallet?.trim() || null;
    const counterparty = entered && entered !== me ? entered : null;
    const buyer_wallet = role === "seller" ? counterparty : me;
    const seller_wallet = role === "seller" ? me : counterparty;

    const milestones = params.milestones.map((m) => ({
      description: m.description,
      amount: m.amount,
      status: "Pending",
      // Who uploads this milestone's proof (off-chain only). Defaults to
      // "seller"; omit when unset to keep the current behavior/shape.
      ...(m.proof_by ? { proof_by: m.proof_by } : {}),
    }));
    const description = params.milestones.map((m) => m.description).join(" | ");

    const draftDeal = {
      deal_id: params.dealId,
      buyer_wallet: buyer_wallet ?? "",
      seller_wallet: seller_wallet ?? "",
      title: dealTitle,
      description,
      total_amount_usdc: params.totalAmount,
      milestones,
      status: "draft",
      // Stamped so a 404 on a JUST-created deal is treated as "not synced yet"
      // (retry) rather than "deleted" (purge) — see fetchDeal in use-deal.ts.
      created_at: new Date().toISOString(),
    };
    try {
      sessionStorage.setItem(`deal:${params.dealId}`, JSON.stringify(draftDeal));
    } catch {
      // sessionStorage unavailable
    }

    // AWAIT the mirror write before navigating. Previously this was
    // fire-and-forget, so the negotiation room could GET the deal before the row
    // existed → a 404 "Deal not found" (which then purged the local draft,
    // making it permanent). Retried for transient blips; on hard failure we keep
    // the user here with their draft intact instead of stranding them.
    const synced = await retryWrite(() =>
      apiFetch("/api/deals/mirror", {
        method: "POST",
        wallet: me, // creator owns the row; mirror binds it to whichever slot they hold
        body: {
          deal_id: params.dealId,
          creator_role: role,
          buyer_wallet,
          seller_wallet,
          title: dealTitle,
          description,
          total_amount_usdc: params.totalAmount,
          milestones,
          status: "draft",
        },
      })
    );
    if (!synced) {
      toast.show({ variant: "error", title: "Couldn't save the deal — please try again." });
      return;
    }

    router.push(`/negotiate/${params.dealId}`);
  }

  // Bumped each time the composer opens so the chat remounts fresh (the old
  // standalone New Deal page started blank every visit; this matches that).
  const [composeSession, setComposeSession] = useState(0);

  function openComposer() {
    setComposeSession((n) => n + 1); // fresh ChatInterface on open
    setHasInteracted(false);
    setLivePartial(null);
    setLiveDeal(null);
    setCreatorRole("buyer");
    setRoleChosen(false); // start at the buyer/seller choice screen
    setComposerOpen(true);
  }

  function closeComposer() {
    setComposerOpen(false);
    // Reset the live-draft state so reopening starts clean.
    setHasInteracted(false);
    setLivePartial(null);
    setLiveDeal(null);
    setCreatorRole("buyer");
    setRoleChosen(false);
  }

  // Lock in the creator's side and reveal the composer. Called from the
  // pre-composer role-choice screen.
  function chooseRole(role: "buyer" | "seller") {
    setCreatorRole(role);
    setRoleChosen(true);
  }

  function toggleComposer() {
    if (composerOpen) closeComposer();
    else openComposer();
  }

  // The inline New Deal composer: the existing chat experience, hosted in the
  // board's collapse panel instead of a separate page. Keyed by composeSession
  // so each open mounts a fresh ChatInterface (no stale messages on reopen).
  const composer = !roleChosen ? (
    // Step 1: pick a side BEFORE drafting. Locks creatorRole, then the chat/form
    // opens with the counterparty fields labelled for the opposite slot.
    <RoleChoiceStep key={composeSession} onChoose={chooseRole} />
  ) : (
    <div key={composeSession} style={{ display: "grid", gridTemplateColumns: hasInteracted ? "1fr 360px" : "1fr", height: "100%", overflow: "hidden", transition: "grid-template-columns 0.35s ease" }}>
      <div style={{ overflow: "hidden", borderRight: hasInteracted ? "1px solid var(--card-border-subtle)" : "none", transition: "border-color 0.35s ease" }}>
        <ChatInterface
          creatorRole={creatorRole}
          onDealCreated={handleDealDrafted}
          onPartialDeal={setLivePartial}
          onFirstMessage={() => setHasInteracted(true)}
        />
      </div>
      {hasInteracted && (
        <LiveDealSheet
          partial={livePartial}
          deal={liveDeal}
          creatorRole={creatorRole}
          onInvite={handleInviteCounterparty}
        />
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-screen" style={{ position: "relative", background: "var(--background)" }}>
      <SealedBackdrop />

      {/* App Header */}
      <AppHeader onOpenSettings={() => setSettingsOpen(true)} />

      <main className="flex-1 overflow-hidden" style={{ position: "relative", zIndex: 1 }}>
        <DealsBoldBoard
          onNewDeal={toggleComposer}
          composerOpen={composerOpen}
          onCloseComposer={closeComposer}
          composer={composer}
        />
      </main>

      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}

/* ── AppHeader ── */
function AppHeader({
  onOpenSettings,
}: {
  onOpenSettings: () => void;
}) {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;

  // "New Deal" is no longer a tab — it opens the inline composer on the board.
  const tabs: { id: string; label: string; href?: string }[] = [
    { id: "deals", label: "Deals", href: "/app" },
    { id: "agent", label: "Agent", href: wallet ? `/profile/${wallet}?tab=agent` : "/profile" },
    { id: "profile", label: "Profile", href: wallet ? `/profile/${wallet}` : "/profile" },
  ];

  return (
    <header style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 22px",
      height: 52,
      borderBottom: "1px solid var(--card-border-subtle)",
      background: "var(--panel)",
      flexShrink: 0,
      position: "relative",
      zIndex: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--primary)" }}>
          <SealedMark size={24} />
          <span style={{ fontSize: 14, fontWeight: 510, letterSpacing: "-0.014em" }}>Sealed Agent</span>
        </div>
        <nav style={{ display: "flex", gap: 2 }}>
          {tabs.map((t) => {
            const isActive = t.id === "deals"; // this page is the deals board
            const style: React.CSSProperties = {
              padding: "0 11px",
              height: 30,
              fontSize: 13,
              fontWeight: 510,
              borderRadius: 6,
              color: isActive ? "var(--primary)" : "var(--muted)",
              background: isActive ? "rgba(255,255,255,0.05)" : "transparent",
              cursor: "pointer",
              border: 0,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
            };
            return (
              <Link key={t.id} href={t.href!} style={style}>
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <NotificationMenu wallet={wallet} />
        <button
          onClick={onOpenSettings}
          style={{
            height: 30,
            padding: "0 10px",
            borderRadius: 6,
            color: "var(--muted)",
            fontSize: 12,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "transparent",
            border: 0,
            cursor: "pointer",
          }}
          aria-label="Agent settings"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        {wallet ? <WalletMenu /> : <WalletMultiButton />}
      </div>
    </header>
  );
}

/* ── Deals Bold Board ── */
function DealsBoldBoard({
  onNewDeal,
  composerOpen,
  onCloseComposer,
  composer,
}: {
  onNewDeal: () => void;
  composerOpen: boolean;
  onCloseComposer: () => void;
  composer: React.ReactNode;
}) {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const toast = useToast();

  const [deals, setDeals] = useState<SupabaseDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [counterpartyProfiles, setCounterpartyProfiles] = useState<Record<string, CounterpartyProfile>>({});
  // Clicking a deal card opens this in the right-side detail panel.
  const [panelDeal, setPanelDeal] = useState<SupabaseDeal | null>(null);
  // Delete flow (#15): the deal pending a confirm-modal decision, + in-flight state.
  const [deleteTarget, setDeleteTarget] = useState<SupabaseDeal | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleConfirmDelete() {
    if (!deleteTarget || !wallet) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/deals/${encodeURIComponent(deleteTarget.deal_id)}`, {
        method: "DELETE",
        wallet,
      });
      // Clear the local copies too, or the deal reappears on refresh / stays
      // reachable by direct link (bug: delete didn't stick).
      purgeDealLocally(deleteTarget.deal_id, wallet);
      setDeals((prev) => prev.filter((d) => d.deal_id !== deleteTarget.deal_id));
      toast.show({ variant: "success", title: "Deal deleted" });
      setDeleteTarget(null);
    } catch (e) {
      toast.show({
        variant: "error",
        title: "Couldn't delete",
        description: e instanceof ApiError ? e.message : "Please try again.",
      });
    } finally {
      setDeleting(false);
    }
  }

  const counterpartyWallets = useMemo(() => {
    return Array.from(
      new Set(
        deals
          .map((deal) => getCounterpartyWallet(deal, wallet))
          .filter((value): value is string => Boolean(value))
      )
    );
  }, [deals, wallet]);

  useEffect(() => {
    if (!wallet) {
      setLoading(false); // eslint-disable-line react-hooks/set-state-in-effect
      return;
    }
    let cancelled = false;
    // Poll the mirror so the board reflects a counterparty's join/agree/fund/
    // status change without a manual refresh, matching the 4s sync the deal and
    // negotiate pages have (S7). apiFetchSafe never throws → a transient failure
    // keeps the last-good lanes instead of emptying the board.
    const load = () =>
      apiFetchSafe<{ deals?: SupabaseDeal[] }>("/api/deals/mirror", { wallet }, { deals: [] })
        .then((data) => {
          if (cancelled) return;
          const supabaseDeals: SupabaseDeal[] = data.deals ?? [];
          const sessionDeals = readSessionDeals(wallet);
          setDeals(mergeDedupe(supabaseDeals, sessionDeals));
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [wallet]);

  useEffect(() => {
    let cancelled = false;

    if (counterpartyWallets.length === 0) {
      setCounterpartyProfiles({}); // eslint-disable-line react-hooks/set-state-in-effect
      return;
    }

    fetchCounterpartyProfileMap(counterpartyWallets).then((profiles) => {
      if (!cancelled) setCounterpartyProfiles(profiles);
    });

    return () => {
      cancelled = true;
    };
  }, [counterpartyWallets]);

  const filtered = deals.filter((d) =>
    !search ||
    d.title.toLowerCase().includes(search.toLowerCase()) ||
    (d.deal_id ?? "").toLowerCase().includes(search.toLowerCase())
  );

  // Determine if a deal needs action from the current user
  function needsYourAction(deal: SupabaseDeal): boolean {
    if (!wallet) return false;
    const isBuyer = deal.buyer_wallet === wallet;
    const status = inferDealStatus(deal);
    if (status === "draft") return isBuyer; // buyer needs to invite
    if (status === "seller-agreed") return isBuyer; // buyer needs to fund
    if (status === "escalated") return true; // both sides should review reopened terms
    const hasReview = deal.milestones.some((m) => m.status === "In Review");
    if (hasReview && isBuyer) return true;
    return false;
  }

  const youLane = filtered.filter((d) => needsYourAction(d) && inferDealStatus(d) !== "completed");
  const themLane = filtered.filter((d) => !needsYourAction(d) && inferDealStatus(d) !== "completed");
  const doneLane = filtered.filter((d) => inferDealStatus(d) === "completed");

  const lanes: { id: string; title: string; color: string; caption: string; deals: SupabaseDeal[] }[] = [
    { id: "you",  title: "Waiting on you",  color: "var(--warning)", caption: "Action pending — these need your input", deals: youLane },
    { id: "them", title: "Waiting on them", color: "var(--accent)",  caption: "In progress — counterparty's move",     deals: themLane },
    { id: "done", title: "Sealed",          color: "var(--success)", caption: "Sealed deals",                          deals: doneLane },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Sub-header */}
      <div style={{ padding: "28px 32px 18px", borderBottom: "1px solid var(--card-border-subtle)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--accent)", margin: 0, fontWeight: 510 }}>
              Deal board
            </p>
            <h1 style={{ fontSize: 26, fontWeight: 590, letterSpacing: "-0.022em", color: "var(--primary)", margin: "6px 0 0" }}>
              What needs you today.
            </h1>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "6px 0 0" }}>
              Organized by who&apos;s holding the next action, not by date.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "0 12px", height: 32, borderRadius: 7, background: "var(--surface)", border: "1px solid var(--card-border)" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search deals"
                style={{ background: "transparent", border: 0, outline: "none", fontSize: 12, color: "var(--primary)", width: 180 }}
              />
            </div>
            <NewDealButton open={composerOpen} onClick={onNewDeal} />
          </div>
        </div>
      </div>

      {/* Inline New Deal composer — collapses in between the header and the board. */}
      <BoardComposer open={composerOpen} onClose={onCloseComposer}>
        {composer}
      </BoardComposer>

      {/* Board — hidden while the composer is open so the chat owns the space. */}
      <div style={{ flex: 1, overflow: "auto", padding: "20px 24px 32px", display: composerOpen ? "none" : "block" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <div style={{ display: "flex", gap: 4 }}>
              {[0, 150, 300].map((d) => (
                <span key={d} style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--muted)", animation: `sealed-pulse 1.2s ${d}ms infinite ease-in-out` }} />
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, minHeight: 0 }}>
            {lanes.map((lane) => (
              <section key={lane.id} style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: lane.color }} />
                    <span style={{ fontSize: 13, fontWeight: 590, color: "var(--primary)" }}>{lane.title}</span>
                    <span style={{
                      background: "transparent",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 9999,
                      padding: "2px 10px",
                      fontSize: 12,
                      fontWeight: 510,
                      color: "var(--muted)",
                    }}>{lane.deals.length}</span>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: "var(--subtle)", margin: "0 0 12px" }}>{lane.caption}</p>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {lane.deals.map((d) => (
                    <DealCardBold
                      key={d.deal_id}
                      deal={d}
                      laneColor={lane.color}
                      youAction={lane.id === "you"}
                      myWallet={wallet}
                      href={dealHref(d)}
                      onOpen={setPanelDeal}
                      onRequestDelete={setDeleteTarget}
                      counterpartyProfile={
                        getCounterpartyWallet(d, wallet)
                          ? counterpartyProfiles[getCounterpartyWallet(d, wallet) as string]
                          : null
                      }
                    />
                  ))}
                  {lane.deals.length === 0 && (
                    <div style={{
                      padding: "32px 16px",
                      borderRadius: 10,
                      border: "1px dashed var(--card-border)",
                      background: "transparent",
                      textAlign: "center",
                      fontSize: 12,
                      color: "var(--subtle)",
                    }}>
                      Nothing here.
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Right-side detail panel — opens on deal-card click, links to full page. */}
      <DealDetailPanel deal={panelDeal} myWallet={wallet} onClose={() => setPanelDeal(null)} />

      {/* Delete confirmation (#15) — only reachable for pre-escrow deals. */}
      {deleteTarget && (
        <div
          onClick={() => { if (!deleting) setDeleteTarget(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} className="modal-card" style={{ width: "100%", maxWidth: 420, borderRadius: 14, padding: 22 }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--primary)", margin: "0 0 6px" }}>Delete this deal?</p>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 18px", lineHeight: 1.5 }}>
              <b style={{ color: "var(--foreground)" }}>{deleteTarget.title || deleteTarget.deal_id}</b> will be permanently removed. This deal has no escrow yet, so no funds are affected. This can&apos;t be undone.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-ghost" disabled={deleting} onClick={() => setDeleteTarget(null)} style={{ height: 38, borderRadius: 8, fontSize: 13, flex: 1 }}>Cancel</button>
              <button
                disabled={deleting}
                onClick={handleConfirmDelete}
                style={{ height: 38, borderRadius: 8, fontSize: 13, flex: 1, background: "var(--danger)", color: "#fff", border: "none", fontWeight: 510, cursor: deleting ? "default" : "pointer", opacity: deleting ? 0.6 : 1 }}
              >
                {deleting ? "Deleting…" : "Delete deal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── New Deal button (board header, top-right) ── */
function NewDealButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="btn-primary"
      style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 32, padding: "0 14px", borderRadius: 7, fontSize: 13, fontWeight: 510 }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(45deg)" : "none", transition: "transform 0.2s ease" }}>
        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      {open ? "Close" : "New Deal"}
    </button>
  );
}

/* ── Inline collapse composer host — slides down between header and board ── */
function BoardComposer({
  open,
  children,
  onClose,
}: {
  open: boolean;
  children: React.ReactNode;
  onClose: () => void;
}) {
  // Smooth open/close via a grid-rows 0fr↔1fr transition (animates real content
  // height with no max-height jank, both directions). The wrapper stays mounted
  // so closing animates too.
  return (
    <div
      style={{
        flex: open ? 1 : "0 0 auto",
        minHeight: 0,
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        opacity: open ? 1 : 0,
        borderBottom: open ? "1px solid var(--card-border-subtle)" : "1px solid transparent",
        background: "var(--panel)",
        transition: "grid-template-rows 0.32s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease, border-color 0.32s ease",
      }}
      aria-hidden={!open}
    >
      <div style={{ overflow: "hidden", minHeight: 0 }}>
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 16px 0", flexShrink: 0 }}>
            <button
              onClick={onClose}
              aria-label="Close composer"
              style={{ background: "transparent", border: 0, color: "var(--muted)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ── Right-side deal detail panel (quick view + link to full page) ── */
function DealDetailPanel({
  deal,
  myWallet,
  onClose,
}: {
  deal: SupabaseDeal | null;
  myWallet: string | null;
  onClose: () => void;
}) {
  const open = !!deal;
  return (
    <>
      {/* scrim */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 40,
          background: "rgba(0,0,0,0.4)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.25s ease",
        }}
        aria-hidden={!open}
      />
      {/* panel */}
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(420px, 92vw)",
          zIndex: 41,
          background: "var(--panel)",
          borderLeft: "1px solid var(--card-border)",
          boxShadow: "var(--shadow-dialog)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
          display: "flex",
          flexDirection: "column",
        }}
        role="dialog"
        aria-label="Deal detail"
      >
        {deal && <DealDetailPanelBody deal={deal} myWallet={myWallet} onClose={onClose} />}
      </aside>
    </>
  );
}

type PanelMilestone = { description: string; amount: number; status?: string };

function DealDetailPanelBody({
  deal,
  myWallet,
  onClose,
}: {
  deal: SupabaseDeal;
  myWallet: string | null;
  onClose: () => void;
}) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const toast = useToast();
  // Local milestone state so upload/release reflect immediately in the panel
  // (the board's panelDeal is a snapshot). Mirrors deals/[id]'s pattern.
  const [milestones, setMilestones] = useState<PanelMilestone[]>(deal.milestones ?? []);
  const [busy, setBusy] = useState<number | null>(null);
  const [confirmRelease, setConfirmRelease] = useState<number | null>(null);
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const role: "buyer" | "seller" | "observer" = !myWallet
    ? "observer"
    : deal.buyer_wallet === myWallet ? "buyer"
    : deal.seller_wallet === myWallet ? "seller"
    : "observer";
  const shortBuyer = deal.buyer_wallet
    ? `${deal.buyer_wallet.slice(0, 4)}…${deal.buyer_wallet.slice(-4)}`
    : "—";
  const shortSeller = deal.seller_wallet
    ? `${deal.seller_wallet.slice(0, 4)}…${deal.seller_wallet.slice(-4)}`
    : "Awaiting counterparty";

  const done = milestones.filter((m) => isMilestoneDone(m.status)).length;
  const status = inferDealStatus({ ...deal, milestones });
  const releasedAmount = milestones
    .filter((m) => isMilestoneDone(m.status))
    .reduce((s, m) => s + (m.amount || 0), 0);
  // The next actionable milestone (first not-yet-released), mirroring deals/[id].
  const currentIndex = milestones.findIndex(
    (m) => !m.status || m.status === "Pending" || m.status === "In Review"
  );

  async function patchMilestones(updated: PanelMilestone[]) {
    await apiFetchSafe(`/api/deals/${deal.deal_id}`, {
      method: "PATCH", wallet: myWallet ?? "", body: { milestones: updated },
    }, undefined);
  }

  async function postMessage(content: string, msgRole = "user") {
    await apiFetchSafe("/api/messages", {
      method: "POST", wallet: myWallet ?? "", body: { deal_id: deal.deal_id, role: msgRole, content, wallet: myWallet },
    }, undefined);
  }

  // Seller: upload proof → milestone goes "In Review".
  async function handleUpload(file: File, index: number) {
    if (!myWallet) return;
    setBusy(index);
    try {
      const form = new FormData();
      form.append("file", file);
      try {
        await apiFetch("/api/upload", {
          method: "POST", rawBody: form,
          headers: { "x-wallet": myWallet, "x-deal-id": deal.deal_id, "x-milestone-index": String(index) },
        });
      } catch (e) {
        toast.show({ variant: "error", title: e instanceof ApiError ? e.message : "Upload failed" });
        return;
      }
      const updated = milestones.map((m, i) => (i === index ? { ...m, status: "In Review" } : m));
      setMilestones(updated);
      await patchMilestones(updated);
      await postMessage(`📎 Proof submitted for Milestone ${index + 1}: **${milestones[index].description}**. Awaiting buyer review.`);
    } finally {
      setBusy(null);
    }
  }

  // Buyer: release milestone → on-chain release + status "Released".
  async function handleRelease(index: number) {
    if (!publicKey || !signTransaction || !deal.seller_wallet) return;
    setBusy(index);
    setConfirmRelease(null);
    try {
      const sellerPubkey = new PublicKey(deal.seller_wallet);
      const mint = getUsdcMint();
      const ensureIx = await buildEnsureAtaIx(publicKey, sellerPubkey, mint);
      // Fee-bearing deals send the seller's fee half to the treasury on release,
      // so the treasury token account must be passed or the program reverts
      // (TreasuryAccountRequired). Mirrors funding + the deal-detail release.
      const fee = await fetchFeeConfig(connection);
      const treasuryTa = fee.active
        ? await getAssociatedTokenAddress(mint, new PublicKey(fee.treasury))
        : undefined;
      const releaseIx = await buildReleaseMilestoneIx(publicKey, deal.deal_id, index, sellerPubkey, treasuryTa);
      const sig = await sendTx(connection, [ensureIx, releaseIx], signTransaction);
      const updated = milestones.map((m, i) => (i === index ? { ...m, status: "Released" } : m));
      if (MOCK_CHAIN) {
        const allReleased = updated.every((m) => m.status === "Released");
        mockEscrow.releaseMilestone(deal.deal_id, sellerPubkey.toBase58(), usdcToLamports(milestones[index].amount), allReleased);
      }
      setMilestones(updated);
      await patchMilestones(updated);
      await postMessage(
        `✅ Milestone ${index + 1} approved. **${formatUsdc(milestones[index].amount)} USDC** released to seller.\n\nTx: \`${sig.slice(0, 8)}...${sig.slice(-8)}\``,
        "assistant"
      );
    } catch (err) {
      console.error("Release failed:", err);
      toast.show({ variant: "error", title: "Failed to release payment. Check console for details." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: "1px solid var(--card-border-subtle)" }}>
        <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent)", fontWeight: 590 }}>Deal detail</span>
        <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: 0, color: "var(--muted)", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
      </div>

      {/* body */}
      <div style={{ flex: 1, overflow: "auto", padding: "18px" }}>
        <h2 style={{ fontSize: 18, fontWeight: 590, color: "var(--primary)", margin: 0 }}>{deal.title || deal.deal_id}</h2>
        <div style={{ display: "flex", gap: 8, margin: "12px 0 16px" }}>
          <span style={{ fontSize: 12, fontWeight: 510, padding: "3px 10px", borderRadius: 7, background: "var(--surface)", border: "1px solid var(--card-border)", color: "var(--primary)" }}>
            {status}
          </span>
        </div>

        {/* parties */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          {[
            { label: "Buyer", val: shortBuyer, you: role === "buyer" },
            { label: "Seller", val: shortSeller, you: role === "seller" },
          ].map((p) => (
            <div key={p.label} style={{ padding: "10px 12px", background: "var(--surface)", borderRadius: 10, border: "1px solid var(--card-border)" }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--subtle)" }}>{p.label}{p.you ? " · you" : ""}</div>
              <div style={{ fontSize: 13, color: "var(--primary)", fontFamily: "ui-monospace, monospace", marginTop: 3 }}>{p.val}</div>
            </div>
          ))}
        </div>

        {/* total + released */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ padding: "12px 14px", background: "var(--surface)", borderRadius: 10, border: "1px solid var(--card-border)" }}>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Total</div>
            <div style={{ fontSize: 15, fontWeight: 590, color: "var(--primary)", fontFamily: "ui-monospace, monospace", marginTop: 2 }}>${formatUsdc(deal.total_amount_usdc)} USDC</div>
          </div>
          <div style={{ padding: "12px 14px", background: "var(--surface)", borderRadius: 10, border: "1px solid var(--card-border)" }}>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Released</div>
            <div style={{ fontSize: 15, fontWeight: 590, color: "var(--success)", fontFamily: "ui-monospace, monospace", marginTop: 2 }}>${formatUsdc(releasedAmount)} USDC</div>
          </div>
        </div>

        {/* milestones + actions */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--subtle)", marginBottom: 8 }}>
            Milestones · {done}/{milestones.length}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {milestones.map((m, i) => {
              const isReleased = isMilestoneDone(m.status);
              const isInReview = m.status === "In Review";
              const isCurrent = i === currentIndex;
              const working = busy === i;
              return (
                <div key={i} style={{ padding: "10px 12px", background: "var(--surface)", borderRadius: 9, border: "1px solid var(--card-border)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--foreground)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i + 1}. {m.description}</span>
                    <span style={{ fontSize: 11, color: isReleased ? "var(--success)" : isInReview ? "var(--warning)" : "var(--muted)", flexShrink: 0 }}>{m.status || "Pending"}</span>
                  </div>

                  {/* Seller: upload proof for the current pending milestone */}
                  {role === "seller" && isCurrent && !isReleased && !isInReview && (
                    <>
                      <input
                        ref={(el) => { fileRefs.current[i] = el; }}
                        type="file" style={{ display: "none" }}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, i); }}
                      />
                      <button
                        onClick={() => fileRefs.current[i]?.click()}
                        disabled={working}
                        className="btn-primary"
                        style={{ marginTop: 8, height: 32, width: "100%", borderRadius: 7, fontSize: 12 }}
                      >
                        {working ? "Uploading…" : "Upload proof"}
                      </button>
                    </>
                  )}

                  {/* Buyer: release the milestone once proof is in review */}
                  {role === "buyer" && isInReview && (
                    confirmRelease === i ? (
                      <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                        <button onClick={() => handleRelease(i)} disabled={working} className="btn-primary" style={{ flex: 1, height: 32, borderRadius: 7, fontSize: 12 }}>
                          {working ? "Releasing…" : `Confirm release $${formatUsdc(m.amount)}`}
                        </button>
                        <button onClick={() => setConfirmRelease(null)} disabled={working} className="btn-ghost" style={{ height: 32, padding: "0 12px", borderRadius: 7, fontSize: 12 }}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmRelease(i)} disabled={working} className="btn-primary" style={{ marginTop: 8, height: 32, width: "100%", borderRadius: 7, fontSize: 12 }}>
                        Release ${formatUsdc(m.amount)} USDC
                      </button>
                    )
                  )}
                </div>
              );
            })}
            {milestones.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--subtle)" }}>No milestones yet.</div>
            )}
          </div>
        </div>
      </div>

      {/* footer — escrow-account link (N8) + full page */}
      <div style={{ padding: "14px 18px", borderTop: "1px solid var(--card-border-subtle)", display: "flex", flexDirection: "column", gap: 8 }}>
        {(() => {
          const escrowUrl = escrowAccountUrl(deal.deal_id);
          return escrowUrl ? (
            <a
              href={escrowUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 34, borderRadius: 8, fontSize: 12, textDecoration: "none" }}
              title="Escrow account on Solana Explorer"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              View escrow on chain
            </a>
          ) : null;
        })()}
        <Link
          href={dealHref(deal)}
          className="btn-ghost"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 36, borderRadius: 8, fontSize: 13, fontWeight: 510, textDecoration: "none" }}
        >
          Open full page →
        </Link>
      </div>
    </>
  );
}

function DealCardBold({
  deal,
  laneColor,
  youAction,
  myWallet,
  href,
  onOpen,
  onRequestDelete,
  counterpartyProfile,
}: {
  deal: SupabaseDeal;
  laneColor: string;
  youAction: boolean;
  myWallet: string | null;
  href: string;
  onOpen?: (deal: SupabaseDeal) => void;
  onRequestDelete?: (deal: SupabaseDeal) => void;
  counterpartyProfile?: CounterpartyProfile | null;
}) {
  const isBuyer = deal.buyer_wallet === myWallet;
  const counterparty = getCounterpartyWallet(deal, myWallet);
  const counterpartyName = counterparty
    ? counterpartyDisplayName(counterpartyProfile)
    : "Awaiting counterparty";
  const cpInitials = counterparty ? counterpartyInitials(counterpartyProfile) : "?";

  const totalMs = (deal.milestones ?? []).length;
  const doneMs = (deal.milestones ?? []).filter((m) => isMilestoneDone(m.status)).length;

  const inReview = (deal.milestones ?? []).some((m) => m.status === "In Review");
  const displayStatus = inferDealStatus(deal);
  // Deletable only before escrow exists (#15) — funded/in-progress/completed
  // deals hold on-chain state and must not be removed.
  const canDelete =
    !!onRequestDelete &&
    ["draft", "seller-ready", "seller-agreed", "manual-chat", "proposed", "escalated"].includes(displayStatus);

  const statusLabel: Record<string, string> = {
    draft:          counterparty ? "Counterparty joined" : "Awaiting counterparty",
    "seller-ready": "Counterparty reviewing",
    "seller-agreed":"Ready to fund",
    escalated:      "Renegotiation requested",
    proposed:       "Ready to sign",
    funded:         "Funded",
    in_progress:    "In progress",
    completed:      "Sealed",
    refunded:       "Refunded",
    disputed:       "Disputed",
  };
  const statusTone: Record<string, string> = {
    draft:          "warning",
    "seller-ready": "warning",
    "seller-agreed":"accent",
    escalated:      "warning",
    proposed:       "accent",
    funded:         "accent",
    in_progress:    "accent",
    completed:      "success",
    refunded:       "danger",
    disputed:       "danger",
  };
  const tone = statusTone[displayStatus] ?? "neutral";

  // The quick-view panel is only for deals that already have escrow (href →
  // /deals/...). Pre-escrow deals still need the full negotiation page, so their
  // cards navigate normally.
  const usePanel = !!onOpen && href.startsWith("/deals/");

  return (
    <Link
      href={href}
      // Post-escrow: intercept the click to open the right-side detail panel
      // (upload proof / release milestone). Pre-escrow: let the Link navigate.
      onClick={usePanel ? (e) => { e.preventDefault(); onOpen!(deal); } : undefined}
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      style={{
        display: "block",
        color: "inherit",
        textDecoration: "none",
        borderRadius: 12,
        padding: 14,
        cursor: "pointer",
        position: "relative",
        background: "rgba(255, 255, 255, 0.065)",
        border: "1px solid rgba(255, 255, 255, 0.14)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.05) inset, 0 2px 4px rgba(0,0,0,0.25), 0 12px 28px -10px rgba(0,0,0,0.55)",
        backdropFilter: "blur(8px)",
        transition: "transform 150ms, border-color 150ms",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(113,112,255,0.25)";
        (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255, 255, 255, 0.14)";
        (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0)";
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 13, color: "var(--primary)", margin: 0, fontWeight: 590, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {deal.title || deal.deal_id}
          </p>
          <p style={{ fontSize: 11, color: "var(--subtle)", margin: "2px 0 0", fontFamily: "ui-monospace, monospace" }}>
            {deal.deal_id.slice(0, 18)}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <StatusPill tone={tone}>{statusLabel[displayStatus] ?? deal.status}</StatusPill>
          {canDelete && (
            <button
              type="button"
              className="icon-btn-danger"
              title="Delete deal"
              aria-label="Delete deal"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRequestDelete!(deal); }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Counterparty + role */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
        <div style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "linear-gradient(135deg, rgba(113,112,255,0.4), rgba(94,106,210,0.2))",
          color: "var(--accent)",
          fontSize: 10,
          fontWeight: 590,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          {cpInitials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {counterpartyName}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>
            You as <span style={{ color: "var(--foreground)" }}>{isBuyer ? "buyer" : "seller"}</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, color: "var(--primary)", fontWeight: 510, fontVariantNumeric: "tabular-nums", fontFamily: "ui-monospace, monospace" }}>
            ${deal.total_amount_usdc.toLocaleString()}
          </div>
          <div style={{ fontSize: 10, color: "var(--subtle)" }}>USDC</div>
        </div>
      </div>

      {/* Milestone dots */}
      {totalMs > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>Milestone {doneMs} of {totalMs}</span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {Array.from({ length: totalMs }).map((_, i) => (
              <div key={i} style={{
                flex: 1,
                height: 3,
                borderRadius: 999,
                background: i < doneMs ? laneColor : "var(--surface)",
              }} />
            ))}
          </div>
        </div>
      )}

      {youAction && (
        <div style={{
          marginTop: 12,
          padding: "8px 10px",
          borderRadius: 7,
          background: "rgba(251,191,36,0.06)",
          border: "1px solid rgba(251,191,36,0.2)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span style={{ fontSize: 11, color: "var(--warning)" }}>
            {inReview ? "Confirm milestone delivery" : "Action required — review deal"}
          </span>
        </div>
      )}
    </Link>
  );
}

/* ── StatusPill ── */
function StatusPill({ tone, children }: { tone: string; children: React.ReactNode }) {
  const tones: Record<string, { c: string; bg: string; bd: string }> = {
    neutral: { c: "var(--foreground)", bg: "transparent",              bd: "rgba(255,255,255,0.08)" },
    accent:  { c: "var(--accent)",     bg: "rgba(113,112,255,0.08)",   bd: "rgba(113,112,255,0.25)" },
    success: { c: "var(--success)",    bg: "rgba(16,185,129,0.08)",    bd: "rgba(16,185,129,0.25)" },
    warning: { c: "var(--warning)",    bg: "rgba(251,191,36,0.08)",    bd: "rgba(251,191,36,0.25)" },
    danger:  { c: "var(--danger)",     bg: "rgba(248,113,113,0.08)",   bd: "rgba(248,113,113,0.25)" },
    muted:   { c: "var(--muted)",      bg: "transparent",              bd: "rgba(255,255,255,0.05)" },
  };
  const t = tones[tone] ?? tones.neutral;
  return (
    <span style={{
      color: t.c,
      background: t.bg,
      border: `1px solid ${t.bd}`,
      borderRadius: 9999,
      padding: "2px 10px",
      fontSize: 11,
      fontWeight: 510,
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      lineHeight: 1.4,
      letterSpacing: "0.005em",
      flexShrink: 0,
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

/* ── Role choice (pre-composer step) ── */
// Shown before the chat/form opens: the creator decides whether they're the
// buyer (pays/funds) or the seller (provides). The choice locks creatorRole so
// every downstream slot (mirror, invite, board) is positioned correctly.
function RoleChoiceStep({ onChoose }: { onChoose: (role: "buyer" | "seller") => void }) {
  const options = [
    {
      role: "buyer" as const,
      label: "I'm the buyer",
      sub: "I pay and fund the escrow",
      detail: "You release each milestone once the work checks out.",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
          <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
          <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
        </svg>
      ),
    },
    {
      role: "seller" as const,
      label: "I'm the seller",
      sub: "I provide and get paid",
      detail: "You submit proof for each milestone; the buyer funds and releases.",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 7h-9" />
          <path d="M14 17H5" />
          <circle cx="17" cy="17" r="3" />
          <circle cx="7" cy="7" r="3" />
        </svg>
      ),
    },
  ];

  return (
    <div style={{ height: "100%", overflowY: "auto", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 20px" }}>
      <div style={{ width: "100%", maxWidth: 560 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <h2 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--primary)", margin: "0 0 6px" }}>
            Which side are you on?
          </h2>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
            Pick your role for this deal. The counterparty takes the other side.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {options.map((opt) => (
            <button
              key={opt.role}
              onClick={() => onChoose(opt.role)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10,
                textAlign: "left", padding: "20px 18px", borderRadius: 12, cursor: "pointer",
                background: "var(--surface)", border: "1px solid var(--card-border)",
                color: "var(--primary)", transition: "border-color 150ms, background 150ms",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--surface-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--card-border)"; e.currentTarget.style.background = "var(--surface)"; }}
            >
              <span style={{ color: "var(--accent)" }}>{opt.icon}</span>
              <span style={{ fontSize: 15, fontWeight: 590 }}>{opt.label}</span>
              <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 510 }}>{opt.sub}</span>
              <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.4 }}>{opt.detail}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Live Deal Sheet (Bold variant) ── */
function LiveDealSheet({
  partial,
  deal,
  creatorRole,
  onInvite,
}: {
  partial: PartialDeal | null;
  deal: DealParams | null;
  creatorRole: "buyer" | "seller";
  onInvite: (params: DealParams) => void;
}) {
  const CONTRACT_TYPE_LABELS: Record<string, string> = {
    sale: "Sale", service: "Service", partnership: "Partnership",
    rental: "Rental", nda: "NDA", other: "Other",
  };

  const title = deal?.title ?? partial?.title ?? null;
  const contractType = partial?.contract_type ?? null;
  const totalAmount = deal?.totalAmount ?? partial?.total_amount ?? null;
  const milestones: Array<{ description: string; amount: number }> = deal?.milestones ?? partial?.milestones ?? [];
  const milestoneCount = milestones.length;
  const plannedCap = milestones.reduce((sum, m) => sum + m.amount, 0);

  return (
    <aside style={{ background: "var(--panel)", display: "flex", flexDirection: "column", position: "relative", minHeight: 0 }}>
      <style>{`@keyframes sealed-ping{0%{transform:scale(1);opacity:.5}100%{transform:scale(2.2);opacity:0}}`}</style>

      {/* Header */}
      <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--card-border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 10, height: 10 }}>
            <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--accent)", opacity: 0.45, animation: "sealed-ping 1.6s ease-out infinite" }} />
            <span style={{ position: "relative", width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", display: "block" }} />
          </span>
          <span style={{ fontSize: 11, fontWeight: 590, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent)" }}>Live deal sheet</span>
        </div>
        <span style={{ color: "var(--muted)", fontFamily: "ui-monospace, monospace", fontSize: 11, background: "rgba(255,255,255,0.04)", border: "1px solid var(--card-border-subtle)", borderRadius: 4, padding: "2px 7px" }}>
          draft · {milestoneCount}
        </span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
        {!title && totalAmount == null && milestoneCount === 0 ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "48px 0", color: "var(--subtle)", textAlign: "center" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <span style={{ fontSize: 12 }}>Terms will appear here as you chat.</span>
          </div>
        ) : (
          <>
            {/* Title + type */}
            {(title || contractType) && (
              <div>
                {title && (
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 590, color: "var(--primary)", letterSpacing: "-0.014em", lineHeight: 1.3 }}>{title}</p>
                )}
                {contractType && (
                  <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--muted)" }}>{CONTRACT_TYPE_LABELS[contractType] ?? contractType}</p>
                )}
              </div>
            )}

            {/* Total bar */}
            {totalAmount != null && (
              <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "1px solid var(--card-border)", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 3 }}>Committed</div>
                  <div style={{ fontSize: 22, fontWeight: 590, color: "var(--primary)", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", fontFamily: "ui-monospace, monospace", lineHeight: 1 }}>
                    ${totalAmount.toLocaleString()}
                    <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 4, fontFamily: "inherit", fontWeight: 400, letterSpacing: 0 }}>USDC</span>
                  </div>
                </div>
                {plannedCap > 0 && Math.abs(plannedCap - totalAmount) > 0.01 && (
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 3 }}>Planned cap</div>
                    <div style={{ fontSize: 14, fontWeight: 510, color: "var(--muted)", fontFamily: "ui-monospace, monospace" }}>${plannedCap.toLocaleString()}</div>
                  </div>
                )}
              </div>
            )}

            {/* Milestones timeline */}
            {milestoneCount > 0 && (
              <div>
                <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 12, fontWeight: 510 }}>Milestones</div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {milestones.map((m, i) => {
                    const isLast = i === milestones.length - 1;
                    return (
                      <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 28 }}>
                          <span style={{
                            width: 28, height: 28, borderRadius: "50%",
                            background: "var(--accent)", color: "#fff",
                            fontSize: 11, fontWeight: 590,
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            boxShadow: "0 0 0 4px rgba(113,112,255,0.12)",
                            flexShrink: 0, position: "relative", zIndex: 1,
                          }}>{i + 1}</span>
                          {!isLast && (
                            <div style={{ width: 1, flex: 1, minHeight: 14, background: "rgba(113,112,255,0.2)", margin: "4px 0" }} />
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? 0 : 16 }}>
                          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                            <span style={{ fontSize: 13, color: "var(--primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.description}</span>
                            <span style={{ fontSize: 12, fontFamily: "ui-monospace, monospace", color: "var(--accent)", flexShrink: 0, fontWeight: 510 }}>${m.amount.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: "12px 20px 20px", borderTop: "1px solid var(--card-border-subtle)", display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
        {/* Your side is locked in the pre-composer choice step — shown here as a
            read-only reminder. Buyer pays/funds; seller provides. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 12px", borderRadius: 7, background: "var(--surface)", border: "1px solid var(--card-border)" }}>
          <span style={{ fontSize: 11, color: "var(--subtle)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Your side</span>
          <span style={{ fontSize: 12, fontWeight: 590, color: "var(--primary)" }}>
            {creatorRole === "seller" ? "Seller · you get paid" : "Buyer · you pay"}
          </span>
        </div>
        <button
          style={{ height: 36, borderRadius: 7, fontSize: 12, width: "100%", cursor: "pointer", color: "var(--muted)", background: "transparent", border: "1px solid var(--card-border)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => {/* milestone editor — future */}}
        >
          Edit milestones
        </button>
        <button
          style={{
            height: 40, borderRadius: 7, fontSize: 13, width: "100%",
            cursor: deal ? "pointer" : "default",
            background: deal ? "var(--accent)" : "rgba(113,112,255,0.25)",
            color: "#fff", border: "none",
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
            fontWeight: 510, opacity: deal ? 1 : 0.55,
          }}
          onClick={() => deal && onInvite(deal)}
          disabled={!deal}
        >
          Review &amp; invite counterparty
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </aside>
  );
}

/* ── Helpers ── */
function readSessionDeals(wallet: string): SupabaseDeal[] {
  const deals: SupabaseDeal[] = [];
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key?.startsWith("deal:")) continue;
      const raw = sessionStorage.getItem(key);
      if (!raw) continue;
      const deal = JSON.parse(raw) as SupabaseDeal;
      if (deal.buyer_wallet === wallet || deal.seller_wallet === wallet) deals.push(deal);
    }
  } catch {}
  return deals;
}

function mergeDedupe(supabase: SupabaseDeal[], session: SupabaseDeal[]): SupabaseDeal[] {
  const map = new Map<string, SupabaseDeal>();
  for (const d of session) map.set(d.deal_id, d);
  for (const d of supabase) map.set(d.deal_id, d);
  return Array.from(map.values()).sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });
}

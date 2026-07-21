"use client";

import { Suspense, useMemo, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppWallet as useWallet } from "@/lib/use-app-wallet";
import { SealedMark } from "@/components/SealedLogo";
import { NotificationMenu } from "@/components/NotificationMenu";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  useProfileStore,
  encodeInvite,
  LLM_MODELS,
  X402_MODELS,
  X402_TOP_UP_AMOUNTS,
  type LLMProvider,
} from "@/lib/profile-store";
import { useDealsStore, purgeDealLocally } from "@/lib/deals-store";
import { POLL_MS } from "@/lib/swr";
import { atDisplayHandle, displayHandle } from "@/lib/user-display";
import { FEATURE_X402, FEATURE_GET_VERIFIED } from "@/lib/env";
import { LLM_PROVIDERS } from "@/lib/llm-providers";
import type { Deal, AgentTemplate, NotificationPrefs, PublicProfile } from "@/lib/types";

import WalletMultiButton from "@/components/AppWalletButton";
import WalletMenu from "@/components/WalletMenu";
import { apiFetch, apiFetchSafe, ApiError } from "@/lib/api-client";

type ProfileMilestone = {
  description: string;
  amount: number;
  status?: string;
};

type MirrorDeal = {
  deal_id: string;
  buyer_wallet: string;
  seller_wallet: string | null;
  title: string;
  description?: string | null;
  total_amount_usdc: number | string;
  milestones: ProfileMilestone[];
  status: string;
  created_at?: string;
};

type ProfileDealRowData = {
  dealId: string;
  title: string;
  description: string;
  status: string;
  totalAmountUsdc: number;
  milestones: ProfileMilestone[];
  createdAt?: string;
  buyerWallet?: string;
  sellerWallet?: string | null;
};

type CounterpartyProfile = Pick<PublicProfile, "handle" | "display_name" | "avatar_url">;

type DealFilter = "all" | "active" | "sealed" | "needs_invite";
type DealSort = "newest" | "oldest" | "value_desc" | "value_asc" | "status";

const DEAL_FILTERS: { value: DealFilter; label: string }[] = [
  { value: "all", label: "All deals" },
  { value: "active", label: "Active" },
  { value: "sealed", label: "Sealed" },
  { value: "needs_invite", label: "Needs invite" },
];

const DEAL_SORTS: { value: DealSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "value_desc", label: "Highest value" },
  { value: "value_asc", label: "Lowest value" },
  { value: "status", label: "Status" },
];

function isDoneMilestone(status: string | undefined) {
  const normalized = status?.toLowerCase();
  return normalized === "released" || normalized === "completed";
}

function profileDealStatusKey(deal: ProfileDealRowData) {
  if (deal.milestones.length > 0 && deal.milestones.every((m) => isDoneMilestone(m.status))) {
    return "completed";
  }

  const raw = deal.status.toLowerCase();
  if (raw === "created") return "draft";
  if (raw === "inprogress") return "in_progress";
  return raw;
}

function isProfileDealSealed(deal: ProfileDealRowData) {
  return profileDealStatusKey(deal) === "completed";
}

function isProfileDealActive(deal: ProfileDealRowData) {
  const status = profileDealStatusKey(deal);
  return status !== "completed" && status !== "refunded" && status !== "disputed";
}

function fromLocalDeal(deal: Deal): ProfileDealRowData {
  return {
    dealId: deal.dealId,
    title: deal.dealId.replace(/-/g, " "),
    description: "",
    status: deal.status,
    totalAmountUsdc: deal.totalAmount / 1_000_000,
    buyerWallet: deal.buyer.toBase58(),
    sellerWallet: deal.seller.toBase58(),
    milestones: deal.milestones.map((m) => ({
      description: m.description,
      amount: m.amount / 1_000_000,
      status: m.status,
    })),
    createdAt: deal.createdAt ? new Date(deal.createdAt * 1000).toISOString() : undefined,
  };
}

function fromMirrorDeal(deal: MirrorDeal): ProfileDealRowData {
  return {
    dealId: deal.deal_id,
    title: deal.title || deal.deal_id.replace(/-/g, " "),
    description: deal.description ?? "",
    status: deal.status,
    totalAmountUsdc: Number(deal.total_amount_usdc) || 0,
    buyerWallet: deal.buyer_wallet,
    sellerWallet: deal.seller_wallet,
    milestones: (deal.milestones ?? []).map((m) => ({
      description: m.description,
      amount: Number(m.amount) || 0,
      status: m.status,
    })),
    createdAt: deal.created_at,
  };
}

function readSessionProfileDeals(wallet: string): ProfileDealRowData[] {
  const deals: ProfileDealRowData[] = [];
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key?.startsWith("deal:")) continue;
      const raw = sessionStorage.getItem(key);
      if (!raw) continue;
      const deal = JSON.parse(raw) as MirrorDeal;
      if (deal.buyer_wallet === wallet || deal.seller_wallet === wallet) {
        deals.push(fromMirrorDeal(deal));
      }
    }
  } catch {}
  return deals;
}

function mergeProfileDeals(...sources: ProfileDealRowData[][]) {
  const map = new Map<string, ProfileDealRowData>();
  for (const source of sources) {
    for (const deal of source) map.set(deal.dealId, deal);
  }
  return Array.from(map.values()).sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
}

function profileDealTimestamp(deal: ProfileDealRowData) {
  if (!deal.createdAt) return 0;
  const timestamp = new Date(deal.createdAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function profileDealStatusRank(deal: ProfileDealRowData) {
  const order: Record<string, number> = {
    draft: 0,
    "seller-ready": 1,
    "seller-agreed": 2,
    escalated: 3,
    proposed: 3,
    funded: 4,
    in_progress: 5,
    completed: 6,
    refunded: 7,
    disputed: 8,
  };
  return order[profileDealStatusKey(deal)] ?? 99;
}

function profileDealMatchesFilter(deal: ProfileDealRowData, filter: DealFilter) {
  if (filter === "all") return true;
  if (filter === "active") return isProfileDealActive(deal);
  if (filter === "sealed") return isProfileDealSealed(deal);
  return profileDealStatusKey(deal) === "draft" && !deal.sellerWallet;
}

function getProfileDealCounterpartyWallet(deal: ProfileDealRowData, wallet: string) {
  if (deal.buyerWallet === wallet) return deal.sellerWallet || null;
  if (deal.sellerWallet === wallet) return deal.buyerWallet || null;
  return deal.sellerWallet || deal.buyerWallet || null;
}

function counterpartyDisplayName(profile?: CounterpartyProfile | null) {
  const displayName = profile?.display_name?.trim();
  if (displayName) return displayName;
  const handle = atDisplayHandle(profile?.handle);
  if (handle) return handle;
  return "Counterparty joined";
}

async function fetchCounterpartyProfileMap(wallets: string[]) {
  const entries = await Promise.all(
    wallets.map(async (profileWallet) => {
      try {
        const profile = await apiFetch<CounterpartyProfile>(`/api/users/${encodeURIComponent(profileWallet)}/public`);
        return [profileWallet, profile] as const;
      } catch {
        return null;
      }
    })
  );

  return Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, CounterpartyProfile]>);
}

type SelfProfileTab = "overview" | "reviews" | "friends" | "settings";

function readRequestedTab(searchParams: { get(name: string): string | null }): SelfProfileTab {
  const tab = searchParams.get("tab");
  // Agent Setup moved under Settings (#12) — keep existing ?tab=agent links
  // working by resolving them to the Settings tab instead of dropping to
  // Overview.
  if (tab === "agent") return "settings";
  return tab === "reviews" || tab === "friends" || tab === "settings" ? tab : "overview";
}

export function SelfProfilePage() {
  return (
    <Suspense fallback={null}>
      <SelfProfilePageContent />
    </Suspense>
  );
}

export function SelfProfilePageContent() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const { profile, loaded, updateProfile } = useProfileStore(wallet);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const { deals } = useDealsStore(publicKey ?? null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<SelfProfileTab>(() => readRequestedTab(searchParams));
  // Select a tab AND persist it to ?tab=… so a refresh keeps it (clicking a tab
  // button previously only set state, so refresh reset to Overview).
  const selectTab = useCallback((tab: SelfProfileTab) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (tab === "overview") url.searchParams.delete("tab");
      else url.searchParams.set("tab", tab);
      window.history.replaceState(null, "", url.toString());
    }
  }, []);
  const [mirrorDeals, setMirrorDeals] = useState<ProfileDealRowData[]>([]);
  const [sessionDeals, setSessionDeals] = useState<ProfileDealRowData[]>([]);
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [counterpartyProfiles, setCounterpartyProfiles] = useState<Record<string, CounterpartyProfile>>({});
  const [dealSearch, setDealSearch] = useState("");
  const [dealFilter, setDealFilter] = useState<DealFilter>("all");
  const [dealSort, setDealSort] = useState<DealSort>("newest");
  const toast = useToast();
  // Delete flow — pre-escrow deals only, with a confirm modal (mirrors /app).
  const [deleteTarget, setDeleteTarget] = useState<ProfileDealRowData | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleConfirmDelete() {
    if (!deleteTarget || !wallet) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/deals/${encodeURIComponent(deleteTarget.dealId)}`, {
        method: "DELETE",
        wallet,
      });
      // Clear every client copy so it doesn't reappear on refresh or via link.
      purgeDealLocally(deleteTarget.dealId, wallet);
      setMirrorDeals((prev) => prev.filter((d) => d.dealId !== deleteTarget.dealId));
      setSessionDeals((prev) => prev.filter((d) => d.dealId !== deleteTarget.dealId));
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

  const localDeals = useMemo(() => deals.map(fromLocalDeal), [deals]);
  const profileDeals = useMemo(
    () => mergeProfileDeals(localDeals, sessionDeals, mirrorDeals),
    [localDeals, sessionDeals, mirrorDeals]
  );
  const counterpartyWallets = useMemo(() => {
    if (!wallet) return [];
    return Array.from(
      new Set(
        profileDeals
          .map((deal) => getProfileDealCounterpartyWallet(deal, wallet))
          .filter((value): value is string => Boolean(value))
      )
    );
  }, [profileDeals, wallet]);
  const visibleProfileDeals = useMemo(() => {
    const query = dealSearch.trim().toLowerCase();
    const next = profileDeals.filter((deal) => {
      const counterpartyWallet = wallet ? getProfileDealCounterpartyWallet(deal, wallet) : null;
      const counterpartyName = counterpartyWallet
        ? counterpartyDisplayName(counterpartyProfiles[counterpartyWallet])
        : "";
      const matchesQuery =
        !query ||
        deal.dealId.toLowerCase().includes(query) ||
        deal.title.toLowerCase().includes(query) ||
        deal.description.toLowerCase().includes(query) ||
        counterpartyName.toLowerCase().includes(query);
      return matchesQuery && profileDealMatchesFilter(deal, dealFilter);
    });

    return next.sort((a, b) => {
      if (dealSort === "oldest") return profileDealTimestamp(a) - profileDealTimestamp(b);
      if (dealSort === "value_desc") return b.totalAmountUsdc - a.totalAmountUsdc;
      if (dealSort === "value_asc") return a.totalAmountUsdc - b.totalAmountUsdc;
      if (dealSort === "status") return profileDealStatusRank(a) - profileDealStatusRank(b);
      return profileDealTimestamp(b) - profileDealTimestamp(a);
    });
  }, [counterpartyProfiles, dealFilter, dealSearch, dealSort, profileDeals, wallet]);

  useEffect(() => {
    setActiveTab(readRequestedTab(searchParams));
  }, [searchParams]);

  // Depend on the boolean, not the `profile` object (a fresh reference every
  // render), so this doesn't re-fire on every render like /app and /profile.
  const onboardingComplete = profile?.onboardingComplete ?? false;
  useEffect(() => {
    if (!loaded || !wallet) return;
    if (!onboardingComplete) {
      router.replace("/onboarding");
    }
  }, [loaded, wallet, onboardingComplete, router]);

  useEffect(() => {
    let cancelled = false;

    if (!wallet) {
      setMirrorDeals([]);
      setSessionDeals([]);
      return;
    }

    setSessionDeals(readSessionProfileDeals(wallet));

    // Poll the mirror so a counterparty's join/agree/fund/status change shows up
    // here without a manual refresh — matches the deal/negotiate pages' 4s sync,
    // which the profile list previously lacked (S7). apiFetchSafe never throws,
    // so a transient failure keeps the last-good list instead of clearing it.
    const load = () =>
      apiFetchSafe<{ deals?: MirrorDeal[] }>("/api/deals/mirror", { wallet }, { deals: [] }).then(
        (data) => {
          if (!cancelled) setMirrorDeals(((data.deals ?? []) as MirrorDeal[]).map(fromMirrorDeal));
        },
      );
    load();
    const interval = setInterval(load, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [wallet]);

  useEffect(() => {
    let cancelled = false;

    if (!wallet) {
      setPublicProfile(null);
      return;
    }

    apiFetch<PublicProfile>(`/api/users/${wallet}/public?self=1`)
      .then((data) => {
        if (!cancelled) setPublicProfile(data);
      })
      .catch(() => {
        if (!cancelled) setPublicProfile(null);
      });

    return () => {
      cancelled = true;
    };
  }, [wallet]);

  useEffect(() => {
    let cancelled = false;

    if (counterpartyWallets.length === 0) {
      setCounterpartyProfiles({});
      return;
    }

    fetchCounterpartyProfileMap(counterpartyWallets).then((profiles) => {
      if (!cancelled) setCounterpartyProfiles(profiles);
    });

    return () => {
      cancelled = true;
    };
  }, [counterpartyWallets]);

  if (!loaded) return null;

  if (!wallet) {
    return (
      <Shell>
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
          <div className="text-center space-y-2">
            <h1 className="text-[22px] text-primary" style={{ fontWeight: 590 }}>
              Connect your wallet to view your profile
            </h1>
            <p className="text-[14px] text-muted">
              Your Sealed identity is tied to your wallet.
            </p>
          </div>
          <WalletMultiButton />
        </div>
      </Shell>
    );
  }

  if (!profile?.onboardingComplete) {
    return null;
  }

  const activeDealCount = profileDeals.filter(isProfileDealActive).length;
  const sealedDealCount = profileDeals.filter(isProfileDealSealed).length;
  // Volume counts only SEALED (completed) deals — an awaiting/in-progress deal
  // isn't realized value and shouldn't inflate the headline number (bug #9).
  const totalVolumeUsdc = profileDeals
    .filter(isProfileDealSealed)
    .reduce((sum, d) => sum + d.totalAmountUsdc, 0);
  const averageRating = publicProfile?.avg_rating ?? 0;

  const initials = profile.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !wallet) return;
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const data = await apiFetchSafe<{ avatarUrl?: string }>("/api/profile/avatar", {
        method: "POST",
        wallet,
        rawBody: fd,
      }, {});
      if (data.avatarUrl) {
        updateProfile({ avatarUrl: data.avatarUrl });
      }
    } finally {
      setAvatarUploading(false);
      e.target.value = "";
    }
  }

  const activeLLM =
    profile.llmConfig?.mode === "own-key"
      ? profile.llmConfig.model
      : profile.llmConfig?.mode === "x402"
      ? profile.llmConfig.model
      : null;

  const x402Balance =
    profile.llmConfig?.mode === "x402" ? profile.llmConfig.balance : null;

  return (
    <Shell>
      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left: Profile card */}
            <aside className="lg:w-72 flex-shrink-0 space-y-4">
              <div className="surface-card rounded-xl p-5 space-y-4">
                {/* Avatar + name */}
                <div className="flex flex-col items-center text-center gap-3">
                  <label className="relative cursor-pointer group" title="Upload photo">
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      className="sr-only"
                      onChange={handleAvatarUpload}
                      disabled={avatarUploading}
                    />
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-brand/20 border border-brand/30 flex items-center justify-center text-[22px] text-brand" style={{ fontWeight: 590 }}>
                      {profile.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={profile.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                      ) : avatarUploading ? (
                        <svg className="animate-spin w-6 h-6 text-brand" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                      ) : (
                        initials
                      )}
                    </div>
                    <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                    </div>
                  </label>
                  <div>
                    <p className="text-[16px] text-primary" style={{ fontWeight: 590 }}>
                      {profile.name}
                    </p>
                    <p className="text-[13px] text-muted">
                      {atDisplayHandle(profile.username) ?? ""}
                    </p>
                  </div>
                </div>

                {/* Bio */}
                {profile.bio && (
                  <p className="text-[13px] text-foreground leading-relaxed text-center">
                    {profile.bio}
                  </p>
                )}

                {/* Company file */}
                {profile.companyFileName && (
                  <div className="flex items-center gap-2 rounded-md bg-surface-hover px-3 py-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-muted flex-shrink-0">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span className="text-[12px] text-muted truncate">
                      {profile.companyFileName}
                    </span>
                  </div>
                )}

                {/* Social links */}
                <SocialRow socials={profile.socials} />

                {/* LLM badge */}
                <div className="border-t border-card-border-subtle pt-3 space-y-2">
                  <p className="text-[11px] text-subtle" style={{ fontWeight: 510 }}>
                    Agent model
                  </p>
                  {activeLLM ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="pill-neutral text-accent truncate">{activeLLM}</span>
                      {x402Balance !== null && (
                        <span className="text-[11px] text-muted tabular-nums flex-shrink-0">
                          ${(x402Balance / 100).toFixed(2)} left
                        </span>
                      )}
                    </div>
                  ) : (
                    <Link
                      href={`/profile/${wallet}?tab=settings`}
                      className="text-[12px] text-warning hover:text-accent transition-colors"
                    >
                      No LLM configured — set up now →
                    </Link>
                  )}
                  {profile.llmConfig?.mode === "x402" && (
                    <Link
                      href={`/profile/${wallet}?tab=settings`}
                      className="flex items-center gap-1 text-[11px] text-muted hover:text-accent transition-colors"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                      Top up via x402
                    </Link>
                  )}
                </div>

                {/* Edit button → dedicated identity-edit page, not the onboarding wizard (N10) */}
                <Link
                  href="/profile/edit"
                  className="btn-ghost flex items-center justify-center gap-1.5 h-9 rounded-md text-[13px] w-full"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit profile
                </Link>
              </div>
            </aside>

            {/* Right: Dashboard */}
            <main className="flex-1 min-w-0 space-y-6">
              {publicProfile && !publicProfile.is_verified && (
                <VerifiedAccountBanner />
              )}

              {/* Tab bar — "Agent Setup" is no longer its own tab (#12); its
                  content now lives under Settings. */}
              <div className="flex gap-0.5 border-b border-card-border-subtle">
                {(["overview", "reviews", "friends", "settings"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => selectTab(tab)}
                    className={`px-4 h-9 text-[13px] rounded-t-md transition-colors capitalize ${
                      activeTab === tab
                        ? "text-primary border-b-2 border-accent -mb-px"
                        : "text-muted hover:text-primary"
                    }`}
                    style={{ fontWeight: activeTab === tab ? 590 : 400 }}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              {/* Overview tab */}
              {activeTab === "overview" && (
                <>
                  {/* Stats row */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    <StatCard label="Total deals" value={profileDeals.length} />
                    <StatCard label="Active" value={activeDealCount} accent />
                    <StatCard label="Sealed" value={sealedDealCount} />
                    <StatCard
                      label="Avg rating"
                      value={averageRating > 0 ? averageRating.toFixed(1) : "-"}
                      star={averageRating > 0}
                      onClick={averageRating > 0 ? () => selectTab("reviews") : undefined}
                    />
                    <StatCard
                      label="Volume (USDC)"
                      value={`$${totalVolumeUsdc.toLocaleString()}`}
                    />
                  </div>

                  {/* Deals */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h2
                        className="text-[14px] text-primary"
                        style={{ fontWeight: 590 }}
                      >
                        Your deals
                      </h2>
                      <Link
                        href="/app"
                        className="btn-primary h-8 px-4 rounded-md text-[12px] flex items-center gap-1.5"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        New deal
                      </Link>
                    </div>

                    {profileDeals.length === 0 ? (
                      <EmptyDeals />
                    ) : (
                      <>
                        <DealListControls
                          search={dealSearch}
                          filter={dealFilter}
                          sort={dealSort}
                          onSearchChange={setDealSearch}
                          onFilterChange={setDealFilter}
                          onSortChange={setDealSort}
                        />
                        {visibleProfileDeals.length === 0 ? (
                          <EmptyFilteredDeals
                            onReset={() => {
                              setDealSearch("");
                              setDealFilter("all");
                              setDealSort("newest");
                            }}
                          />
                        ) : (
                          <div className="space-y-2">
                            {visibleProfileDeals.map((deal) => (
                              <DealRow
                                key={deal.dealId}
                                deal={deal}
                                profile={profile}
                                wallet={wallet}
                                counterpartyProfile={
                                  getProfileDealCounterpartyWallet(deal, wallet)
                                    ? counterpartyProfiles[
                                        getProfileDealCounterpartyWallet(deal, wallet) as string
                                      ]
                                    : null
                                }
                                onRequestDelete={setDeleteTarget}
                              />
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}

              {/* Reviews tab (N7) — your own reviews, reachable from your profile */}
              {activeTab === "reviews" && <SelfReviewsTab wallet={wallet} />}

              {/* Friends tab */}
              {activeTab === "friends" && <FriendsTab wallet={wallet} />}

              {/* Settings tab — now hosts Agent Setup too (#12) */}
              {activeTab === "settings" && <SettingsTab wallet={wallet} />}
            </main>
          </div>
        </div>
      </div>

      {/* Delete confirmation — pre-escrow deals only, matches the board. */}
      {deleteTarget && (
        <div
          onClick={() => { if (!deleting) setDeleteTarget(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} className="modal-card" style={{ width: "100%", maxWidth: 420, borderRadius: 14, padding: 22 }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--primary)", margin: "0 0 6px" }}>Delete this deal?</p>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 18px", lineHeight: 1.5 }}>
              <b style={{ color: "var(--foreground)" }}>{deleteTarget.title || deleteTarget.dealId}</b> will be permanently removed. This deal has no escrow yet, so no funds are affected. This can&apos;t be undone.
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
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/* Shell                                                                */
/* ------------------------------------------------------------------ */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ProfileHeader />
      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  );
}

function ProfileHeader() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const profileHref = wallet ? `/profile/${wallet}` : "/profile";

  return (
    <header className="flex items-center justify-between px-4 sm:px-6 h-14 border-b border-card-border-subtle bg-panel">
      <div className="flex items-center gap-6">
        <Link href="/app" className="flex items-center gap-2 text-primary">
          <SealedMark size={24} title="Sealed" />
          <span className="text-[14px] tracking-tight" style={{ fontWeight: 510 }}>
            Sealed Agent
          </span>
        </Link>
        <nav className="flex items-center gap-0.5">
          <NavLink href="/app">
            Deals
          </NavLink>
          {/* "New Deal" removed from the nav here — the profile deals section
              already has a "+ New deal" button, so this was redundant (#7). */}
          {/* "Agent" removed from the nav (#13) — agent setup now lives under
              Profile → Settings. */}
          <NavLink href={profileHref} active>
            Profile
          </NavLink>
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <NotificationMenu wallet={wallet} />
        {wallet ? <WalletMenu /> : <WalletMultiButton />}
      </div>
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`px-3 h-8 text-[13px] rounded-md transition-colors flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
        active
          ? "bg-[rgba(255,255,255,0.05)] text-primary"
          : "text-muted hover:text-primary"
      }`}
      style={{ fontWeight: 510 }}
    >
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Small components                                                    */
/* ------------------------------------------------------------------ */

function DealListControls({
  search,
  filter,
  sort,
  onSearchChange,
  onFilterChange,
  onSortChange,
}: {
  search: string;
  filter: DealFilter;
  sort: DealSort;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: DealFilter) => void;
  onSortChange: (value: DealSort) => void;
}) {
  const controlClass =
    "h-10 rounded-md bg-surface border border-card-border px-3 text-[13px] text-primary outline-none transition-colors focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/60";

  return (
    <div className="surface-card rounded-xl p-3 mb-3">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_150px_170px] gap-3">
        <label className="space-y-1">
          <span className="block text-[11px] text-muted" style={{ fontWeight: 510 }}>
            Search
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Title, description, or deal ID"
            autoComplete="off"
            className={`${controlClass} w-full`}
          />
        </label>
        <label className="space-y-1">
          <span className="block text-[11px] text-muted" style={{ fontWeight: 510 }}>
            Filter
          </span>
          <select
            value={filter}
            onChange={(e) => onFilterChange(e.target.value as DealFilter)}
            className={`${controlClass} w-full cursor-pointer pr-9`}
          >
            {DEAL_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-[11px] text-muted" style={{ fontWeight: 510 }}>
            Sort
          </span>
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as DealSort)}
            className={`${controlClass} w-full cursor-pointer pr-9`}
          >
            {DEAL_SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function VerifiedAccountBanner() {
  return (
    <div className="surface-card rounded-xl border border-warning/25 bg-warning/10 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="space-y-1">
        <p className="text-[14px] text-primary" style={{ fontWeight: 590 }}>
          Become a verified account
        </p>
        <p className="text-[12px] text-muted leading-relaxed">
          Add account verification to raise trust signals on your profile and unlock more agent templates.
        </p>
      </div>
      {/* "Get verified" is gated behind a "coming soon" flag (#18) — it will
          become a paid feature. Disabled state until enabled. */}
      {FEATURE_GET_VERIFIED ? (
        <Link
          href="/profile/verify"
          className="btn-primary h-10 px-4 rounded-md text-[13px] flex items-center justify-center flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          Get verified
        </Link>
      ) : (
        <button
          type="button"
          disabled
          title="Coming soon"
          className="btn-primary h-10 px-4 rounded-md text-[13px] flex items-center justify-center flex-shrink-0 opacity-50 cursor-not-allowed"
        >
          Verification · Coming soon
        </button>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  star,
  onClick,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
  star?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <p className="text-[11px] text-muted mb-1" style={{ fontWeight: 510 }}>
        {label}
      </p>
      <div className="flex items-baseline gap-1.5">
        <p
          className={`text-[22px] ${accent ? "text-accent" : "text-primary"}`}
          style={{ fontWeight: 590 }}
        >
          {value}
        </p>
        {star && (
          <span className="text-[13px] text-warning" aria-label="stars">
            ★
          </span>
        )}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title="View reviews"
        className="surface-card rounded-xl p-4 text-left transition-colors hover:border-accent/60 cursor-pointer"
      >
        {body}
      </button>
    );
  }

  return <div className="surface-card rounded-xl p-4">{body}</div>;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft: { label: "Awaiting counterparty", color: "text-warning" },
  "seller-ready": { label: "Counterparty reviewing", color: "text-warning" },
  "seller-agreed": { label: "Ready to fund", color: "text-accent" },
  escalated: { label: "Escalated", color: "text-warning" },
  proposed: { label: "Ready to sign", color: "text-accent" },
  funded: { label: "Funded", color: "text-accent" },
  in_progress: { label: "In progress", color: "text-success" },
  completed: { label: "Sealed", color: "text-success" },
  refunded: { label: "Refunded", color: "text-danger" },
  disputed: { label: "Disputed", color: "text-danger" },
};

function localDealHref(deal: ProfileDealRowData) {
  const status = profileDealStatusKey(deal);
  return status === "draft" || status === "seller-ready" || status === "seller-agreed" || status === "proposed" || status === "escalated"
    ? `/negotiate/${deal.dealId}`
    : `/deals/${deal.dealId}`;
}

const PRE_ESCROW_DEAL_STATUSES = ["draft", "seller-ready", "seller-agreed", "proposed", "escalated"];

function DealRow({
  deal,
  profile,
  wallet,
  counterpartyProfile,
  onRequestDelete,
}: {
  deal: ProfileDealRowData;
  profile: { name: string; bio: string };
  wallet: string;
  counterpartyProfile?: CounterpartyProfile | null;
  onRequestDelete?: (deal: ProfileDealRowData) => void;
}) {
  const [copied, setCopied] = useState(false);
  const statusKey = profileDealStatusKey(deal);
  // Deletable only before escrow exists — mirrors the board card + server guard.
  const canDelete = !!onRequestDelete && PRE_ESCROW_DEAL_STATUSES.includes(statusKey);
  const counterpartyWallet = getProfileDealCounterpartyWallet(deal, wallet);
  const hasCounterparty = Boolean(counterpartyWallet);
  const status =
    statusKey === "draft" && hasCounterparty
      ? { label: "Counterparty joined", color: "text-accent" }
      : STATUS_LABEL[statusKey] ?? { label: "Unknown", color: "text-muted" };
  const needsCounterparty = statusKey === "draft" && !hasCounterparty;
  const counterpartyName = hasCounterparty
    ? counterpartyDisplayName(counterpartyProfile)
    : "No counterparty yet";

  function copyInvite() {
    const payload = {
      dealId: deal.dealId,
      dealTitle: deal.title || deal.dealId.replace(/-/g, " "),
      inviterName: profile.name,
      inviterWallet: wallet,
      inviterRole: (deal.sellerWallet === wallet ? "seller" : "buyer") as "buyer" | "seller",
      amount: deal.totalAmountUsdc,
      currency: "USDC",
      milestoneCount: deal.milestones.length,
      milestones: deal.milestones.map((m) => ({ description: m.description, amount: m.amount })),
      description: deal.description || profile.bio,
    };
    const token = encodeInvite(payload);
    const link = `${window.location.origin}/invite/${encodeURIComponent(token)}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="surface-card rounded-lg px-4 py-3 flex items-center justify-between gap-4 hover:bg-surface-hover/50 transition-colors">
      <Link
        href={localDealHref(deal)}
        className="min-w-0 flex-1 flex items-center justify-between gap-4 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
      <div className="min-w-0">
        <p className="text-[13px] text-primary truncate" style={{ fontWeight: 510 }}>
          {deal.title || deal.dealId}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-muted truncate">
            {hasCounterparty ? `With ${counterpartyName}` : counterpartyName}
          </span>
          <span className="text-subtle text-[11px]">·</span>
          <span className={`text-[11px] ${status.color}`}>{status.label}</span>
          <span className="text-subtle text-[11px]">·</span>
          <span className="text-[11px] text-muted">
            {deal.milestones.length} milestone{deal.milestones.length !== 1 ? "s" : ""}
          </span>
        </div>
        </div>
        <span className="text-[13px] text-primary tabular-nums flex-shrink-0" style={{ fontWeight: 590 }}>
          ${deal.totalAmountUsdc.toLocaleString()} USDC
        </span>
      </Link>
      <div className="flex items-center gap-2 flex-shrink-0">
        {needsCounterparty && (
          <button
            type="button"
            onClick={copyInvite}
            className={`text-[11px] px-3 h-10 rounded border transition-colors flex items-center gap-1 ${
              copied
                ? "border-success/40 text-success"
                : "border-card-border text-muted hover:text-primary hover:border-accent/40"
            }`}
            title="Copy invite link"
          >
            {copied ? "Copied" : "Invite"}
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            className="icon-btn-danger"
            title="Delete deal"
            aria-label="Delete deal"
            onClick={() => onRequestDelete!(deal)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyDeals() {
  return (
    <div className="surface-card rounded-xl flex flex-col items-center justify-center py-16 gap-4 text-center">
      <div className="w-12 h-12 rounded-full bg-surface-hover flex items-center justify-center">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      </div>
      <div>
        <p className="text-[14px] text-primary" style={{ fontWeight: 510 }}>
          No deals yet
        </p>
        <p className="text-[13px] text-muted mt-0.5">
          Start your first deal and let your agent negotiate for you.
        </p>
      </div>
      <Link
        href="/app"
        className="btn-primary h-9 px-5 rounded-md text-[13px] flex items-center gap-1.5"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Create your first deal
      </Link>
    </div>
  );
}

function EmptyFilteredDeals({ onReset }: { onReset: () => void }) {
  return (
    <div className="surface-card rounded-xl flex flex-col items-center justify-center py-12 gap-3 text-center">
      <div className="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </div>
      <div>
        <p className="text-[14px] text-primary" style={{ fontWeight: 510 }}>
          No matching deals
        </p>
        <p className="text-[13px] text-muted mt-0.5">
          Adjust the search, filter, or sort controls to see more deals.
        </p>
      </div>
      <button
        type="button"
        onClick={onReset}
        className="btn-ghost h-9 px-4 rounded-md text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        Reset filters
      </button>
    </div>
  );
}

function SocialRow({
  socials,
}: {
  socials: {
    twitter: string;
    telegram: string;
    instagram: string;
    linkedin: string;
    website: string;
  };
}) {
  const links = [
    { key: "twitter", url: socials.twitter, label: "X" },
    { key: "telegram", url: socials.telegram, label: "TG" },
    { key: "instagram", url: socials.instagram, label: "IG" },
    { key: "linkedin", url: socials.linkedin, label: "LI" },
    { key: "website", url: socials.website, label: "Web" },
  ].filter((l) => l.url);

  if (links.length === 0) return null;

  return (
    // Centered to match the centered profile card layout (#17).
    <div className="flex flex-wrap gap-2 justify-center">
      {links.map((l) => (
        <a
          key={l.key}
          href={
            l.url.startsWith("http")
              ? l.url
              : `https://${l.url}`
          }
          target="_blank"
          rel="noopener noreferrer"
          className="pill-neutral hover:text-accent hover:border-accent/30 transition-colors"
        >
          {l.label}
        </a>
      ))}
    </div>
  );
}

/* ── Agent Setup Tab ──────────────────────────────────────────────────────── */

const STYLE_LABELS: Record<string, string> = {
  firm: "Firm",
  flexible: "Flexible",
  collaborative: "Collaborative",
};

type LlmMode = "own-key" | "x402";

function isLlmProvider(value: string | undefined): value is LLMProvider {
  return Boolean(value && value in LLM_MODELS);
}

function AiProviderPanel({ wallet }: { wallet: string }) {
  const { profile, updateProfile } = useProfileStore(wallet);
  const toast = useToast();
  const [llmMode, setLlmMode] = useState<LlmMode>("own-key");
  const [llmProvider, setLlmProvider] = useState<LLMProvider>("anthropic");
  const [llmModel, setLlmModel] = useState("claude-sonnet-4-6");
  const [llmKey, setLlmKey] = useState("");
  const [showLlmKey, setShowLlmKey] = useState(false);
  const [llmSaved, setLlmSaved] = useState(false);
  const [x402Model, setX402Model] = useState(X402_MODELS[0].id);
  const [x402TopUpAmount, setX402TopUpAmount] = useState(10);
  const [topping, setTopping] = useState(false);

  useEffect(() => {
    if (profile?.llmConfig?.mode === "own-key") {
      const provider = isLlmProvider(profile.llmConfig.provider)
        ? profile.llmConfig.provider
        : "anthropic";
      setLlmMode("own-key");
      setLlmProvider(provider);
      setLlmModel(profile.llmConfig.model || LLM_MODELS[provider][0]);
      setLlmKey(profile.llmConfig.apiKey);
    } else if (profile?.llmConfig?.mode === "x402") {
      // x402 is gated (#10) — fall back to own-key when the feature is off so a
      // previously-saved x402 config doesn't select a disabled tab.
      setLlmMode(FEATURE_X402 ? "x402" : "own-key");
      setX402Model(profile.llmConfig.model);
    }
  }, [profile]);

  function saveLlmConfig() {
    const existingBalance =
      profile?.llmConfig?.mode === "x402" ? profile.llmConfig.balance : 0;
    updateProfile({
      llmConfig:
        llmMode === "x402"
          ? { mode: "x402", balance: existingBalance, model: x402Model }
          : {
              mode: "own-key",
              provider: llmProvider,
              model: llmModel,
              apiKey: llmKey.trim(),
            },
    });
    setLlmSaved(true);
    setTimeout(() => setLlmSaved(false), 2000);
    toast.show({ variant: "success", title: "Agent settings saved" });
  }

  async function handleX402TopUp() {
    setTopping(true);
    try {
      const data = await apiFetch<{ credits?: number }>("/api/topup", {
        method: "POST",
        body: { wallet, usd: x402TopUpAmount },
      });
      const currentBalance =
        profile?.llmConfig?.mode === "x402" ? profile.llmConfig.balance : 0;
      const newBalance =
        currentBalance + (data.credits ?? x402TopUpAmount * 100);
      updateProfile({
        llmConfig: { mode: "x402", balance: newBalance, model: x402Model },
      });
    } catch {
      // ignore
    }
    setTopping(false);
  }

  const selectedProvider = LLM_PROVIDERS.find((p) => p.id === llmProvider);

  return (
    <div className="surface-card rounded-xl p-5 space-y-4">
      <div>
        <p className="text-[14px] text-primary" style={{ fontWeight: 590 }}>
          AI Provider
        </p>
        <p className="text-[12px] text-muted mt-0.5">
          Choose the model your agent uses to structure deals and negotiate.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2" role="group" aria-label="AI provider mode">
        {(["own-key", "x402"] as const).map((mode) => {
          // x402 is gated behind a "coming soon" flag (#10). When off, the tab is
          // disabled and labeled Soon, and can't be selected.
          const disabled = mode === "x402" && !FEATURE_X402;
          const active = llmMode === mode && !disabled;
          return (
            <button
              key={mode}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && setLlmMode(mode)}
              className={`h-9 rounded-md text-[12px] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                active
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-card-border bg-surface text-muted hover:text-primary"
              } ${disabled ? "opacity-50 cursor-not-allowed hover:text-muted" : ""}`}
              style={{ fontWeight: 510 }}
              title={disabled ? "Coming soon" : undefined}
            >
              {mode === "own-key" ? "Own API Key" : disabled ? "Buy via x402 · Soon" : "Buy via x402"}
            </button>
          );
        })}
      </div>

      {llmMode === "own-key" ? (
        <>
          <div className="space-y-1.5">
            <p className="text-[12px] text-muted" style={{ fontWeight: 510 }}>
              Provider
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {LLM_PROVIDERS.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => {
                    setLlmProvider(provider.id);
                    setLlmModel(LLM_MODELS[provider.id][0]);
                  }}
                  className={`h-9 rounded-md text-[12px] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                    llmProvider === provider.id
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-card-border bg-surface text-muted hover:text-primary"
                  }`}
                  style={{ fontWeight: 510 }}
                >
                  {provider.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="agent-llm-model"
              className="text-[12px] text-muted"
              style={{ fontWeight: 510 }}
            >
              Model
            </label>
            <select
              id="agent-llm-model"
              value={llmModel}
              onChange={(e) => setLlmModel(e.target.value)}
              className="w-full h-10 rounded-md bg-surface border border-card-border px-3 pr-9 text-[13px] text-primary outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/60 transition-colors cursor-pointer"
            >
              {LLM_MODELS[llmProvider].map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="agent-llm-key"
              className="text-[12px] text-muted"
              style={{ fontWeight: 510 }}
            >
              API Key
            </label>
            <div className="flex gap-2">
              <input
                id="agent-llm-key"
                type={showLlmKey ? "text" : "password"}
                value={llmKey}
                onChange={(e) => setLlmKey(e.target.value)}
                placeholder={selectedProvider?.hint ?? "sk-..."}
                autoComplete="off"
                spellCheck={false}
                className="flex-1 h-10 rounded-md bg-surface border border-card-border px-3 text-[13px] text-primary outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/60 transition-colors font-mono"
              />
              <button
                type="button"
                onClick={() => setShowLlmKey(!showLlmKey)}
                className="btn-ghost h-10 px-3 rounded-md text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                {showLlmKey ? "Hide" : "Show"}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-md bg-surface border border-card-border px-4 py-3">
            <div>
              <p className="text-[12px] text-muted" style={{ fontWeight: 510 }}>
                Current balance
              </p>
              <p
                className="text-[18px] text-primary tabular-nums"
                style={{ fontWeight: 590 }}
              >
                $
                {(
                  (profile?.llmConfig?.mode === "x402"
                    ? profile.llmConfig.balance
                    : 0) / 100
                ).toFixed(2)}
              </p>
            </div>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-accent"
              aria-hidden="true"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="agent-x402-model"
              className="text-[12px] text-muted"
              style={{ fontWeight: 510 }}
            >
              Model
            </label>
            <select
              id="agent-x402-model"
              value={x402Model}
              onChange={(e) => setX402Model(e.target.value)}
              className="w-full h-10 rounded-md bg-surface border border-card-border px-3 pr-9 text-[13px] text-primary outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/60 transition-colors cursor-pointer"
            >
              {X402_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label} - ${model.costPer1k.toFixed(2)}/1k tokens
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <p className="text-[12px] text-muted" style={{ fontWeight: 510 }}>
              Top up
            </p>
            <div className="grid grid-cols-4 gap-2">
              {X402_TOP_UP_AMOUNTS.map((amount) => (
                <button
                  key={amount.usd}
                  type="button"
                  onClick={() => setX402TopUpAmount(amount.usd)}
                  className={`h-9 rounded-md text-[12px] border relative transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                    x402TopUpAmount === amount.usd
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-card-border bg-surface text-muted hover:text-primary"
                  }`}
                  style={{ fontWeight: 510 }}
                >
                  {amount.label}
                  {"popular" in amount && amount.popular && (
                    <span
                      className="absolute -top-1.5 -right-1.5 text-[9px] bg-accent text-background rounded-full px-1"
                      style={{ fontWeight: 590 }}
                    >
                      popular
                    </span>
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleX402TopUp}
              disabled={topping}
              className="btn-primary w-full h-9 rounded-md text-[12px] mt-2 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              {topping ? "Processing..." : `Buy $${x402TopUpAmount} of tokens`}
            </button>
          </div>
        </>
      )}

      <button
        type="button"
        onClick={saveLlmConfig}
        disabled={llmMode === "own-key" && !llmKey.trim()}
        className="btn-primary h-9 px-5 rounded-md text-[13px] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        {llmSaved ? "Saved" : "Save"}
      </button>
    </div>
  );
}

function AgentSetupTab({ wallet }: { wallet: string }) {
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [limit, setLimit] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<AgentTemplate>>({
    name: "",
    negotiation_style: "flexible",
    price_floor_pct: 80,
    escalate_after_rounds: 3,
    agent_intro_message: "",
    deal_types: [],
    auto_approve_if: [],
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Template pending delete confirmation (replaces window.confirm).
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState(false);

  // fetchTemplates intentionally owns the loading lifecycle for this tab.
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    fetchTemplates();
  }, [wallet]);
  /* eslint-enable react-hooks/exhaustive-deps */

  async function fetchTemplates() {
    setLoading(true);
    try {
      const data = await apiFetch<{ templates?: AgentTemplate[] }>(`/api/agent-templates?wallet=${wallet}`);
      setTemplates(data.templates ?? []);
      // Infer limit from kyc status via user endpoint
      const u = await apiFetchSafe<{ is_verified?: boolean }>(`/api/users/${wallet}/public`, {}, {});
      setLimit(u.is_verified ? 10 : 1);
    } catch {
      // keep current templates
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!form.name?.trim()) {
      setFormError("Template name is required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await apiFetch("/api/agent-templates", {
        method: "POST",
        body: { wallet, ...form },
      });
      setShowForm(false);
      setForm({ name: "", negotiation_style: "flexible", price_floor_pct: 80, escalate_after_rounds: 3, agent_intro_message: "" });
      fetchTemplates();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Failed to save template.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSetActive(id: string) {
    await apiFetchSafe("/api/agent-templates", {
      method: "PATCH",
      body: { id, wallet, action: "set-active" },
    }, undefined);
    fetchTemplates();
  }

  async function handleDelete(id: string) {
    setDeletingTemplate(true);
    try {
      await apiFetchSafe("/api/agent-templates", {
        method: "DELETE",
        body: { id, wallet },
      }, undefined);
      setDeleteId(null);
      fetchTemplates();
    } finally {
      setDeletingTemplate(false);
    }
  }

  return (
    <div className="space-y-4">
      <AiProviderPanel wallet={wallet} />

      {/* Verification banner */}
      <div className={`rounded-xl px-4 py-3 flex items-center justify-between gap-4 ${
        limit === 10
          ? "bg-success/10 border border-success/20"
          : "bg-warning/10 border border-warning/20"
      }`}>
        <div>
          <p className="text-[13px] text-primary" style={{ fontWeight: 510 }}>
            {limit === 10 ? "✓ Verified account" : "Unverified account"}
          </p>
          <p className="text-[12px] text-muted mt-0.5">
            {limit === 10
              ? "Up to 10 templates available."
              : `Using ${templates.length} of 1 template. Get verified to unlock 10.`}
          </p>
        </div>
        {limit < 10 && FEATURE_GET_VERIFIED && (
          <Link
            href="/profile/verify"
            className="btn-ghost h-8 px-3 rounded-md text-[12px] flex-shrink-0"
          >
            Get Verified →
          </Link>
        )}
      </div>

      {/* Template list */}
      {loading ? (
        <div className="text-[13px] text-muted">Loading templates…</div>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div
              key={t.id}
              className={`surface-card rounded-xl px-4 py-3 flex items-start justify-between gap-4 ${
                t.active ? "border border-accent/30" : ""
              }`}
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-[14px] text-primary truncate" style={{ fontWeight: 510 }}>
                    {t.name}
                  </p>
                  {t.active && (
                    <span className="pill-neutral text-accent text-[10px]">Active</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="pill-neutral text-[11px]">{STYLE_LABELS[t.negotiation_style]}</span>
                  <span className="pill-neutral text-[11px]">Floor {t.price_floor_pct}%</span>
                  <span className="pill-neutral text-[11px]">Escalate after {t.escalate_after_rounds} rounds</span>
                </div>
                {t.agent_intro_message && (
                  <p className="text-[12px] text-muted truncate">{t.agent_intro_message}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {!t.active && (
                  <button
                    onClick={() => handleSetActive(t.id)}
                    className="text-[11px] px-2.5 h-7 rounded border border-card-border text-muted hover:text-accent hover:border-accent/40 transition-colors"
                  >
                    Set active
                  </button>
                )}
                <button
                  onClick={() => setDeleteId(t.id)}
                  className="text-[11px] px-2.5 h-7 rounded border border-card-border text-muted hover:text-danger hover:border-danger/40 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}

          {templates.length === 0 && !showForm && (
            <div className="surface-card rounded-xl py-10 flex flex-col items-center gap-3 text-center">
              <p className="text-[14px] text-muted">No agent templates yet.</p>
              <p className="text-[13px] text-subtle">Create a template so your agent knows how to negotiate on your behalf.</p>
            </div>
          )}
        </div>
      )}

      {/* New template form */}
      {showForm && (
        <div className="surface-card rounded-xl p-5 space-y-4 border border-accent/20">
          <p className="text-[14px] text-primary" style={{ fontWeight: 590 }}>New Template</p>
          {formError && (
            <p className="text-[12px] text-danger">{formError}</p>
          )}
          <div className="space-y-3">
            <Field label="Template name">
              <input
                value={form.name ?? ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Standard Vendor Terms"
                className="w-full h-10 rounded-md bg-surface border border-card-border px-3 text-[13px] text-primary outline-none focus:border-accent transition-colors"
              />
            </Field>
            <Field label="Negotiation style">
              <select
                value={form.negotiation_style ?? "flexible"}
                onChange={(e) => setForm({ ...form, negotiation_style: e.target.value as AgentTemplate["negotiation_style"] })}
                className="w-full h-10 rounded-md bg-surface border border-card-border px-3 pr-9 text-[13px] text-primary outline-none focus:border-accent transition-colors cursor-pointer"
              >
                <option value="firm">Firm — hold your ground</option>
                <option value="flexible">Flexible — balanced trade-offs</option>
                <option value="collaborative">Collaborative — win-win focus</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Price floor (${form.price_floor_pct}% of ask)`}>
                <input
                  type="range"
                  min={50}
                  max={100}
                  value={form.price_floor_pct ?? 80}
                  onChange={(e) => setForm({ ...form, price_floor_pct: Number(e.target.value) })}
                  className="w-full accent-accent"
                />
              </Field>
              <Field label="Escalate to me after N rounds">
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={form.escalate_after_rounds ?? 3}
                  onChange={(e) => setForm({ ...form, escalate_after_rounds: Number(e.target.value) })}
                  className="w-full h-10 rounded-md bg-surface border border-card-border px-3 text-[13px] text-primary outline-none focus:border-accent transition-colors"
                />
              </Field>
            </div>
            <Field label="Agent opening message (optional)">
              <textarea
                value={form.agent_intro_message ?? ""}
                onChange={(e) => setForm({ ...form, agent_intro_message: e.target.value })}
                placeholder="First message your agent sends when starting a negotiation…"
                rows={2}
                className="w-full rounded-md bg-surface border border-card-border px-3 py-2 text-[13px] text-primary outline-none focus:border-accent resize-none transition-colors"
              />
            </Field>
          </div>
          <div className="flex gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary h-9 px-5 rounded-md text-[13px] disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save Template"}
            </button>
            <button
              onClick={() => { setShowForm(false); setFormError(null); }}
              className="btn-ghost h-9 px-4 rounded-md text-[13px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add button */}
      {!showForm && templates.length < limit && (
        <button
          onClick={() => setShowForm(true)}
          className="btn-ghost h-9 px-4 rounded-md text-[13px] flex items-center gap-1.5"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Template
        </button>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        title="Delete this template?"
        body="Your agent will no longer be able to negotiate with these settings. This can't be undone."
        confirmLabel="Delete template"
        danger
        busy={deletingTemplate}
        busyLabel="Deleting…"
        onCancel={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) void handleDelete(deleteId); }}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[12px] text-muted" style={{ fontWeight: 510 }}>{label}</label>
      {children}
    </div>
  );
}

/* Accessible toggle switch (N15). A real role=switch button with a focus ring;
   the knob geometry is exact — 44px track, 18px knob, 3px inset → 20px travel. */
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => { e.preventDefault(); onChange(!checked); }}
      className={`relative inline-flex items-center shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-panel ${
        checked ? "bg-accent" : "bg-surface-hover border border-card-border"
      }`}
      style={{ width: 44, height: 24 }}
    >
      <span
        className="inline-block rounded-full bg-white shadow-sm transition-transform"
        style={{ width: 18, height: 18, transform: `translateX(${checked ? 23 : 3}px)` }}
      />
    </button>
  );
}

/* ── Reviews Tab (N7) — your own reviews, the ones behind your Avg rating ──── */

type SelfReviewItem = {
  id: string;
  stars: number;
  review_text: string;
  submitted_at: string;
  deal_id: string;
  deal_title: string;
  reviewer: { wallet: string; handle: string | null; display_name: string | null };
};

function ReviewStars({ value }: { value: number }) {
  const filled = Math.max(0, Math.min(5, value));
  return (
    <span style={{ color: "var(--accent)", fontSize: 13, letterSpacing: 1 }} aria-label={`${value} of 5 stars`}>
      {"★".repeat(filled)}
      <span style={{ color: "var(--card-border)" }}>{"★".repeat(5 - filled)}</span>
    </span>
  );
}

function SelfReviewsTab({ wallet }: { wallet: string }) {
  const [reviews, setReviews] = useState<SelfReviewItem[] | null>(null);

  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    apiFetchSafe<{ reviews?: SelfReviewItem[] }>(
      `/api/users/${encodeURIComponent(wallet)}/reviews`,
      {},
      { reviews: [] },
    ).then((data) => {
      if (!cancelled) setReviews(data.reviews ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  if (reviews === null) {
    return (
      <div style={{ textAlign: "center", padding: "48px 0", color: "var(--subtle)", fontSize: 13 }}>
        Loading reviews…
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "48px 0", color: "var(--subtle)", fontSize: 13 }}>
        No reviews yet. Counterparties can rate you once a deal completes.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {reviews.map((r) => {
        const reviewerName =
          r.reviewer.display_name?.trim() ||
          atDisplayHandle(r.reviewer.handle) ||
          `${r.reviewer.wallet.slice(0, 4)}…${r.reviewer.wallet.slice(-4)}`;
        const date = r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : "";
        return (
          <div key={r.id} className="surface-card" style={{ borderRadius: 12, padding: 16 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: r.review_text ? 8 : 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <ReviewStars value={r.stars} />
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--primary)",
                    fontWeight: 510,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {reviewerName}
                </span>
              </div>
              <span style={{ fontSize: 11, color: "var(--subtle)", flexShrink: 0 }}>{date}</span>
            </div>
            {r.review_text && (
              <p style={{ fontSize: 13, color: "var(--foreground)", margin: "0 0 8px", lineHeight: 1.55 }}>
                {r.review_text}
              </p>
            )}
            <Link
              href={`/deals/${encodeURIComponent(r.deal_id)}`}
              style={{ fontSize: 11.5, color: "var(--muted)", textDecoration: "none" }}
            >
              on “{r.deal_title}” →
            </Link>
          </div>
        );
      })}
    </div>
  );
}

/* ── Settings Tab ─────────────────────────────────────────────────────────── */

function SettingsTab({ wallet }: { wallet: string }) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [notifyPrefs, setNotifyPrefs] = useState<NotificationPrefs>({
    deal_review_needed: true,
    milestone_due: true,
    deal_accepted: true,
    deal_declined: true,
    new_deal_invite: true,
    renegotiation_escalated: true,
    friend_request: true,
    friend_request_accepted: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  useEffect(() => {
    apiFetchSafe<{ notify_on?: NotificationPrefs; email?: string; email_verified?: boolean }>(
      `/api/users/${wallet}/public?self=1`, {}, {}
    )
      .then((data) => {
        if (data.notify_on) setNotifyPrefs(data.notify_on);
        if (data.email) setEmail(data.email);
        if (data.email_verified) setEmailVerified(data.email_verified);
      })
      .finally(() => setLoading(false));
  }, [wallet]);

  async function sendOtp() {
    setOtpError(null);
    try {
      await apiFetch("/api/users/email", { method: "POST", body: { wallet, email } });
      setOtpSent(true); // only advance on success — else the user waits for an email that never comes
    } catch (e) {
      setOtpError(e instanceof ApiError ? e.message : "Couldn't send the code. Check the email and try again.");
    }
  }

  async function verifyOtp() {
    setOtpError(null);
    try {
      await apiFetch("/api/users/email/verify", { method: "POST", body: { wallet, otp } });
      setEmailVerified(true);
      setOtpSent(false);
    } catch (e) {
      setOtpError(e instanceof ApiError ? e.message : "That code didn't match. Please try again.");
    }
  }

  async function savePrefs() {
    setSaving(true);
    await apiFetchSafe("/api/users/notifications", {
      method: "PATCH",
      body: { wallet, notify_on: notifyPrefs },
    }, undefined);
    setSaving(false);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  }

  const NOTIFY_LABELS: Record<keyof NotificationPrefs, string> = {
    deal_review_needed: "Deal review needed",
    milestone_due: "Milestone confirmation due",
    deal_accepted: "Deal accepted by counterparty",
    deal_declined: "Deal declined by counterparty",
    new_deal_invite: "New deal invite received",
    renegotiation_escalated: "Renegotiation escalated",
    friend_request: "New friend request",
    friend_request_accepted: "Friend request accepted",
  };

  // Only the notification/email cards below depend on the fetch — render agent
  // setup immediately so it isn't gated behind this tab's loading state.
  if (loading) {
    return (
      <div className="space-y-6">
        <AgentSetupTab wallet={wallet} />
        <div className="text-[13px] text-muted">Loading settings…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Agent setup — moved here from its own top-level tab (#12). */}
      <AgentSetupTab wallet={wallet} />

      {/* Email section */}
      <div className="surface-card rounded-xl p-5 space-y-4">
        <div>
          <p className="text-[14px] text-primary" style={{ fontWeight: 590 }}>Email notifications</p>
          <p className="text-[12px] text-muted mt-0.5">Receive deal alerts to your email.</p>
        </div>
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              disabled={emailVerified}
              className="flex-1 h-10 rounded-md bg-surface border border-card-border px-3 text-[13px] text-primary outline-none focus:border-accent transition-colors disabled:opacity-50"
            />
            {!emailVerified && (
              <button
                onClick={sendOtp}
                disabled={!email.includes("@")}
                className="btn-ghost h-10 px-4 rounded-md text-[13px] disabled:opacity-40"
              >
                {otpSent ? "Resend OTP" : "Send OTP"}
              </button>
            )}
            {emailVerified && (
              <span className="flex items-center gap-1 text-[13px] text-success px-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Verified
              </span>
            )}
          </div>
          {otpSent && !emailVerified && (
            <div className="flex gap-2">
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="6-digit code"
                maxLength={6}
                className="w-36 h-10 rounded-md bg-surface border border-card-border px-3 text-[13px] text-primary outline-none focus:border-accent transition-colors font-mono"
              />
              <button
                onClick={verifyOtp}
                disabled={otp.length !== 6}
                className="btn-primary h-10 px-4 rounded-md text-[13px] disabled:opacity-40"
              >
                Verify
              </button>
            </div>
          )}
          {otpError && (
            <p className="text-[12px] text-danger mt-2">{otpError}</p>
          )}
        </div>
      </div>

      {/* Telegram section */}
      <div className="surface-card rounded-xl p-5 space-y-4 opacity-60">
        <div>
          <p className="text-[14px] text-primary" style={{ fontWeight: 590 }}>Telegram notifications</p>
          <p className="text-[12px] text-muted mt-0.5">Setup coming soon.</p>
        </div>
        <input
          disabled
          placeholder="@your_telegram_handle"
          className="w-full h-10 rounded-md bg-surface border border-card-border px-3 text-[13px] text-muted cursor-not-allowed"
        />
      </div>

      {/* Notification toggles */}
      <div className="surface-card rounded-xl p-5 space-y-4">
        <p className="text-[14px] text-primary" style={{ fontWeight: 590 }}>Notification events</p>
        <div className="space-y-3">
          {(Object.keys(NOTIFY_LABELS) as (keyof NotificationPrefs)[]).map((key) => (
            <label key={key} className="flex items-center justify-between gap-4 cursor-pointer">
              <span className="text-[13px] text-foreground">{NOTIFY_LABELS[key]}</span>
              <Toggle
                checked={notifyPrefs[key] ?? false}
                onChange={(v) => setNotifyPrefs({ ...notifyPrefs, [key]: v })}
                label={NOTIFY_LABELS[key]}
              />
            </label>
          ))}
        </div>
        <button
          onClick={savePrefs}
          disabled={saving}
          className="btn-primary h-9 px-5 rounded-md text-[13px] disabled:opacity-40"
        >
          {savedMsg ? "Saved ✓" : saving ? "Saving…" : "Save preferences"}
        </button>
      </div>
    </div>
  );
}

/* ── Friends Tab ──────────────────────────────────────────────────────────── */

type FriendEntry = {
  id: string;
  wallet: string;
  friend_wallet: string;
  status: string;
  created_at: string;
  counterpartyWallet: string;
  profile: PublicProfile | null;
};

function FriendsTab({ wallet }: { wallet: string }) {
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [incoming, setIncoming] = useState<FriendEntry[]>([]);
  const [outgoing, setOutgoing] = useState<FriendEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [addUsername, setAddUsername] = useState("");
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState<string | null>(null);

  function loadFriends() {
    setLoading(true);
    apiFetchSafe<{ friends?: FriendEntry[]; incoming?: FriendEntry[]; outgoing?: FriendEntry[] }>(
      "/api/friends", { wallet }, {}
    )
      .then((d) => {
        setFriends(d.friends ?? []);
        setIncoming(d.incoming ?? []);
        setOutgoing(d.outgoing ?? []);
      })
      .finally(() => setLoading(false));
  }

  // loadFriends intentionally resets loading state whenever the wallet changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadFriends(); }, [wallet]);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const friendHandle = addUsername.trim().replace(/^@/, "");
    if (!friendHandle) return;
    setAdding(true);
    setAddMsg(null);
    try {
      const data = await apiFetch<{ status?: string }>("/api/friends", {
        method: "POST",
        wallet,
        body: { friendHandle },
      });
      setAddMsg(
        data.status === "already_friends"
          ? "You're already friends."
          : data.status === "accepted"
          ? "Now friends!"
          : "Request sent!"
      );
      setAddUsername("");
      loadFriends();
    } catch (e) {
      setAddMsg(e instanceof ApiError ? e.message : "Failed");
    }
    setAdding(false);
  }

  async function handleAccept(cpWallet: string) {
    await apiFetchSafe(`/api/friends/${cpWallet}`, {
      method: "PATCH",
      wallet,
      body: { action: "accept" },
    }, undefined);
    loadFriends();
  }

  async function handleDecline(cpWallet: string) {
    await apiFetchSafe(`/api/friends/${cpWallet}`, {
      method: "PATCH",
      wallet,
      body: { action: "decline" },
    }, undefined);
    loadFriends();
  }

  async function handleRemove(cpWallet: string) {
    await apiFetchSafe(`/api/friends/${cpWallet}`, {
      method: "DELETE",
      wallet,
    }, undefined);
    loadFriends();
  }

  if (loading) return <div className="text-[13px] text-muted">Loading friends…</div>;

  return (
    <div className="space-y-6">
      {/* Add by username */}
      <div className="surface-card rounded-xl p-5 space-y-3">
        <div>
          <p className="text-[14px] text-primary" style={{ fontWeight: 590 }}>Add a friend</p>
          <p className="text-[12px] text-muted mt-0.5">Enter their Sealed username.</p>
        </div>
        <form onSubmit={handleAdd} className="flex gap-2">
          <label htmlFor="friend-username" className="sr-only">Friend username</label>
          <input
            id="friend-username"
            value={addUsername}
            onChange={(e) => setAddUsername(e.target.value)}
            type="text"
            autoComplete="username"
            spellCheck={false}
            placeholder="@username"
            className="flex-1 h-10 rounded-md bg-surface border border-card-border px-3 text-[13px] text-primary outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/60 transition-colors"
          />
          <button
            type="submit"
            disabled={adding || !addUsername.trim()}
            className="btn-primary h-10 px-5 rounded-md text-[13px] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            {adding ? "Sending…" : "Send request"}
          </button>
        </form>
        {addMsg && (
          <p className={`text-[12px] ${addMsg.includes("sent") || addMsg.includes("friends") ? "text-success" : "text-danger"}`}>
            {addMsg}
          </p>
        )}
      </div>

      {/* Incoming requests */}
      {incoming.length > 0 && (
        <div className="space-y-3">
          <p className="text-[13px] text-primary" style={{ fontWeight: 590 }}>
            Incoming requests <span className="ml-1 px-1.5 py-0.5 rounded-full bg-accent/20 text-accent text-[11px]">{incoming.length}</span>
          </p>
          {incoming.map((f) => (
            <FriendCard key={f.id} entry={f}>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAccept(f.counterpartyWallet)}
                  className="btn-primary h-8 px-4 rounded-md text-[12px]"
                >
                  Accept
                </button>
                <button
                  onClick={() => handleDecline(f.counterpartyWallet)}
                  className="btn-ghost h-8 px-3 rounded-md text-[12px]"
                >
                  Decline
                </button>
              </div>
            </FriendCard>
          ))}
        </div>
      )}

      {/* Accepted friends */}
      {friends.length > 0 && (
        <div className="space-y-3">
          <p className="text-[13px] text-primary" style={{ fontWeight: 590 }}>
            Friends <span className="ml-1 text-muted text-[12px]">({friends.length})</span>
          </p>
          {friends.map((f) => (
            <FriendCard key={f.id} entry={f}>
              <div className="flex gap-2">
                <Link
                  href="/app"
                  className="btn-ghost h-8 px-3 rounded-md text-[12px] flex items-center gap-1.5"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Invite to deal
                </Link>
                <button
                  onClick={() => handleRemove(f.counterpartyWallet)}
                  className="btn-ghost h-8 px-3 rounded-md text-[12px] text-danger hover:text-danger"
                >
                  Remove
                </button>
              </div>
            </FriendCard>
          ))}
        </div>
      )}

      {/* Outgoing pending */}
      {outgoing.length > 0 && (
        <div className="space-y-3">
          <p className="text-[13px] text-muted" style={{ fontWeight: 590 }}>Pending sent</p>
          {outgoing.map((f) => (
            <FriendCard key={f.id} entry={f}>
              <button
                onClick={() => handleRemove(f.counterpartyWallet)}
                className="btn-ghost h-8 px-3 rounded-md text-[12px]"
              >
                Cancel
              </button>
            </FriendCard>
          ))}
        </div>
      )}

      {friends.length === 0 && incoming.length === 0 && outgoing.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <div className="w-10 h-10 rounded-full bg-surface border border-card-border flex items-center justify-center text-muted">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div>
            <p className="text-[14px] text-primary" style={{ fontWeight: 590 }}>No friends yet</p>
            <p className="text-[12px] text-muted mt-0.5">Add people you&apos;ve worked with or send requests from their public profile.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function FriendCard({
  entry,
  children,
}: {
  entry: FriendEntry;
  children: React.ReactNode;
}) {
  const cp = entry.counterpartyWallet;
  const p = entry.profile;
  const username = atDisplayHandle(p?.handle);
  const displayName = p?.display_name?.trim() || username || "Sealed user";
  const initialsSource = p?.display_name?.trim() || displayHandle(p?.handle) || "SU";
  const initials = initialsSource
    .replace(/^@/, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div className="surface-card rounded-xl p-4 flex items-center gap-4">
      <Link href={`/profile/${cp}`} className="flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-brand/20 border border-brand/30 flex items-center justify-center text-[14px] text-accent" style={{ fontWeight: 590 }}>
          {initials}
        </div>
      </Link>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Link href={`/profile/${cp}`} className="text-[13px] text-primary hover:text-accent transition-colors truncate" style={{ fontWeight: 510 }}>
            {displayName}
          </Link>
          {p?.is_verified && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-success flex-shrink-0">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" />
            </svg>
          )}
        </div>
        {p?.display_name && username && (
          <p className="text-[11px] text-muted mt-0.5">{username}</p>
        )}
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted">
          <span>{p?.deals_successful ?? 0} deals done</span>
          {p && p.deals_total > 0 && (
            <span>{Math.round((p.deals_successful / p.deals_total) * 100)}% success</span>
          )}
          {p && p.avg_rating > 0 && <span>{p.avg_rating.toFixed(1)} ★</span>}
        </div>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ChatInterface from "@/components/ChatInterface";
import SettingsModal from "@/components/SettingsModal";
import { useToast } from "@/components/Toast";
import { useProfileStore } from "@/lib/profile-store";
import { DealParams } from "@/lib/types";
import { useWallet } from "@solana/wallet-adapter-react";
import { SealedMark } from "@/components/SealedLogo";
import { SealedBackdrop } from "@/components/SealedBackdrop";
import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

type View = "chat" | "deals";

interface SupabaseDeal {
  deal_id: string;
  buyer_wallet: string;
  seller_wallet: string | null;
  title: string;
  total_amount_usdc: number;
  milestones: Array<{ description: string; amount: number; status?: string }>;
  status: string;
  created_at?: string;
}

export default function Home() {
  const [view, setView] = useState<View>("deals");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { publicKey } = useWallet();
  const { profile, loaded: profileLoaded } = useProfileStore(
    publicKey?.toBase58() ?? null
  );
  const toast = useToast();
  const router = useRouter();

  // Redirect to onboarding if wallet connected but profile not set up
  useEffect(() => {
    if (profileLoaded && publicKey && !profile?.onboardingComplete) {
      router.replace("/onboarding");
    }
  }, [profileLoaded, publicKey, profile, router]);

  // Save draft and navigate to negotiation room
  async function handleDealDrafted(params: DealParams): Promise<void> {
    if (!publicKey) {
      toast.show({
        variant: "info",
        title: "Connect wallet first",
        description: "Connect your wallet to create a deal.",
      });
      return;
    }

    const dealTitle = params.title ?? params.dealId;

    const draftDeal = {
      deal_id: params.dealId,
      buyer_wallet: publicKey.toBase58(),
      seller_wallet: params.sellerWallet ?? "",
      title: dealTitle,
      description: params.milestones.map((m) => m.description).join(" | "),
      total_amount_usdc: params.totalAmount,
      milestones: params.milestones.map((m) => ({
        description: m.description,
        amount: m.amount,
        status: "Pending",
      })),
      status: "draft",
    };
    try {
      sessionStorage.setItem(`deal:${params.dealId}`, JSON.stringify(draftDeal));
    } catch {
      // sessionStorage unavailable
    }

    fetch("/api/deals/mirror", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wallet": publicKey.toBase58(),
      },
      body: JSON.stringify({
        deal_id: params.dealId,
        seller_wallet: params.sellerWallet ?? null,
        title: dealTitle,
        description: params.milestones.map((m) => m.description).join(" | "),
        total_amount_usdc: params.totalAmount,
        milestones: params.milestones.map((m) => ({
          description: m.description,
          amount: m.amount,
          status: "Pending",
        })),
        status: "draft",
      }),
    }).catch(() => {});

    router.push(`/negotiate/${params.dealId}`);
  }

  return (
    <div className="flex flex-col h-screen" style={{ position: "relative", background: "var(--background)" }}>
      {view === "deals" && <SealedBackdrop />}

      {/* App Header */}
      <AppHeader
        activeView={view}
        onViewChange={setView}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="flex-1 overflow-hidden" style={{ position: "relative", zIndex: 1 }}>
        {view === "chat" ? (
          <ChatInterface onDealCreated={handleDealDrafted} />
        ) : (
          <DealsBoldBoard />
        )}
      </main>

      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}

/* ── AppHeader ── */
function AppHeader({
  activeView,
  onViewChange,
  onOpenSettings,
}: {
  activeView: View;
  onViewChange: (v: View) => void;
  onOpenSettings: () => void;
}) {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const { profile } = useProfileStore(wallet);

  const initials = profile?.name
    ? profile.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : null;
  const shortWallet = wallet ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : null;

  const tabs: { id: string; label: string; href?: string; view?: View }[] = [
    { id: "deals", label: "Deals", view: "deals" },
    { id: "new", label: "New Deal", view: "chat" },
    { id: "agent", label: "Agent", href: "/app/agent" },
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
            const isActive = t.view ? activeView === t.view : false;
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
            if (t.href) {
              return (
                <Link key={t.id} href={t.href} style={style}>
                  {t.label}
                </Link>
              );
            }
            return (
              <button key={t.id} onClick={() => t.view && onViewChange(t.view)} style={style}>
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
        {wallet && (
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            height: 30,
            padding: "0 10px",
            borderRadius: 6,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid var(--card-border)",
          }}>
            <div style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: initials
                ? "linear-gradient(135deg, #5e6ad2, #7170ff)"
                : "var(--surface)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 590,
              color: "#fff",
            }}>
              {initials ?? "?"}
            </div>
            <span style={{ fontSize: 12, fontFamily: "ui-monospace, monospace", color: "var(--muted)" }}>
              {shortWallet ?? "—"}
            </span>
          </div>
        )}
        {!wallet && <WalletMultiButton />}
      </div>
    </header>
  );
}

/* ── Deals Bold Board ── */
function DealsBoldBoard() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const router = useRouter();

  const [deals, setDeals] = useState<SupabaseDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!wallet) {
      setLoading(false); // eslint-disable-line react-hooks/set-state-in-effect
      return;
    }
    fetch("/api/deals/mirror", { headers: { "x-wallet": wallet } })
      .then((r) => r.json())
      .then((data) => {
        const supabaseDeals: SupabaseDeal[] = data.deals ?? [];
        const sessionDeals = readSessionDeals(wallet);
        const merged = mergeDedupe(supabaseDeals, sessionDeals);
        setDeals(merged);
      })
      .catch(() => { setDeals(readSessionDeals(wallet)); })
      .finally(() => setLoading(false));
  }, [wallet]);

  const filtered = deals.filter((d) =>
    !search ||
    d.title.toLowerCase().includes(search.toLowerCase()) ||
    (d.deal_id ?? "").toLowerCase().includes(search.toLowerCase())
  );

  // Determine if a deal needs action from the current user
  function needsYourAction(deal: SupabaseDeal): boolean {
    if (!wallet) return false;
    const isBuyer = deal.buyer_wallet === wallet;
    if (deal.status === "draft") return isBuyer; // buyer needs to invite
    const hasReview = deal.milestones.some((m) => m.status === "In Review");
    if (hasReview && isBuyer) return true;
    return false;
  }

  const youLane = filtered.filter((d) => needsYourAction(d) && d.status !== "completed");
  const themLane = filtered.filter((d) => !needsYourAction(d) && d.status !== "completed");
  const doneLane = filtered.filter((d) => d.status === "completed");

  const lanes: { id: string; title: string; color: string; caption: string; deals: SupabaseDeal[] }[] = [
    { id: "you",  title: "Waiting on you",  color: "var(--warning)", caption: "Action pending — these need your input", deals: youLane },
    { id: "them", title: "Waiting on them", color: "var(--accent)",  caption: "In progress — counterparty's move",     deals: themLane },
    { id: "done", title: "Settled",         color: "var(--success)", caption: "Completed deals",                       deals: doneLane },
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
          </div>
        </div>
      </div>

      {/* Board */}
      <div style={{ flex: 1, overflow: "auto", padding: "20px 24px 32px" }}>
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
                      onClick={() => router.push(`/negotiate/${d.deal_id}`)}
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
    </div>
  );
}

function DealCardBold({
  deal,
  laneColor,
  youAction,
  myWallet,
  onClick,
}: {
  deal: SupabaseDeal;
  laneColor: string;
  youAction: boolean;
  myWallet: string | null;
  onClick: () => void;
}) {
  const isBuyer = deal.buyer_wallet === myWallet;
  const counterparty = isBuyer ? deal.seller_wallet : deal.buyer_wallet;
  const shortCp = counterparty
    ? `${counterparty.slice(0, 4)}…${counterparty.slice(-4)}`
    : "Awaiting";
  const cpInitials = counterparty ? counterparty.slice(0, 2).toUpperCase() : "?";

  const totalMs = (deal.milestones ?? []).length;
  const doneMs = (deal.milestones ?? []).filter(
    (m) => m.status === "Released" || m.status === "Completed"
  ).length;

  const inReview = (deal.milestones ?? []).some((m) => m.status === "In Review");

  const statusLabel: Record<string, string> = {
    draft:     "Awaiting counterparty",
    funded:    "In progress",
    completed: "Completed",
    disputed:  "Disputed",
  };
  const statusTone: Record<string, string> = {
    draft:     "warning",
    funded:    "accent",
    completed: "success",
    disputed:  "danger",
  };
  const tone = statusTone[deal.status] ?? "neutral";

  return (
    <div
      onClick={onClick}
      style={{
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
        (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(113,112,255,0.25)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255, 255, 255, 0.14)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
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
        <StatusPill tone={tone}>{statusLabel[deal.status] ?? deal.status}</StatusPill>
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
            {shortCp}
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
    </div>
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

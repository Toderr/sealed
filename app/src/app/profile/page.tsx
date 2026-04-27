"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { SealedMark } from "@/components/SealedLogo";
import { useProfileStore, encodeInvite } from "@/lib/profile-store";
import { useDealsStore } from "@/lib/deals-store";
import { DealStatus } from "@/lib/types";
import type { Deal } from "@/lib/types";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

export default function ProfilePage() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const { profile, loaded } = useProfileStore(wallet);
  const { deals } = useDealsStore(publicKey ?? null);
  const router = useRouter();

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
    router.replace("/onboarding");
    return null;
  }

  const activeDealCount = deals.filter(
    (d) =>
      d.status === DealStatus.Created ||
      d.status === DealStatus.Funded ||
      d.status === DealStatus.InProgress
  ).length;
  const completedDealCount = deals.filter(
    (d) => d.status === DealStatus.Completed
  ).length;
  const totalVolumeUsdc = deals.reduce(
    (sum, d) => sum + d.totalAmount / 1_000_000,
    0
  );

  const shortWallet = wallet.slice(0, 4) + "..." + wallet.slice(-4);
  const initials = profile.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

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
                  <div className="w-16 h-16 rounded-full bg-brand/20 border border-brand/30 flex items-center justify-center text-[22px] text-brand" style={{ fontWeight: 590 }}>
                    {initials}
                  </div>
                  <div>
                    <p className="text-[16px] text-primary" style={{ fontWeight: 590 }}>
                      {profile.name}
                    </p>
                    <p className="text-[13px] text-muted">@{profile.username}</p>
                    <p className="text-[11px] text-subtle mt-0.5">{shortWallet}</p>
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
                      href="/onboarding?edit=1"
                      className="text-[12px] text-warning hover:text-accent transition-colors"
                    >
                      No LLM configured — set up now →
                    </Link>
                  )}
                  {profile.llmConfig?.mode === "x402" && (
                    <Link
                      href="/onboarding?edit=1"
                      className="flex items-center gap-1 text-[11px] text-muted hover:text-accent transition-colors"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                      Top up via x402
                    </Link>
                  )}
                </div>

                {/* Edit button */}
                <Link
                  href="/onboarding?edit=1"
                  className="btn-ghost flex items-center justify-center gap-1.5 h-9 rounded-md text-[13px] w-full"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit profile
                </Link>
              </div>

              {/* Invite counterparty card */}
              <InviteCard profile={profile} wallet={wallet} deals={deals} />
            </aside>

            {/* Right: Dashboard */}
            <main className="flex-1 min-w-0 space-y-6">
              {/* Stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Total deals" value={deals.length} />
                <StatCard label="Active" value={activeDealCount} accent />
                <StatCard label="Completed" value={completedDealCount} />
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

                {deals.length === 0 ? (
                  <EmptyDeals />
                ) : (
                  <div className="space-y-2">
                    {deals.map((deal) => (
                      <DealRow key={deal.dealId} deal={deal} profile={profile} wallet={wallet} />
                    ))}
                  </div>
                )}
              </div>
            </main>
          </div>
        </div>
      </div>
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
  return (
    <header className="flex items-center justify-between px-4 sm:px-6 h-14 border-b border-card-border-subtle bg-panel">
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2 text-primary">
          <SealedMark size={24} title="Sealed" />
          <span className="text-[14px] tracking-tight" style={{ fontWeight: 510 }}>
            Sealed Agent
          </span>
        </Link>
        <nav className="flex items-center gap-0.5">
          <NavLink href="/profile" active>
            Profile
          </NavLink>
          <NavLink href="/app">
            Deals
          </NavLink>
        </nav>
      </div>
      <WalletMultiButton />
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
      className={`px-3 h-8 text-[13px] rounded-md transition-colors flex items-center ${
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
/* Invite counterparty card                                            */
/* ------------------------------------------------------------------ */

function InviteCard({
  profile,
  wallet,
  deals,
}: {
  profile: { name: string; bio: string };
  wallet: string;
  deals: Deal[];
}) {
  const [copied, setCopied] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState(
    deals[0]?.dealId ?? ""
  );

  const eligibleDeals = deals.filter(
    (d) =>
      d.status === DealStatus.Created ||
      d.status === DealStatus.Funded ||
      d.status === DealStatus.InProgress
  );

  function generateLink() {
    const deal = eligibleDeals.find((d) => d.dealId === selectedDealId) ?? eligibleDeals[0];
    if (!deal) return "";
    const payload = {
      dealId: deal.dealId,
      dealTitle: deal.dealId.replace(/-/g, " "),
      inviterName: profile.name,
      inviterWallet: wallet.slice(0, 6) + "..." + wallet.slice(-4),
      amount: deal.totalAmount / 1_000_000,
      currency: "USDC",
      milestoneCount: deal.milestones.length,
      description: profile.bio,
    };
    const token = encodeInvite(payload);
    return `${window.location.origin}/invite/${token}`;
  }

  function handleCopy() {
    const link = generateLink();
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleShareX() {
    const link = generateLink();
    if (!link) return;
    const text = encodeURIComponent(
      `Hey! I'm using Sealed Agent to secure our deal on-chain. Click this link to review the terms and join — no bank or lawyer needed:\n${link}`
    );
    window.open(`https://x.com/intent/tweet?text=${text}`, "_blank");
  }

  return (
    <div className="surface-card rounded-xl p-5 space-y-3">
      <div>
        <p className="text-[13px] text-primary" style={{ fontWeight: 590 }}>
          Invite your counterparty
        </p>
        <p className="text-[12px] text-muted mt-0.5">
          Share a link for your counterparty to join a deal — works via X DM, WhatsApp, or email.
        </p>
      </div>

      {eligibleDeals.length === 0 ? (
        <p className="text-[12px] text-subtle">
          Create a deal first, then invite your counterparty here.
        </p>
      ) : (
        <>
          {eligibleDeals.length > 1 && (
            <select
              className="w-full h-9 rounded-md bg-surface border border-card-border px-3 text-[12px] text-primary outline-none focus:border-accent transition-colors cursor-pointer"
              value={selectedDealId}
              onChange={(e) => setSelectedDealId(e.target.value)}
            >
              {eligibleDeals.map((d) => (
                <option key={d.dealId} value={d.dealId} className="bg-surface">
                  {d.dealId}
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className={`btn-ghost flex-1 h-9 rounded-md text-[12px] flex items-center justify-center gap-1.5 transition-all ${
                copied ? "text-success border-success/30" : ""
              }`}
            >
              {copied ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy link
                </>
              )}
            </button>
            <button
              onClick={handleShareX}
              className="btn-ghost h-9 w-9 rounded-md flex items-center justify-center text-muted hover:text-primary flex-shrink-0"
              title="Share on X"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small components                                                    */
/* ------------------------------------------------------------------ */

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div className="surface-card rounded-xl p-4">
      <p className="text-[11px] text-muted mb-1" style={{ fontWeight: 510 }}>
        {label}
      </p>
      <p
        className={`text-[22px] ${accent ? "text-accent" : "text-primary"}`}
        style={{ fontWeight: 590 }}
      >
        {value}
      </p>
    </div>
  );
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  [DealStatus.Created]: { label: "Awaiting counterparty", color: "text-warning" },
  [DealStatus.Funded]: { label: "Funded", color: "text-accent" },
  [DealStatus.InProgress]: { label: "In progress", color: "text-success" },
  [DealStatus.Completed]: { label: "Completed", color: "text-muted" },
  [DealStatus.Refunded]: { label: "Refunded", color: "text-danger" },
  [DealStatus.Disputed]: { label: "Disputed", color: "text-danger" },
};

function DealRow({
  deal,
  profile,
  wallet,
}: {
  deal: Deal;
  profile: { name: string; bio: string };
  wallet: string;
}) {
  const [copied, setCopied] = useState(false);
  const status = STATUS_LABEL[deal.status] ?? { label: "Unknown", color: "text-muted" };
  const amountUsdc = deal.totalAmount / 1_000_000;
  const needsCounterparty =
    deal.status === DealStatus.Created || deal.status === DealStatus.Funded;

  function copyInvite() {
    const payload = {
      dealId: deal.dealId,
      dealTitle: deal.dealId.replace(/-/g, " "),
      inviterName: profile.name,
      inviterWallet: wallet.slice(0, 6) + "..." + wallet.slice(-4),
      amount: amountUsdc,
      currency: "USDC",
      milestoneCount: deal.milestones.length,
      description: profile.bio,
    };
    const token = encodeInvite(payload);
    const link = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="surface-card rounded-lg px-4 py-3 flex items-center justify-between gap-4 hover:bg-surface-hover/50 transition-colors">
      <div className="min-w-0">
        <p className="text-[13px] text-primary truncate" style={{ fontWeight: 510 }}>
          {deal.dealId}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[11px] ${status.color}`}>{status.label}</span>
          <span className="text-subtle text-[11px]">·</span>
          <span className="text-[11px] text-muted">
            {deal.milestones.length} milestone{deal.milestones.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-[13px] text-primary tabular-nums" style={{ fontWeight: 590 }}>
          ${amountUsdc.toLocaleString()} USDC
        </span>
        {needsCounterparty && (
          <button
            onClick={copyInvite}
            className={`text-[11px] px-2.5 h-7 rounded border transition-colors flex items-center gap-1 ${
              copied
                ? "border-success/40 text-success"
                : "border-card-border text-muted hover:text-primary hover:border-accent/40"
            }`}
            title="Copy invite link"
          >
            {copied ? "Copied" : "Invite"}
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
    <div className="flex flex-wrap gap-2">
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

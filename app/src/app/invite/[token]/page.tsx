"use client";

import { useMemo, useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAppWallet as useWallet } from "@/lib/use-app-wallet";
import { SealedMark } from "@/components/SealedLogo";
import { decodeInvite, type InvitePayload, useProfileStore } from "@/lib/profile-store";
import { atDisplayHandle } from "@/lib/user-display";

type InviterStats = {
  deals_total: number;
  deals_successful: number;
  avg_rating: number;
  is_verified: boolean;
  handle: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  website: string | null;
  twitter_handle: string | null;
  linkedin_url: string | null;
  instagram_handle: string | null;
  company_file_name: string | null;
};

type AccountCheck = {
  wallet: string;
  hasAccount: boolean;
};

import WalletMultiButton from "@/components/AppWalletButton";
import { apiFetch, apiFetchSafe } from "@/lib/api-client";

export default function InvitePage() {
  const params = useParams();
  const { publicKey } = useWallet();
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameError, setNameError] = useState("");
  const [savingName, setSavingName] = useState(false);

  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const [inviterStats, setInviterStats] = useState<InviterStats | null>(null);
  const [resolvedInviterWallet, setResolvedInviterWallet] = useState<string | null>(null);
  const [accountCheck, setAccountCheck] = useState<AccountCheck | null>(null);
  const sellerWallet = publicKey?.toBase58() ?? null;
  const { updateProfile } = useProfileStore(sellerWallet);

  const payload = useMemo(() => {
    if (!token) return null;
    return decodeInvite(decodeURIComponent(token));
  }, [token]);

  const inviterWallet = resolvedInviterWallet ?? payload?.inviterWallet ?? "";

  useEffect(() => {
    let cancelled = false;

    if (!payload) return;

    resolveInviterWallet(payload)
      .then((wallet) => {
        if (!cancelled) setResolvedInviterWallet(wallet);
      })
      .catch(() => {
        if (!cancelled) setResolvedInviterWallet(payload.inviterWallet);
      });

    return () => {
      cancelled = true;
    };
  }, [payload]);

  useEffect(() => {
    if (!isUsableWallet(inviterWallet)) return;

    let cancelled = false;

    apiFetchSafe<InviterStats | null>(`/api/users/${encodeURIComponent(inviterWallet)}/public`, {}, null)
      .then((data) => { if (!cancelled && data) setInviterStats(data); });

    return () => {
      cancelled = true;
    };
  }, [inviterWallet]);

  useEffect(() => {
    if (!sellerWallet) return;

    let cancelled = false;

    apiFetch<{ member_since?: string; handle?: string; display_name?: string }>(
      `/api/users/${encodeURIComponent(sellerWallet)}/public?self=1`
    )
      .then((data) => {
        if (cancelled) return;
        setAccountCheck({
          wallet: sellerWallet,
          hasAccount: Boolean(data?.member_since || data?.handle || data?.display_name),
        });
      })
      .catch(() => {
        if (!cancelled) setAccountCheck({ wallet: sellerWallet, hasAccount: false });
      });

    return () => {
      cancelled = true;
    };
  }, [sellerWallet]);

  if (!payload) {
    return (
      <InviteShell>
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="w-12 h-12 rounded-full bg-danger/10 border border-danger/20 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-danger">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div>
            <p className="text-[16px] text-primary" style={{ fontWeight: 590 }}>
              Invalid invite link
            </p>
            <p className="text-[13px] text-muted mt-1">
              This link may have expired or been modified.
            </p>
          </div>
          <Link href="/" className="btn-ghost h-9 px-5 rounded-md text-[13px]">
            Go to Sealed
          </Link>
        </div>
      </InviteShell>
    );
  }

  async function handleAccept() {
    if (!publicKey || !payload) return;
    setAccepted(true);

    const me = publicKey.toBase58();
    // The inviter holds one slot; I (the joiner) fill the opposite one.
    // Back-compat: links without inviterRole are from buyers (today's behavior).
    const inviterRole = payload.inviterRole ?? "buyer";
    let inviter = inviterWallet;

    if (!isUsableWallet(inviter)) {
      inviter = await resolveInviterWallet(payload);
      setResolvedInviterWallet(inviter);
    }

    if (!isUsableWallet(inviter)) {
      setAccepted(false);
      alert("This invite link was generated with an incomplete inviter wallet. Ask the inviter to copy a fresh link.");
      return;
    }

    // Reject self-accept: the inviter and joiner must be different wallets.
    // Otherwise both slots collapse to one wallet (buyer === seller), leaving a
    // non-functional single-party deal. This is easy to trigger now that the
    // inviter can be the seller, so guard it explicitly.
    if (me === inviter) {
      setAccepted(false);
      alert("You can't accept your own invite. Send this link to the other party.");
      return;
    }

    // Assign slots by role. If the inviter is the buyer, I'm the seller; if the
    // inviter is the seller, I'm the buyer (and I'll be the one who funds).
    const buyerWallet = inviterRole === "buyer" ? inviter : me;
    const sellerWallet = inviterRole === "buyer" ? me : inviter;
    const myField = me === sellerWallet ? "seller_wallet" : "buyer_wallet";

    // Signal the inviter's negotiate room tab instantly. Keep the legacy
    // seller-joined key when I'm the seller (existing listeners), and always
    // emit the neutral counterparty-joined key (my wallet) for the new flow.
    try {
      localStorage.setItem(`sealed:counterparty-joined:${payload.dealId}`, me);
      if (myField === "seller_wallet") {
        localStorage.setItem(`sealed:seller-joined:${payload.dealId}`, me);
      }
    } catch {}

    // 1. Fetch full deal from Supabase and save to this browser's sessionStorage
    //    so the negotiate room can load it even before Supabase propagates the PATCH.
    const minimal = {
      deal_id: payload.dealId,
      buyer_wallet: buyerWallet,
      seller_wallet: sellerWallet,
      title: payload.dealTitle,
      description: payload.description ?? "",
      total_amount_usdc: payload.amount,
      milestones: (payload.milestones ?? []).map((m) => ({ ...m, status: "Pending" })),
      status: "draft",
    };
    try {
      const data = await apiFetch<{ deal?: { milestones?: unknown[] } & Record<string, unknown> }>(
        `/api/deals/${payload.dealId}`
      );
      if (data.deal) {
        const supabaseDeal = data.deal;
        const milestones =
          (supabaseDeal.milestones?.length ?? 0) > 0
            ? supabaseDeal.milestones
            : (payload.milestones ?? []).map((m) => ({ ...m, status: "Pending" }));
        sessionStorage.setItem(`deal:${payload.dealId}`, JSON.stringify({
          ...supabaseDeal,
          milestones,
          [myField]: me,
        }));
      } else {
        sessionStorage.setItem(`deal:${payload.dealId}`, JSON.stringify(minimal));
      }
    } catch {
      // Not found or network error — save the minimal record.
      try {
        sessionStorage.setItem(`deal:${payload.dealId}`, JSON.stringify(minimal));
      } catch {}
    }

    // 2. Accept as MYSELF via the server. The route fills my slot from my
    //    authenticated session (no acting-as-the-inviter) and creates the deal
    //    row from the invite payload if the inviter's mirror never landed.
    await apiFetchSafe(`/api/deals/${payload.dealId}/accept-invite`, {
      method: "POST",
      body: {
        inviter,
        inviterRole,
        dealTitle: payload.dealTitle,
        description: payload.description ?? "",
        amount: payload.amount,
        milestones: payload.milestones ?? [],
      },
    }, undefined);

    setTimeout(() => {
      router.push(`/negotiate/${payload!.dealId}`);
    }, 800);
  }

  async function handleNameContinue() {
    if (!sellerWallet) return;

    const displayName = nameDraft.trim();
    if (displayName.length < 2) {
      setNameError("Enter your name to continue.");
      return;
    }

    setSavingName(true);
    setNameError("");

    const handle = createInviteHandle(displayName, sellerWallet);

    try {
      await apiFetch(`/api/users/${encodeURIComponent(sellerWallet)}/profile`, {
        method: "PUT",
        wallet: sellerWallet,
        body: { handle, display_name: displayName },
      });

      updateProfile({
        name: displayName,
        username: handle,
        bio: "",
        socials: {
          twitter: "",
          telegram: "",
          instagram: "",
          linkedin: "",
          website: "",
        },
        onboardingComplete: true,
      });
      setAccountCheck({ wallet: sellerWallet, hasAccount: true });
      await handleAccept();
    } catch (error) {
      setAccepted(false);
      setNameError(error instanceof Error ? error.message : "Failed to create profile");
    } finally {
      setSavingName(false);
    }
  }

  const isConnected = !!publicKey;
  const isCheckingAccount = isConnected && accountCheck?.wallet !== sellerWallet;
  const needsName = isConnected && !isCheckingAccount && accountCheck?.hasAccount === false;
  const inviterHandle = atDisplayHandle(inviterStats?.handle);

  return (
    <InviteShell>
      <div className="max-w-lg mx-auto px-4 py-12 space-y-6">
        {/* Invitation header */}
        <div className="text-center space-y-2">
          <p className="text-[13px] text-muted">You&apos;ve been invited to a deal by</p>
          {/* Avatar */}
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-brand/20 border-2 border-brand/30 flex items-center justify-center text-[22px] text-brand" style={{ fontWeight: 590 }}>
              {inviterStats?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={inviterStats.avatar_url} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                (inviterStats?.display_name ?? payload.inviterName)
                  .split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase()
              )}
            </div>
          </div>
          <div>
            <p className="text-[20px] text-primary" style={{ fontWeight: 590 }}>
              {inviterStats?.display_name ?? payload.inviterName}
            </p>
            {inviterHandle && (
              <p className="text-[13px] text-muted">{inviterHandle}</p>
            )}
            <p className="text-[12px] text-subtle">{formatWallet(inviterWallet)}</p>
          </div>
          {inviterStats?.bio && (
            <p className="text-[13px] text-foreground leading-relaxed max-w-xs mx-auto">{inviterStats.bio}</p>
          )}
          {/* Social links */}
          {inviterStats && (inviterStats.website || inviterStats.twitter_handle || inviterStats.linkedin_url || inviterStats.instagram_handle) && (
            <div className="flex items-center justify-center gap-3 flex-wrap">
              {inviterStats.website && (
                <a href={inviterStats.website.startsWith("http") ? inviterStats.website : `https://${inviterStats.website}`} target="_blank" rel="noopener noreferrer" className="text-[12px] text-muted hover:text-accent transition-colors flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                  Website
                </a>
              )}
              {inviterStats.twitter_handle && (
                <a href={`https://x.com/${inviterStats.twitter_handle.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="text-[12px] text-muted hover:text-accent transition-colors">
                  𝕏 {inviterStats.twitter_handle.replace(/^@/, "")}
                </a>
              )}
              {inviterStats.linkedin_url && (
                <a href={inviterStats.linkedin_url.startsWith("http") ? inviterStats.linkedin_url : `https://${inviterStats.linkedin_url}`} target="_blank" rel="noopener noreferrer" className="text-[12px] text-muted hover:text-accent transition-colors">
                  LinkedIn
                </a>
              )}
              {inviterStats.instagram_handle && (
                <a href={`https://instagram.com/${inviterStats.instagram_handle.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="text-[12px] text-muted hover:text-accent transition-colors">
                  IG @{inviterStats.instagram_handle.replace(/^@/, "")}
                </a>
              )}
            </div>
          )}
          {/* Company doc */}
          {inviterStats?.company_file_name && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface border border-card-border text-[12px] text-muted">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              {inviterStats.company_file_name}
            </div>
          )}
        </div>

        {/* Deal preview card */}
        <div className="surface-card rounded-xl overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-card-border-subtle">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p
                  className="text-[15px] text-primary capitalize"
                  style={{ fontWeight: 590 }}
                >
                  {payload.dealTitle}
                </p>
                <p className="text-[12px] text-muted mt-0.5">
                  Deal ID: {payload.dealId}
                </p>
              </div>
              <span className="pill-neutral text-warning mt-0.5 flex-shrink-0">
                Pending
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 divide-x divide-card-border-subtle">
            <div className="px-5 py-4">
              <p className="text-[11px] text-muted mb-1" style={{ fontWeight: 510 }}>
                Total value
              </p>
              <p className="text-[20px] text-primary tabular-nums" style={{ fontWeight: 590 }}>
                ${payload.amount.toLocaleString()}
              </p>
              <p className="text-[11px] text-muted">{payload.currency}</p>
            </div>
            <div className="px-5 py-4">
              <p className="text-[11px] text-muted mb-1" style={{ fontWeight: 510 }}>
                Milestones
              </p>
              <p className="text-[20px] text-primary tabular-nums" style={{ fontWeight: 590 }}>
                {payload.milestoneCount}
              </p>
              <p className="text-[11px] text-muted">payment stages</p>
            </div>
          </div>

          {/* About the inviter */}
          <div className="px-5 py-4 border-t border-card-border-subtle space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-[11px] text-muted" style={{ fontWeight: 510 }}>
                About the inviter
              </p>
              {inviterStats?.is_verified && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-[10px] text-accent" style={{ fontWeight: 510 }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Verified
                </span>
              )}
            </div>

            {inviterStats ? (
              <div className="grid grid-cols-3 gap-3">
                {/* Total deals */}
                <div className="rounded-lg bg-surface border border-card-border px-3 py-2.5 text-center">
                  <p className="text-[18px] text-primary tabular-nums" style={{ fontWeight: 700 }}>
                    {inviterStats.deals_total}
                  </p>
                  <p className="text-[11px] text-muted mt-0.5">Total deals</p>
                </div>

                {/* Completion rate */}
                <div className="rounded-lg bg-surface border border-card-border px-3 py-2.5 text-center">
                  <p className="text-[18px] tabular-nums" style={{
                    fontWeight: 700,
                    color: inviterStats.deals_total === 0 ? "var(--muted)" :
                      (inviterStats.deals_successful / inviterStats.deals_total) >= 0.8 ? "#22c55e" :
                      (inviterStats.deals_successful / inviterStats.deals_total) >= 0.5 ? "#f59e0b" : "#ef4444"
                  }}>
                    {inviterStats.deals_total === 0
                      ? "—"
                      : `${Math.round((inviterStats.deals_successful / inviterStats.deals_total) * 100)}%`}
                  </p>
                  <p className="text-[11px] text-muted mt-0.5">Completion</p>
                </div>

                {/* Rating */}
                <div className="rounded-lg bg-surface border border-card-border px-3 py-2.5 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <p className="text-[18px] text-primary tabular-nums" style={{ fontWeight: 700 }}>
                      {inviterStats.avg_rating > 0 ? inviterStats.avg_rating.toFixed(1) : "—"}
                    </p>
                    {inviterStats.avg_rating > 0 && (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="#f59e0b" stroke="none">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    )}
                  </div>
                  <p className="text-[11px] text-muted mt-0.5">Avg rating</p>
                </div>
              </div>
            ) : (
              /* Skeleton while loading */
              <div className="grid grid-cols-3 gap-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="rounded-lg bg-surface border border-card-border px-3 py-2.5 h-14 animate-pulse" />
                ))}
              </div>
            )}

            {payload.description && (
              <p className="text-[12px] text-muted leading-relaxed">{payload.description}</p>
            )}
          </div>
        </div>

        {/* How it works */}
        <div className="space-y-2">
          <p className="text-[12px] text-muted" style={{ fontWeight: 510 }}>
            How it works
          </p>
          <div className="space-y-2">
            {[
              "Connect your wallet — this becomes your on-chain identity",
              "Set up your profile so the agent can represent you in negotiations",
              "Review and accept the deal terms — funds are locked in escrow",
              "Complete milestones and get paid automatically when confirmed",
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <span
                  className="w-5 h-5 rounded-full bg-surface border border-card-border flex-shrink-0 flex items-center justify-center text-[11px] text-muted mt-0.5"
                  style={{ fontWeight: 510 }}
                >
                  {i + 1}
                </span>
                <p className="text-[13px] text-foreground">{step}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Trust line */}
        <div className="flex items-center gap-3 rounded-md bg-surface border border-card-border px-4 py-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-success flex-shrink-0">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <p className="text-[12px] text-muted">
            Funds are held in a Solana smart contract — neither party can access them until milestones are confirmed.
          </p>
        </div>

        {/* CTA */}
        {!isConnected ? (
          <div className="space-y-3 text-center">
            <p className="text-[13px] text-muted">
              Connect your wallet to accept this deal
            </p>
            <WalletMultiButton />
          </div>
        ) : isCheckingAccount ? (
          <div className="flex items-center justify-center gap-2 h-11 rounded-md bg-surface border border-card-border">
            <span className="h-1.5 w-1.5 rounded-full bg-muted animate-pulse" />
            <span className="text-[13px] text-muted" style={{ fontWeight: 510 }}>
              Checking your Sealed profile...
            </span>
          </div>
        ) : needsName ? (
          <div className="rounded-xl border border-card-border bg-surface px-4 py-4 space-y-3">
            <div>
              <p className="text-[13px] text-primary" style={{ fontWeight: 590 }}>
                Tell the inviter who is joining
              </p>
              <p className="text-[12px] text-muted mt-0.5">
                This creates your Sealed profile for this deal.
              </p>
            </div>
            <label className="block space-y-1.5">
              <span className="text-[12px] text-muted" style={{ fontWeight: 510 }}>
                Your name
              </span>
              <input
                value={nameDraft}
                onChange={(e) => {
                  setNameDraft(e.target.value);
                  if (nameError) setNameError("");
                }}
                type="text"
                autoComplete="name"
                placeholder="e.g. Maya Chen"
                className="w-full h-10 rounded-md bg-background border border-card-border px-3 text-[14px] text-primary placeholder:text-subtle focus:border-accent focus:outline-none disabled:opacity-60"
                disabled={savingName || accepted}
              />
            </label>
            {nameError && (
              <p className="text-[12px] text-danger">{nameError}</p>
            )}
            <button
              type="button"
              onClick={handleNameContinue}
              disabled={savingName || accepted}
              className="btn-primary w-full h-11 rounded-md text-[14px] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {savingName || accepted ? "Joining deal..." : "Continue to negotiation"}
            </button>
          </div>
        ) : accepted ? (
          <div className="flex items-center justify-center gap-2 h-11 rounded-md bg-success/10 border border-success/20">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-success">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="text-[13px] text-success" style={{ fontWeight: 510 }}>
              Joining deal…
            </span>
          </div>
        ) : (
          <button
            onClick={handleAccept}
            className="btn-primary w-full h-11 rounded-md text-[14px]"
          >
            Accept & join this deal
          </button>
        )}

        <p className="text-center text-[11px] text-subtle">
          By accepting, you agree to Sealed&apos;s{" "}
          <Link href="/" className="text-muted hover:text-accent transition-colors underline">
            terms of service
          </Link>
          .
        </p>
      </div>
    </InviteShell>
  );
}

function isShortWallet(wallet: string) {
  return wallet.includes("...") || wallet.includes("…");
}

function formatWallet(wallet: string) {
  if (!wallet) return "";
  if (isShortWallet(wallet)) return wallet;
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

function isUsableWallet(wallet: string) {
  return wallet.length >= 32 && !isShortWallet(wallet);
}

function createInviteHandle(name: string, wallet: string) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "guest";

  return `${base}-${wallet.slice(0, 4).toLowerCase()}${wallet.slice(-4).toLowerCase()}`;
}

async function resolveInviterWallet(payload: InvitePayload) {
  if (isUsableWallet(payload.inviterWallet)) return payload.inviterWallet;

  const data = await apiFetchSafe<{ deal?: { buyer_wallet?: string } }>(
    `/api/deals/${encodeURIComponent(payload.dealId)}`, {}, {}
  );
  return data?.deal?.buyer_wallet ?? payload.inviterWallet;
}

function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-card-border-subtle bg-panel">
        <div className="max-w-5xl mx-auto px-6 sm:px-8 lg:px-10 h-14 flex items-center">
          <Link
            href="/"
            className="flex items-center gap-2 group text-primary"
            aria-label="Sealed Agent home"
          >
            <SealedMark size={28} />
            <span
              className="text-[15px] tracking-tight"
              style={{ fontWeight: 510 }}
            >
              Sealed Agent
            </span>
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

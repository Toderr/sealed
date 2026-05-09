"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { SealedMark } from "@/components/SealedLogo";
import { decodeInvite } from "@/lib/profile-store";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

export default function InvitePage() {
  const params = useParams();
  const { publicKey } = useWallet();
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);

  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  const payload = useMemo(() => {
    if (!token) return null;
    return decodeInvite(decodeURIComponent(token));
  }, [token]);

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

    const sellerWallet = publicKey.toBase58();

    // 1. Fetch full deal from Supabase and save to this browser's sessionStorage
    //    so the negotiate room can load it even before Supabase propagates the PATCH.
    try {
      const res = await fetch(`/api/deals/${payload.dealId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.deal) {
          const supabaseDeal = data.deal;
          // If Supabase deal has no milestones, use the ones from the invite token
          const milestones =
            supabaseDeal.milestones?.length > 0
              ? supabaseDeal.milestones
              : (payload.milestones ?? []).map((m) => ({ ...m, status: "Pending" }));
          sessionStorage.setItem(`deal:${payload.dealId}`, JSON.stringify({
            ...supabaseDeal,
            milestones,
            seller_wallet: sellerWallet,
          }));
        }
      } else {
        // Supabase doesn't have the deal yet — build a minimal record from the
        // invite token so the negotiate room still loads for the counterparty.
        const minimal = {
          deal_id: payload.dealId,
          buyer_wallet: payload.inviterWallet,
          seller_wallet: sellerWallet,
          title: payload.dealTitle,
          description: payload.description ?? "",
          total_amount_usdc: payload.amount,
          milestones: (payload.milestones ?? []).map((m) => ({ ...m, status: "Pending" })),
          status: "draft",
        };
        sessionStorage.setItem(`deal:${payload.dealId}`, JSON.stringify(minimal));
      }
    } catch {
      // Network error — still save minimal record
      try {
        const minimal = {
          deal_id: payload.dealId,
          buyer_wallet: payload.inviterWallet,
          seller_wallet: sellerWallet,
          title: payload.dealTitle,
          description: payload.description ?? "",
          total_amount_usdc: payload.amount,
          milestones: (payload.milestones ?? []).map((m) => ({ ...m, status: "Pending" })),
          status: "draft",
        };
        sessionStorage.setItem(`deal:${payload.dealId}`, JSON.stringify(minimal));
      } catch {}
    }

    // 2. Register this wallet as the seller on the deal
    try {
      await fetch(`/api/deals/${payload.dealId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-wallet": sellerWallet,
        },
        body: JSON.stringify({ seller_wallet: sellerWallet }),
      });
    } catch {
      // non-fatal — navigate anyway
    }

    setTimeout(() => {
      router.push(`/negotiate/${payload!.dealId}`);
    }, 800);
  }

  const isConnected = !!publicKey;

  return (
    <InviteShell>
      <div className="max-w-lg mx-auto px-4 py-12 space-y-6">
        {/* Invitation header */}
        <div className="text-center space-y-1">
          <p className="text-[13px] text-muted">You&apos;ve been invited to a deal by</p>
          <p className="text-[20px] text-primary" style={{ fontWeight: 590 }}>
            {payload.inviterName}
          </p>
          <p className="text-[12px] text-subtle">{payload.inviterWallet}</p>
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

          {/* Description */}
          {payload.description && (
            <div className="px-5 py-4 border-t border-card-border-subtle">
              <p className="text-[11px] text-muted mb-1.5" style={{ fontWeight: 510 }}>
                About the inviter
              </p>
              <p className="text-[13px] text-foreground leading-relaxed">
                {payload.description}
              </p>
            </div>
          )}
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

function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center px-6 h-14 border-b border-card-border-subtle bg-panel">
        <Link href="/" className="flex items-center gap-2 text-primary">
          <SealedMark size={24} title="Sealed" />
          <span
            className="text-[14px] tracking-tight"
            style={{ fontWeight: 510 }}
          >
            Sealed Agent
          </span>
        </Link>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

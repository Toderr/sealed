"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { SealedMark } from "@/components/SealedLogo";
import type { PublicProfile } from "@/lib/types";

const labelStyle: React.CSSProperties = { fontWeight: 510, letterSpacing: "-0.006em" };
const headingStyle: React.CSSProperties = { fontWeight: 590, letterSpacing: "-0.014em" };

type FullProfile = PublicProfile & {
  bio?: string;
  socials?: {
    twitter?: string;
    telegram?: string;
    instagram?: string;
    linkedin?: string;
    website?: string;
  };
};

export default function PublicProfilePage() {
  const params = useParams();
  const wallet = Array.isArray(params.wallet) ? params.wallet[0] : params.wallet;

  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!wallet) return;
    fetch(`/api/users/${wallet}/public`)
      .then((r) => r.json())
      .then((data: FullProfile) => {
        setProfile(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [wallet]);

  const shortWallet = wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-6)}` : "";
  const initials = profile?.handle
    ? profile.handle.slice(0, 2).toUpperCase()
    : shortWallet.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center px-6 h-14 border-b border-card-border-subtle bg-panel">
        <Link href="/app" className="flex items-center gap-2 text-primary">
          <SealedMark size={24} title="Sealed" />
          <span className="text-[14px] tracking-tight" style={{ fontWeight: 510 }}>Sealed</span>
        </Link>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-10">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="flex gap-1">{[0, 150, 300].map((d) => <span key={d} className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: `${d}ms` }} />)}</div>
          </div>
        ) : !profile ? (
          <div className="text-center py-24">
            <p className="text-[16px] text-primary" style={headingStyle}>Profile not found</p>
            <p className="text-[13px] text-muted mt-1">{shortWallet}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start gap-5">
              <div className="w-16 h-16 rounded-xl bg-brand/20 border border-brand/30 flex items-center justify-center text-[22px] text-accent flex-shrink-0" style={headingStyle}>
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-[20px] text-primary" style={headingStyle}>
                    {profile.handle ? `@${profile.handle}` : shortWallet}
                  </h1>
                  {profile.is_verified && (
                    <span className="flex items-center gap-1 text-[12px] text-success">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" />
                      </svg>
                      Verified
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-subtle font-mono mt-0.5">{shortWallet}</p>
                {profile.member_since && (
                  <p className="text-[12px] text-muted mt-1">Member since {new Date(profile.member_since).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Completed deals" value={profile.deals_successful} />
              <StatCard label="Total deals" value={profile.deals_total} />
              <StatCard
                label="Success rate"
                value={profile.deals_total > 0 ? `${Math.round((profile.deals_successful / profile.deals_total) * 100)}%` : "—"}
              />
              <StatCard
                label="Avg rating"
                value={profile.avg_rating > 0 ? `${profile.avg_rating.toFixed(1)} ★` : "—"}
              />
            </div>

            {/* Socials */}
            {profile.socials && Object.values(profile.socials).some(Boolean) && (
              <div className="surface-card rounded-xl p-5 space-y-3">
                <p className="text-[13px] text-primary" style={labelStyle}>Contact & socials</p>
                <div className="flex flex-wrap gap-3">
                  {profile.socials.twitter && (
                    <SocialLink href={profile.socials.twitter} label="Twitter / X" />
                  )}
                  {profile.socials.telegram && (
                    <SocialLink href={profile.socials.telegram} label="Telegram" />
                  )}
                  {profile.socials.linkedin && (
                    <SocialLink href={profile.socials.linkedin} label="LinkedIn" />
                  )}
                  {profile.socials.instagram && (
                    <SocialLink href={profile.socials.instagram} label="Instagram" />
                  )}
                  {profile.socials.website && (
                    <SocialLink href={profile.socials.website} label="Website" />
                  )}
                </div>
              </div>
            )}

            <Link href="/app" className="btn-ghost h-9 px-5 rounded-md text-[13px] inline-flex items-center gap-2">
              ← Back
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="surface-card rounded-xl p-4 space-y-1">
      <p className="text-[11px] text-muted uppercase tracking-[0.06em]" style={{ fontWeight: 510 }}>{label}</p>
      <p className="text-[20px] text-primary tabular-nums" style={{ fontWeight: 590 }}>{value}</p>
    </div>
  );
}

function SocialLink({ href, label }: { href: string; label: string }) {
  const url = href.startsWith("http") ? href : `https://${href}`;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="btn-ghost h-8 px-3 rounded-md text-[12px] inline-flex items-center gap-1.5">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
      </svg>
      {label}
    </a>
  );
}

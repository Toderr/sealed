"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAppWallet as useWallet } from "@/lib/use-app-wallet";
import { SealedMark } from "@/components/SealedLogo";
import { SealedBackdrop } from "@/components/SealedBackdrop";
import { NotificationMenu } from "@/components/NotificationMenu";
import { atDisplayHandle, displayHandle } from "@/lib/user-display";
import type { PublicProfile } from "@/lib/types";
import { apiFetch, apiFetchSafe } from "@/lib/api-client";
import { SelfProfilePage } from "../SelfProfilePage";

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

type FriendStatus = "none" | "friends" | "outgoing" | "incoming" | "self";
type Tab = "timeline" | "reviews" | "agents";

export default function PublicProfilePage() {
  const params = useParams();
  const profileWallet = Array.isArray(params.wallet) ? params.wallet[0] : params.wallet;
  const { publicKey } = useWallet();
  const myWallet = publicKey?.toBase58() ?? null;

  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [friendStatus, setFriendStatus] = useState<FriendStatus>("none");
  const [friendLoading, setFriendLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("timeline");

  const wallet = profileWallet;
  const isSelf = Boolean(wallet && myWallet === wallet);

  useEffect(() => {
    if (!wallet || isSelf) return;
    apiFetch<FullProfile>(`/api/users/${wallet}/public`)
      .then((data) => { setProfile(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [wallet, isSelf]);

  useEffect(() => {
    if (!myWallet || !wallet || myWallet === wallet) return;
    apiFetchSafe<{ status?: FriendStatus }>(`/api/friends/status?with=${wallet}`, { wallet: myWallet }, {})
      .then((d) => { if (d.status) setFriendStatus(d.status); });
  }, [myWallet, wallet]);

  async function handleFriendAction() {
    if (!myWallet || !wallet) return;
    setFriendLoading(true);

    if (friendStatus === "none") {
      const d = await apiFetchSafe<{ status?: string }>("/api/friends", {
        method: "POST",
        wallet: myWallet,
        body: { friendWallet: wallet },
      }, {});
      if (d.status) setFriendStatus(d.status === "accepted" ? "friends" : "outgoing");
    } else if (friendStatus === "incoming") {
      await apiFetchSafe(`/api/friends/${wallet}`, {
        method: "PATCH",
        wallet: myWallet,
        body: { action: "accept" },
      }, undefined);
      setFriendStatus("friends");
    } else if (friendStatus === "friends" || friendStatus === "outgoing") {
      await apiFetchSafe(`/api/friends/${wallet}`, {
        method: "DELETE",
        wallet: myWallet,
      }, undefined);
      setFriendStatus("none");
    }

    setFriendLoading(false);
  }

  if (isSelf) return <SelfProfilePage />;

  const displayUsername = atDisplayHandle(profile?.handle);
  const profileDisplayName =
    profile?.display_name?.trim() || displayUsername || "Sealed user";
  const profileUsername = displayUsername;
  const initialsSource = profile?.display_name?.trim() || displayHandle(profile?.handle) || "SU";
  const initials = initialsSource
    .replace(/^@/, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", display: "flex", flexDirection: "column", position: "relative" }}>
      <SealedBackdrop />

      {/* Header */}
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
        <Link href="/app" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--primary)", textDecoration: "none" }}>
          <SealedMark size={22} />
          <span style={{ fontSize: 13, fontWeight: 510 }}>Sealed Agent</span>
        </Link>
        <NotificationMenu wallet={myWallet} />
      </header>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {[0, 150, 300].map((d) => (
              <span key={d} style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--muted)", animation: `sealed-pulse 1.2s ${d}ms infinite ease-in-out` }} />
            ))}
          </div>
        </div>
      ) : !profile ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, textAlign: "center" }}>
          <p style={{ fontSize: 16, color: "var(--primary)", fontWeight: 590 }}>Profile not found</p>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>This Sealed profile is not available yet.</p>
          <Link href="/app" className="btn-ghost" style={{ height: 32, padding: "0 14px", borderRadius: 6, fontSize: 12, marginTop: 8, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>← Back</Link>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", position: "relative", zIndex: 1 }}>
          {/* Hero band */}
          <div style={{
            padding: "36px 32px 0",
            background: "radial-gradient(circle at 20% 0%, rgba(113,112,255,0.08), transparent 60%)",
          }}>
            <div style={{ maxWidth: 1020, margin: "0 auto", display: "grid", gridTemplateColumns: "400px 1fr", gap: 28, alignItems: "stretch" }}>
              {/* Trust card */}
              <div style={{
                borderRadius: 16,
                padding: 22,
                background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))",
                border: "1px solid var(--card-border)",
                position: "relative",
                overflow: "hidden",
              }}>
                {/* Watermark */}
                <div style={{ position: "absolute", right: -20, top: -20, opacity: 0.04, color: "var(--accent)" }}>
                  <SealedMark size={180} />
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14, position: "relative" }}>
                  <div style={{
                    width: 72,
                    height: 72,
                    borderRadius: 16,
                    background: "linear-gradient(135deg, rgba(113,112,255,0.55), rgba(94,106,210,0.3))",
                    border: "1.5px solid rgba(113,112,255,0.4)",
                    color: "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                    fontWeight: 590,
                    flexShrink: 0,
                  }}>
                    {initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <p style={{ fontSize: 18, fontWeight: 590, color: "var(--primary)", margin: 0, letterSpacing: "-0.012em" }}>
                        {profileDisplayName}
                      </p>
                      {profile.is_verified && (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "2px 7px", borderRadius: 9999,
                          background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)",
                          color: "var(--success)", fontSize: 10, fontWeight: 510,
                        }}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" />
                          </svg>
                          Verified
                        </span>
                      )}
                    </div>
                    {profileUsername && profile.display_name && (
                      <p style={{ fontSize: 12, color: "var(--muted)", margin: "2px 0 0" }}>
                        {profileUsername}
                      </p>
                    )}
                    {profile.bio && (
                      <p style={{ fontSize: 12, color: "var(--foreground)", margin: "10px 0 0", lineHeight: 1.55 }}>
                        {profile.bio}
                      </p>
                    )}
                    {profile.member_since && (
                      <p style={{ fontSize: 11, color: "var(--subtle)", margin: "6px 0 0" }}>
                        Member since {new Date(profile.member_since).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                      </p>
                    )}
                  </div>
                </div>

                {/* Big trust score */}
                <div style={{ marginTop: 22, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, position: "relative" }}>
                  <TrustStat value={profile.deals_total ?? 0} label="Deals done" />
                  <TrustStat
                    value={profile.deals_total > 0 ? `${Math.round((profile.deals_successful / profile.deals_total) * 100)}%` : "—"}
                    label="Completion"
                    accent="success"
                  />
                  <TrustStat
                    value={profile.avg_rating > 0 ? profile.avg_rating.toFixed(1) : "—"}
                    label="Avg rating"
                    star={profile.avg_rating > 0}
                  />
                </div>

                {/* Trust seal */}
                {profile.deals_total > 0 && (
                  <div style={{
                    marginTop: 18, padding: "12px 14px", borderRadius: 10,
                    background: "rgba(113,112,255,0.05)", border: "1px solid rgba(113,112,255,0.18)",
                    display: "flex", alignItems: "center", gap: 12, position: "relative",
                  }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: "50%",
                      background: "var(--background)", border: "1px solid var(--accent)",
                      display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--accent)",
                      flexShrink: 0,
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" />
                      </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, color: "var(--accent)", margin: 0, fontWeight: 590 }}>
                        {profile.deals_successful} sealed · 0 disputes
                      </p>
                      <p style={{ fontSize: 11, color: "var(--muted)", margin: "1px 0 0" }}>On-chain verified deal history</p>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                {!isSelf && myWallet && (
                  <button
                    onClick={handleFriendAction}
                    disabled={friendLoading || friendStatus === "outgoing"}
                    className="btn-primary"
                    style={{ marginTop: 18, width: "100%", height: 42, borderRadius: 9, fontSize: 13, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, position: "relative", cursor: "pointer" }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m11 17 2 2a1 1 0 0 0 3-3" /><path d="m14 14 2.5 2.5a1 1 0 0 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 0 1-1.41 0l-2.62-2.62a1 1 0 0 0-1.41 0L3 10.5" />
                    </svg>
                    {friendLoading ? "…" : friendStatus === "friends" ? "Friends ✓" : friendStatus === "outgoing" ? "Request sent" : friendStatus === "incoming" ? "Accept request" : "Start a deal"}
                  </button>
                )}
                <button
                  onClick={() => {
                    const url = `${window.location.origin}/profile/${wallet}`;
                    navigator.clipboard.writeText(url).catch(() => {});
                  }}
                  className="btn-ghost"
                  style={{ marginTop: 8, width: "100%", height: 36, borderRadius: 9, fontSize: 12, position: "relative", cursor: "pointer" }}
                >
                  Copy profile link
                </button>
              </div>

              {/* Right: narrative */}
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--accent)", margin: 0, fontWeight: 510 }}>
                    Reputation on Sealed
                  </p>
                  <h1 style={{ fontSize: 32, fontWeight: 590, letterSpacing: "-0.024em", color: "var(--primary)", margin: "10px 0 0", lineHeight: 1.1 }}>
                    {profile.deals_total > 0
                      ? `${profile.deals_total} deal${profile.deals_total === 1 ? "" : "s"} sealed on-chain.`
                      : "New to Sealed."}
                  </h1>
                  <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 14, lineHeight: 1.6, maxWidth: 500 }}>
                    {profile.deals_total > 0
                      ? "Every number on this profile traces to an on-chain Sealed deal. No self-reported volume, no decorative stats."
                      : "This wallet hasn't sealed a deal yet. All stats will appear here once deals are sealed on-chain."}
                  </p>
                </div>

                {/* Socials */}
                {profile.socials && Object.values(profile.socials).some(Boolean) && (
                  <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {profile.socials.twitter && <SocialBtn href={profile.socials.twitter} label="Twitter / X" />}
                    {profile.socials.telegram && <SocialBtn href={profile.socials.telegram} label="Telegram" />}
                    {profile.socials.linkedin && <SocialBtn href={profile.socials.linkedin} label="LinkedIn" />}
                    {profile.socials.instagram && <SocialBtn href={profile.socials.instagram} label="Instagram" />}
                    {profile.socials.website && <SocialBtn href={profile.socials.website} label="Website" />}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tabs + content */}
          <div style={{ maxWidth: 1020, margin: "0 auto", padding: "26px 32px 48px" }}>
            <div style={{ display: "flex", gap: 14, marginBottom: 16, borderBottom: "1px solid var(--card-border-subtle)" }}>
              {([
                { id: "timeline", label: "Deal timeline" },
                { id: "reviews",  label: "Reviews" },
                { id: "agents",   label: "Active agents" },
              ] as { id: Tab; label: string }[]).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    padding: "10px 4px",
                    marginBottom: -1,
                    borderBottom: `2px solid ${tab === t.id ? "var(--accent)" : "transparent"}`,
                    color: tab === t.id ? "var(--primary)" : "var(--muted)",
                    fontSize: 13,
                    fontWeight: tab === t.id ? 590 : 510,
                    background: "none",
                    border: "none",
                    borderBottomStyle: "solid",
                    borderBottomWidth: 2,
                    borderBottomColor: tab === t.id ? "var(--accent)" : "transparent",
                    cursor: "pointer",
                    transition: "color 150ms",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "timeline" && (
              profile.deals_total > 0 ? (
                <div style={{ textAlign: "center", padding: "48px 0", color: "var(--muted)", fontSize: 13 }}>
                  Deal timeline will appear here as deals are sealed.
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "48px 0", color: "var(--subtle)", fontSize: 13 }}>
                  No sealed deals yet.
                </div>
              )
            )}

            {tab === "reviews" && (
              <div style={{ textAlign: "center", padding: "48px 0", color: "var(--subtle)", fontSize: 13 }}>
                {profile.avg_rating > 0 ? "Reviews will load here." : "No reviews yet."}
              </div>
            )}

            {tab === "agents" && (
              <div style={{ textAlign: "center", padding: "48px 0", color: "var(--subtle)", fontSize: 13 }}>
                No public agent profiles.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TrustStat({
  value,
  label,
  accent,
  star,
}: {
  value: string | number;
  label: string;
  accent?: "success";
  star?: boolean;
}) {
  const color = accent === "success" ? "var(--success)" : "var(--primary)";
  return (
    <div>
      <div style={{
        fontSize: 28,
        fontWeight: 590,
        color,
        letterSpacing: "-0.022em",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
        {star && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--warning)" stroke="none">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        )}
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, fontWeight: 510 }}>{label}</div>
    </div>
  );
}

function SocialBtn({ href, label }: { href: string; label: string }) {
  const url = href.startsWith("http") ? href : `https://${href}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="btn-ghost"
      style={{ height: 30, padding: "0 12px", borderRadius: 6, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
      </svg>
      {label}
    </a>
  );
}

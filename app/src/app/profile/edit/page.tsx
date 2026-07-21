"use client";

// Dedicated identity-edit page (N10). Previously "Edit profile" dropped users
// into the full onboarding wizard (/onboarding?edit=1); this edits ONLY the
// identity fields (name, handle, bio, socials). Agent config has its own tab.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAppWallet as useWallet } from "@/lib/use-app-wallet";
import { SealedMark } from "@/components/SealedLogo";
import { SealedBackdrop } from "@/components/SealedBackdrop";
import { useProfileStore } from "@/lib/profile-store";
import { apiFetchSafe } from "@/lib/api-client";
import { useToast } from "@/components/Toast";
import WalletMultiButton from "@/components/AppWalletButton";

export default function EditProfilePage() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const { profile, loaded, updateProfile } = useProfileStore(wallet);
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [instagram, setInstagram] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [website, setWebsite] = useState("");
  const [saving, setSaving] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  // Prefill from the current profile once it loads.
  useEffect(() => {
    if (!profile || prefilled) return;
    setName(profile.name);
    setUsername(profile.username);
    setBio(profile.bio);
    setTwitter(profile.socials.twitter);
    setTelegram(profile.socials.telegram);
    setInstagram(profile.socials.instagram);
    setLinkedin(profile.socials.linkedin);
    setWebsite(profile.socials.website);
    setPrefilled(true);
  }, [profile, prefilled]);

  // A wallet with no profile yet shouldn't edit — send them to onboarding.
  useEffect(() => {
    if (loaded && wallet && !profile) router.replace("/onboarding");
  }, [loaded, wallet, profile, router]);

  async function handleSave() {
    if (!wallet || !name.trim() || !username.trim()) return;
    setSaving(true);
    const handle = username.trim().replace(/^@/, "");
    updateProfile({
      name: name.trim(),
      username: handle,
      bio: bio.trim(),
      socials: {
        twitter: twitter.trim(),
        telegram: telegram.trim(),
        instagram: instagram.trim(),
        linkedin: linkedin.trim(),
        website: website.trim(),
      },
    });
    await apiFetchSafe(
      `/api/users/${wallet}/profile`,
      {
        method: "PUT",
        wallet,
        body: {
          handle,
          display_name: name.trim(),
          bio: bio.trim(),
          website: website.trim() || undefined,
          twitter_handle: twitter.trim() || undefined,
          linkedin_url: linkedin.trim() || undefined,
          instagram_handle: instagram.trim() || undefined,
          telegram_handle: telegram.trim() || undefined,
        },
      },
      undefined
    );
    toast.show({ variant: "success", title: "Profile updated" });
    router.push(`/profile/${wallet}`);
  }

  if (!loaded) return null;

  if (!wallet) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 px-4 text-center">
        <SealedMark size={44} title="Sealed" />
        <p className="text-[15px] text-muted">Connect your wallet to edit your profile.</p>
        <WalletMultiButton />
      </div>
    );
  }

  const canSave = name.trim().length > 0 && username.trim().length > 0 && !saving;

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", position: "relative" }}>
      <SealedBackdrop />
      <header
        style={{
          display: "flex", alignItems: "center", gap: 16, padding: "0 22px", height: 52,
          borderBottom: "1px solid var(--card-border-subtle)", background: "var(--panel)",
          position: "sticky", top: 0, zIndex: 10,
        }}
      >
        <Link href={`/profile/${wallet}`} style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--primary)", textDecoration: "none" }}>
          <SealedMark size={22} />
          <span style={{ fontSize: 13, fontWeight: 510 }}>Sealed Agent</span>
        </Link>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>›</span>
        <span style={{ fontSize: 12, color: "var(--foreground)" }}>Edit profile</span>
      </header>

      <main style={{ maxWidth: 680, margin: "0 auto", padding: "32px 20px 80px", position: "relative", zIndex: 1 }}>
        <h1 className="text-[22px] text-primary" style={{ fontWeight: 590, letterSpacing: "-0.02em", margin: "0 0 4px" }}>Edit your identity</h1>
        <p className="text-[13px] text-muted" style={{ margin: "0 0 24px" }}>
          Update how counterparties see you. Your agent settings live on the <Link href={`/profile/${wallet}?tab=settings`} style={{ color: "var(--accent)" }}>Settings</Link> tab.
        </p>

        <div className="surface-card" style={{ borderRadius: 12, padding: 22, display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Display name" required>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" style={inputStyle} />
            </Field>
            <Field label="Handle" required>
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@handle" style={inputStyle} />
            </Field>
          </div>
          <Field label="Short bio">
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="A line about you." rows={3} style={{ ...inputStyle, resize: "vertical", height: "auto", paddingTop: 8 }} />
          </Field>
          <div>
            <p className="text-[12px] text-muted" style={{ margin: "0 0 8px", fontWeight: 510 }}>Social accounts (optional)</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="x.com/yourhandle" style={inputStyle} />
              <input value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="t.me/yourhandle" style={inputStyle} />
              <input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="instagram.com/yourhandle" style={inputStyle} />
              <input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="linkedin.com/in/yourhandle" style={inputStyle} />
              <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="yourwebsite.com" style={inputStyle} />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
            <Link href={`/profile/${wallet}`} className="btn-ghost" style={{ height: 38, padding: "0 16px", borderRadius: 8, fontSize: 13, display: "inline-flex", alignItems: "center" }}>Cancel</Link>
            <button onClick={handleSave} disabled={!canSave} className="btn-primary" style={{ height: 38, padding: "0 20px", borderRadius: 8, fontSize: 13, opacity: canSave ? 1 : 0.5, cursor: canSave ? "pointer" : "not-allowed" }}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", height: 38, borderRadius: 8, background: "var(--surface)",
  border: "1px solid var(--card-border)", padding: "0 12px", fontSize: 13,
  color: "var(--primary)", outline: "none",
};

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span className="text-[12px] text-muted" style={{ display: "block", marginBottom: 6, fontWeight: 510 }}>
        {label}{required && <span style={{ color: "var(--danger)", marginLeft: 3 }}>*</span>}
      </span>
      {children}
    </label>
  );
}

"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppWallet as useWallet } from "@/lib/use-app-wallet";
import Link from "next/link";
import { SealedMark } from "@/components/SealedLogo";
import { SealedBackdrop } from "@/components/SealedBackdrop";
import {
  useProfileStore,
  LLM_MODELS,
  X402_MODELS,
  type LLMProvider,
} from "@/lib/profile-store";

import WalletMultiButton from "@/components/AppWalletButton";

type Step = "wallet" | "profile" | "agent" | "done";

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingContent />
    </Suspense>
  );
}

function OnboardingContent() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const { profile, loaded, updateProfile } = useProfileStore(wallet);
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl") ?? "/profile";
  const [step, setStep] = useState<Step>("wallet");

  // Profile fields
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [instagram, setInstagram] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [website, setWebsite] = useState("");
  const [companyFileName, setCompanyFileName] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);

  // Agent/LLM fields
  const [llmMode, setLlmMode] = useState<"own-key" | "x402">("own-key");
  const [x402TopUpAmount, setX402TopUpAmount] = useState(10);
  const [x402Model, setX402Model] = useState(X402_MODELS[0].id);
  const [topping, setTopping] = useState(false);
  const [provider, setProvider] = useState<LLMProvider>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [showKey, setShowKey] = useState(false);
  const [agentStyle, setAgentStyle] = useState<"firm" | "flexible" | "collab">("flexible");
  const [priceFloor, setPriceFloor] = useState(80);

  // Step progress when wallet connects
  useEffect(() => {
    // Advancing step when wallet connects is intentional synchronous state sync
    if (wallet && step === "wallet") setStep("profile"); // eslint-disable-line react-hooks/set-state-in-effect
  }, [wallet, step]);

  // Prefill from existing profile — synchronizing local form state from store is intentional
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!profile) return;
    setName(profile.name);
    setUsername(profile.username);
    setBio(profile.bio);
    setTwitter(profile.socials.twitter);
    setTelegram(profile.socials.telegram);
    setInstagram(profile.socials.instagram);
    setLinkedin(profile.socials.linkedin);
    setWebsite(profile.socials.website);
    setCompanyFileName(profile.companyFileName);
    if (profile.llmConfig?.mode === "own-key") {
      setLlmMode("own-key");
      setProvider(profile.llmConfig.provider);
      setApiKey(profile.llmConfig.apiKey);
      setModel(profile.llmConfig.model);
    } else if (profile.llmConfig?.mode === "x402") {
      setLlmMode("x402");
      setX402Model(profile.llmConfig.model);
    }
  }, [profile]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Redirect if already onboarded (unless editing)
  useEffect(() => {
    if (loaded && profile?.onboardingComplete) {
      const isEditing = new URLSearchParams(window.location.search).get("edit");
      if (!isEditing) router.replace("/profile");
    }
  }, [loaded, profile, router]);

  function handleProfileContinue() {
    if (!name.trim() || !username.trim()) return;
    const handle = username.trim().replace(/^@/, "");
    updateProfile({
      name: name.trim(),
      username: handle,
      bio: bio.trim(),
      socials: { twitter: twitter.trim(), telegram: telegram.trim(), instagram: instagram.trim(), linkedin: linkedin.trim(), website: website.trim() },
      companyFileName,
    });
    if (wallet) {
      fetch(`/api/users/${wallet}/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-wallet": wallet },
        body: JSON.stringify({
          handle,
          display_name: name.trim(),
          bio: bio.trim(),
          website: website.trim() || undefined,
          twitter_handle: twitter.trim() || undefined,
          linkedin_url: linkedin.trim() || undefined,
          instagram_handle: instagram.trim() || undefined,
          telegram_handle: telegram.trim() || undefined,
          company_file_name: companyFileName || undefined,
        }),
      }).catch(() => {});
    }
    setStep("agent");
  }

  function handleFinish() {
    const existingX402Balance =
      profile?.llmConfig?.mode === "x402" ? profile.llmConfig.balance : 0;
    const llmConfig =
      llmMode === "own-key" && apiKey.trim()
        ? ({ mode: "own-key", provider, apiKey: apiKey.trim(), model } as const)
        : llmMode === "x402"
        ? ({ mode: "x402", balance: existingX402Balance, model: x402Model } as const)
        : undefined;
    updateProfile({ llmConfig, onboardingComplete: true });
    setStep("done");
  }

  if (!loaded) return null;

  const stops: { k: Step; title: string; sub: string }[] = [
    { k: "wallet",  title: "Connect",  sub: "Wallet is identity" },
    { k: "profile", title: "Identify", sub: "Real name, real bio" },
    { k: "agent",   title: "Train",    sub: "How your agent acts" },
    { k: "done",    title: "Sealed",   sub: "Identity locked" },
  ];
  const stepIndex = stops.findIndex((s) => s.k === step);

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", display: "flex", flexDirection: "column", position: "relative" }}>
      <SealedBackdrop />

      {/* Compact header */}
      <header style={{
        display: "flex",
        alignItems: "center",
        padding: "0 22px",
        height: 52,
        borderBottom: "1px solid var(--card-border-subtle)",
        background: "var(--panel)",
        flexShrink: 0,
        position: "relative",
        zIndex: 10,
      }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--primary)", textDecoration: "none" }}>
          <SealedMark size={22} />
          <span style={{ fontSize: 13, fontWeight: 510 }}>Sealed Agent</span>
        </Link>
      </header>

      {/* Two-column layout */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "300px 1fr", overflow: "hidden", position: "relative", zIndex: 1 }}>
        {/* Rail */}
        <aside style={{ borderRight: "1px solid var(--card-border-subtle)", background: "var(--panel)", padding: "40px 28px", overflow: "hidden" }}>
          <p style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--accent)", margin: 0, fontWeight: 510 }}>
            Onboarding
          </p>
          <h1 style={{ fontSize: 24, fontWeight: 590, letterSpacing: "-0.02em", color: "var(--primary)", margin: "8px 0 0" }}>
            Become<br />a Sealed identity.
          </h1>
          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 12, lineHeight: 1.55 }}>
            Each step adds a layer of trust. Stop anytime — your progress saves.
          </p>

          {/* Vertical timeline */}
          <div style={{ marginTop: 28, position: "relative" }}>
            <div style={{
              position: "absolute",
              left: 11,
              top: 12,
              bottom: 12,
              width: 1,
              background: "var(--card-border)",
            }} />
            <div style={{
              position: "absolute",
              left: 11,
              top: 12,
              width: 1,
              height: `${(stepIndex / (stops.length - 1)) * 100}%`,
              background: "var(--accent)",
              transition: "height 300ms",
            }} />
            {stops.map((s, i) => {
              const isPast = i < stepIndex;
              const isCurrent = s.k === step;
              return (
                <button
                  key={s.k}
                  onClick={() => i <= stepIndex && setStep(s.k)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "24px 1fr",
                    gap: 14,
                    padding: "10px 0",
                    textAlign: "left",
                    width: "100%",
                    position: "relative",
                    color: isCurrent ? "var(--primary)" : isPast ? "var(--foreground)" : "var(--muted)",
                    background: "none",
                    border: "none",
                    cursor: i <= stepIndex ? "pointer" : "default",
                  }}
                >
                  <span style={{
                    width: 23,
                    height: 23,
                    borderRadius: "50%",
                    background: isPast ? "var(--accent)" : "var(--background)",
                    border: `1.5px solid ${isCurrent ? "var(--accent)" : isPast ? "var(--accent)" : "var(--card-border)"}`,
                    boxShadow: isCurrent ? "0 0 0 4px rgba(113,112,255,0.15)" : "none",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: isPast ? "#fff" : isCurrent ? "var(--accent)" : "var(--muted)",
                    fontSize: 11,
                    fontWeight: 590,
                    transition: "all 200ms",
                  }}>
                    {isPast ? (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : i + 1}
                  </span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 510 }}>{s.title}</div>
                    <div style={{ fontSize: 11, color: "var(--subtle)", marginTop: 1 }}>{s.sub}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Trust seal note */}
          <div style={{ marginTop: 36, padding: 16, background: "rgba(113,112,255,0.04)", border: "1px solid rgba(113,112,255,0.18)", borderRadius: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span style={{ fontSize: 12, fontWeight: 510, color: "var(--accent)" }}>Trust seal</span>
            </div>
            <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
              Counterparties see your wallet, handle, completion rate, and rating before they accept any deal.
            </p>
          </div>
        </aside>

        {/* Active panel */}
        <main style={{ overflowY: "auto", padding: "44px 56px" }}>
          {step === "wallet" && (
            <WalletPanel />
          )}
          {step === "profile" && (
            <ProfilePanel
              name={name} setName={setName}
              username={username} setUsername={setUsername}
              bio={bio} setBio={setBio}
              twitter={twitter} setTwitter={setTwitter}
              telegram={telegram} setTelegram={setTelegram}
              instagram={instagram} setInstagram={setInstagram}
              linkedin={linkedin} setLinkedin={setLinkedin}
              website={website} setWebsite={setWebsite}
              companyFileName={companyFileName}
              fileRef={fileRef}
              onFileChange={(e) => { const f = e.target.files?.[0]; if (f) setCompanyFileName(f.name); }}
              onContinue={handleProfileContinue}
              wallet={wallet}
            />
          )}
          {step === "agent" && (
            <AgentPanel
              llmMode={llmMode} setLlmMode={setLlmMode}
              provider={provider} setProvider={(p) => { setProvider(p); setModel(LLM_MODELS[p][0]); }}
              apiKey={apiKey} setApiKey={setApiKey}
              model={model} setModel={setModel}
              showKey={showKey} setShowKey={setShowKey}
              x402TopUpAmount={x402TopUpAmount} setX402TopUpAmount={setX402TopUpAmount}
              x402Model={x402Model} setX402Model={setX402Model}
              x402Balance={profile?.llmConfig?.mode === "x402" ? profile.llmConfig.balance : 0}
              topping={topping} setTopping={setTopping}
              agentStyle={agentStyle} setAgentStyle={setAgentStyle}
              priceFloor={priceFloor} setPriceFloor={setPriceFloor}
              onBack={() => setStep("profile")}
              onFinish={handleFinish}
            />
          )}
          {step === "done" && (
            <DonePanel onStart={() => router.push(returnUrl)} onProfile={() => router.push(wallet ? `/profile/${wallet}` : "/profile")} />
          )}
        </main>
      </div>
    </div>
  );
}

/* ── Step panels ── */

function WalletPanel() {
  return (
    <div style={{ maxWidth: 540 }}>
      <StepTag step={1} />
      <h2 style={{ fontSize: 26, fontWeight: 590, letterSpacing: "-0.02em", color: "var(--primary)", margin: "16px 0 8px" }}>
        Your wallet is your identity.
      </h2>
      <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 28 }}>
        Sealed never holds funds. The wallet you connect signs every deal you authorize — and only when you say so.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[
          { name: "Phantom",  g: "linear-gradient(135deg, #ab9ff2, #534bb1)" },
          { name: "Solflare", g: "linear-gradient(135deg, #fc8d3a, #b53d12)" },
          { name: "Backpack", g: "linear-gradient(135deg, #ff3939, #ad0c0c)" },
          { name: "Ledger",   g: "#1c1c1c" },
        ].map((w) => (
          <WalletMultiButton key={w.name} />
        ))}
      </div>
      <p style={{ fontSize: 12, color: "var(--subtle)", textAlign: "center", marginTop: 24 }}>
        By continuing you agree to Sealed&apos;s terms. Your wallet stays in your custody.
      </p>
    </div>
  );
}

function ProfilePanel({
  name, setName, username, setUsername, bio, setBio,
  twitter, setTwitter, telegram, setTelegram, instagram, setInstagram,
  linkedin, setLinkedin, website, setWebsite,
  companyFileName, fileRef, onFileChange, onContinue, wallet,
}: {
  name: string; setName: (v: string) => void;
  username: string; setUsername: (v: string) => void;
  bio: string; setBio: (v: string) => void;
  twitter: string; setTwitter: (v: string) => void;
  telegram: string; setTelegram: (v: string) => void;
  instagram: string; setInstagram: (v: string) => void;
  linkedin: string; setLinkedin: (v: string) => void;
  website: string; setWebsite: (v: string) => void;
  companyFileName?: string;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onContinue: () => void;
  wallet: string | null;
}) {
  const canContinue = name.trim().length > 0 && username.trim().length > 0;
  const initials = name.trim() ? name.trim().split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() : "?";

  return (
    <div style={{ maxWidth: 620 }}>
      <StepTag step={2} />
      <h2 style={{ fontSize: 26, fontWeight: 590, letterSpacing: "-0.02em", color: "var(--primary)", margin: "16px 0 8px" }}>
        Identify yourself to the room.
      </h2>
      <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 28 }}>
        Your invite card carries this. Counterparties trust what they can verify.
      </p>

      {/* Live preview card */}
      <div className="surface-card" style={{ borderRadius: 14, padding: 20, marginBottom: 24, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 52, height: 52, borderRadius: "50%",
            background: "linear-gradient(135deg, rgba(113,112,255,0.4), rgba(94,106,210,0.2))",
            border: "2px solid rgba(113,112,255,0.4)",
            color: "var(--accent)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 590,
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 590, color: "var(--primary)" }}>{name || "Your name"}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              @{username || "handle"}{wallet ? ` · ${wallet.slice(0, 4)}…${wallet.slice(-4)}` : ""}
            </div>
          </div>
          <span style={{ fontSize: 11, color: "var(--muted)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 9999, padding: "2px 10px" }}>Preview</span>
        </div>
        {bio && <p style={{ fontSize: 13, color: "var(--foreground)", margin: "14px 0 0", lineHeight: 1.5 }}>{bio}</p>}
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <FormField label="Display name" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex Karim"
              style={inputCss}
              autoFocus
            />
          </FormField>
          <FormField label="Handle" required>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--subtle)", fontSize: 13 }}>@</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                placeholder="alexk"
                style={{ ...inputCss, paddingLeft: 24 }}
              />
            </div>
          </FormField>
        </div>

        <FormField label="Short bio">
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 600))}
            placeholder="Independent product strategist. Past: Stripe, Linear."
            rows={2}
            style={{ ...inputCss, height: "auto", paddingTop: 10, paddingBottom: 10, resize: "none" }}
          />
        </FormField>

        <FormField label="Social accounts (optional)">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              { placeholder: "x.com/yourhandle", value: twitter, onChange: setTwitter },
              { placeholder: "t.me/yourhandle", value: telegram, onChange: setTelegram },
              { placeholder: "linkedin.com/in/yourhandle", value: linkedin, onChange: setLinkedin },
              { placeholder: "yourwebsite.com", value: website, onChange: setWebsite },
            ].map((s, i) => (
              <input key={i} value={s.value} onChange={(e) => s.onChange(e.target.value)} placeholder={s.placeholder} style={{ ...inputCss, fontSize: 12 }} />
            ))}
          </div>
        </FormField>

        <FormField label="Company profile (optional)">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="btn-ghost"
            style={{ width: "100%", height: 60, borderRadius: 8, borderStyle: "dashed", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{companyFileName ?? "Drop or browse PDF/DOCX"}</span>
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.doc" style={{ display: "none" }} onChange={onFileChange} />
        </FormField>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
        <button
          onClick={onContinue}
          disabled={!canContinue}
          className="btn-primary"
          style={{ height: 38, padding: "0 18px", borderRadius: 7, fontSize: 13 }}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

function AgentPanel({
  llmMode, setLlmMode,
  provider, setProvider,
  apiKey, setApiKey,
  model, setModel,
  showKey, setShowKey,
  x402TopUpAmount, setX402TopUpAmount,
  x402Model, setX402Model,
  x402Balance, topping, setTopping,
  agentStyle, setAgentStyle,
  priceFloor, setPriceFloor,
  onBack, onFinish,
}: {
  llmMode: "own-key" | "x402"; setLlmMode: (m: "own-key" | "x402") => void;
  provider: LLMProvider; setProvider: (p: LLMProvider) => void;
  apiKey: string; setApiKey: (k: string) => void;
  model: string; setModel: (m: string) => void;
  showKey: boolean; setShowKey: (v: boolean) => void;
  x402TopUpAmount: number; setX402TopUpAmount: (v: number) => void;
  x402Model: string; setX402Model: (v: string) => void;
  x402Balance: number; topping: boolean; setTopping: (v: boolean) => void;
  agentStyle: "firm" | "flexible" | "collab"; setAgentStyle: (s: "firm" | "flexible" | "collab") => void;
  priceFloor: number; setPriceFloor: (v: number) => void;
  onBack: () => void; onFinish: () => void;
}) {
  const PROVIDERS: { id: LLMProvider; label: string }[] = [
    { id: "anthropic", label: "Anthropic" },
    { id: "openai", label: "OpenAI" },
    { id: "groq", label: "Groq" },
    { id: "gemini", label: "Gemini" },
    { id: "openrouter", label: "OpenRouter" },
  ];

  const styles: { id: "firm" | "flexible" | "collab"; label: string; sub: string }[] = [
    { id: "firm",     label: "Firm",          sub: "Hold the line on price and scope." },
    { id: "flexible", label: "Flexible",      sub: "Balanced trade-offs for bigger wins." },
    { id: "collab",   label: "Collaborative", sub: "Seeks alignment over pure wins." },
  ];

  return (
    <div style={{ maxWidth: 620 }}>
      <StepTag step={3} />
      <h2 style={{ fontSize: 26, fontWeight: 590, letterSpacing: "-0.02em", color: "var(--primary)", margin: "16px 0 8px" }}>
        Train your agent.
      </h2>
      <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 28 }}>
        Your agent proposes — you confirm. It never moves funds on its own.
      </p>

      {/* Negotiation style */}
      <FormField label="Negotiation style">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {styles.map((s) => (
            <button
              key={s.id}
              onClick={() => setAgentStyle(s.id)}
              style={{
                padding: "12px 14px",
                borderRadius: 10,
                textAlign: "left",
                background: agentStyle === s.id ? "rgba(113,112,255,0.06)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${agentStyle === s.id ? "rgba(113,112,255,0.4)" : "var(--card-border)"}`,
                color: "var(--foreground)",
                cursor: "pointer",
                transition: "all 150ms",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 13, fontWeight: 590, color: agentStyle === s.id ? "var(--accent)" : "var(--primary)" }}>{s.label}</div>
                {agentStyle === s.id && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
              <p style={{ fontSize: 11, color: "var(--muted)", margin: "6px 0 0", lineHeight: 1.45 }}>{s.sub}</p>
            </button>
          ))}
        </div>
      </FormField>

      {/* Price floor */}
      <div style={{ marginTop: 20, padding: 18, borderRadius: 12, border: "1px solid var(--card-border)", background: "rgba(255,255,255,0.07)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 510, color: "var(--primary)" }}>Price floor</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Minimum the agent will accept of your asking price.</div>
          </div>
          <div style={{ fontSize: 24, fontWeight: 590, color: "var(--accent)", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
            {priceFloor}%
          </div>
        </div>
        <div style={{ position: "relative", height: 32 }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 14, height: 4, borderRadius: 4, background: "var(--surface)" }} />
          <div style={{
            position: "absolute", left: 0, top: 14, height: 4, borderRadius: 4,
            width: `${((priceFloor - 50) / 50) * 100}%`,
            background: "linear-gradient(to right, rgba(113,112,255,0.4), var(--accent))",
            transition: "width 150ms",
          }} />
          <input
            type="range" min={50} max={100} value={priceFloor}
            onChange={(e) => setPriceFloor(Number(e.target.value))}
            style={{ position: "absolute", inset: 0, width: "100%", opacity: 0, cursor: "pointer" }}
          />
          <div style={{
            position: "absolute", top: 6, left: `${((priceFloor - 50) / 50) * 100}%`,
            transform: "translateX(-50%)", width: 20, height: 20, borderRadius: "50%",
            background: "var(--accent)", boxShadow: "0 4px 12px rgba(113,112,255,0.5), 0 0 0 4px rgba(113,112,255,0.18)",
            pointerEvents: "none", transition: "left 150ms",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--subtle)", marginTop: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          <span>Flexible</span><span>Firm</span>
        </div>
      </div>

      {/* AI Provider */}
      <div style={{ marginTop: 20 }}>
        <div style={{ display: "flex", borderRadius: 6, background: "var(--surface)", border: "1px solid var(--card-border)", padding: 2, marginBottom: 14 }}>
          {(["own-key", "x402"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setLlmMode(m)}
              style={{
                flex: 1,
                height: 30,
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 510,
                background: llmMode === m ? "var(--surface-hover)" : "transparent",
                color: llmMode === m ? "var(--primary)" : "var(--muted)",
                border: "none",
                cursor: "pointer",
                transition: "all 150ms",
              }}
            >
              {m === "own-key" ? "Own API key" : "Top up via x402"}
            </button>
          ))}
        </div>

        {llmMode === "own-key" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <FormField label="Provider">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setProvider(p.id)}
                    style={{
                      height: 32,
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 510,
                      background: provider === p.id ? "rgba(113,112,255,0.1)" : "var(--surface)",
                      border: `1px solid ${provider === p.id ? "rgba(113,112,255,0.4)" : "var(--card-border)"}`,
                      color: provider === p.id ? "var(--accent)" : "var(--muted)",
                      cursor: "pointer",
                      transition: "all 150ms",
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </FormField>
            <FormField label="Model">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                style={{ ...inputCss, appearance: "none" as const }}
              >
                {LLM_MODELS[provider].map((m) => (
                  <option key={m} value={m} style={{ background: "var(--surface)" }}>{m}</option>
                ))}
              </select>
            </FormField>
            <FormField label="API key">
              <div style={{ position: "relative" }}>
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={provider === "anthropic" ? "sk-ant-..." : provider === "openai" ? "sk-..." : "key..."}
                  style={{ ...inputCss, paddingRight: 40, fontFamily: "ui-monospace, monospace" }}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    {showKey
                      ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></>
                      : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>}
                  </svg>
                </button>
              </div>
              <p style={{ fontSize: 11, color: "var(--subtle)", marginTop: 4 }}>
                Stored locally in your browser. Never sent to Sealed servers.
              </p>
            </FormField>
          </div>
        )}

        {llmMode === "x402" && (
          <div style={{ padding: 14, borderRadius: 10, background: "var(--surface)", border: "1px solid var(--card-border)", fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
            <p style={{ color: "var(--accent)", fontWeight: 510, margin: "0 0 6px" }}>x402 pay-as-you-go</p>
            Top up credits with USDC — no API key needed. Credits are deducted per LLM call via the x402 protocol.
            {x402Balance > 0 && (
              <div style={{ marginTop: 8, color: "var(--success)" }}>Current balance: ${(x402Balance / 100).toFixed(2)}</div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
        <button onClick={onBack} className="btn-ghost" style={{ height: 38, padding: "0 16px", borderRadius: 7, fontSize: 13 }}>
          Back
        </button>
        <button onClick={onFinish} className="btn-primary" style={{ flex: 1, height: 38, borderRadius: 7, fontSize: 13 }}>
          Continue →
        </button>
      </div>
    </div>
  );
}

function DonePanel({ onStart, onProfile }: { onStart: () => void; onProfile: () => void }) {
  return (
    <div style={{ maxWidth: 480, paddingTop: 30 }}>
      <div style={{ position: "relative", width: 120, height: 120, marginBottom: 22 }}>
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(113,112,255,0.18), transparent 70%)",
        }} />
        <div style={{
          position: "absolute", inset: 12, borderRadius: "50%",
          background: "var(--surface)", border: "1.5px solid rgba(113,112,255,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <SealedMark size={52} className="text-accent" />
        </div>
      </div>
      <h2 style={{ fontSize: 32, fontWeight: 590, letterSpacing: "-0.022em", color: "var(--primary)", margin: 0 }}>
        Identity sealed.
      </h2>
      <p style={{ fontSize: 15, color: "var(--muted)", marginTop: 10, maxWidth: 420, lineHeight: 1.5 }}>
        Your wallet, profile, and agent are wired up. Counterparties can now find you, and your agent is ready to negotiate on your behalf.
      </p>
      <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
        <button onClick={onProfile} className="btn-ghost" style={{ height: 40, padding: "0 16px", borderRadius: 7, fontSize: 13 }}>
          View profile
        </button>
        <button onClick={onStart} className="btn-primary" style={{ height: 40, padding: "0 20px", borderRadius: 7, fontSize: 13 }}>
          Start your first deal →
        </button>
      </div>
    </div>
  );
}

/* ── Small helpers ── */
function StepTag({ step }: { step: number }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      background: "transparent",
      border: "1px solid rgba(113,112,255,0.25)",
      borderRadius: 9999,
      padding: "2px 12px",
      fontSize: 11,
      fontWeight: 510,
      color: "var(--accent)",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }} />
      Step {step} of 4
    </span>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, color: "var(--muted)", fontWeight: 510, marginBottom: 6 }}>
        {label}
        {required && <span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCss: React.CSSProperties = {
  width: "100%",
  height: 38,
  borderRadius: 6,
  padding: "0 12px",
  background: "var(--surface)",
  border: "1px solid var(--card-border)",
  color: "var(--primary)",
  fontSize: 13,
  outline: "none",
};

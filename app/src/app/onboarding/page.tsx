"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { SealedMark } from "@/components/SealedLogo";
import {
  useProfileStore,
  LLM_MODELS,
  type LLMProvider,
} from "@/lib/profile-store";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

type Step = "profile" | "llm";

export default function OnboardingPage() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const { profile, loaded, updateProfile } = useProfileStore(wallet);
  const router = useRouter();
  const [step, setStep] = useState<Step>("profile");

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

  // LLM fields
  const [llmMode, setLlmMode] = useState<"own-key" | "sealed-tokens">(
    "own-key"
  );
  const [provider, setProvider] = useState<LLMProvider>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [showKey, setShowKey] = useState(false);

  // Prefill from existing profile if editing
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
    } else if (profile.llmConfig?.mode === "sealed-tokens") {
      setLlmMode("sealed-tokens");
    }
  }, [profile]);

  // Redirect if already onboarded (unless editing)
  useEffect(() => {
    if (loaded && profile?.onboardingComplete) {
      const isEditing = new URLSearchParams(window.location.search).get("edit");
      if (!isEditing) router.replace("/profile");
    }
  }, [loaded, profile, router]);

  function handleProfileContinue() {
    if (!name.trim() || !username.trim()) return;
    updateProfile({
      name: name.trim(),
      username: username.trim().replace(/^@/, ""),
      bio: bio.trim(),
      socials: {
        twitter: twitter.trim(),
        telegram: telegram.trim(),
        instagram: instagram.trim(),
        linkedin: linkedin.trim(),
        website: website.trim(),
      },
      companyFileName,
    });
    setStep("llm");
  }

  function handleFinish() {
    const llmConfig =
      llmMode === "own-key" && apiKey.trim()
        ? { mode: "own-key" as const, provider, apiKey: apiKey.trim(), model }
        : undefined;
    updateProfile({ llmConfig, onboardingComplete: true });
    router.push("/profile");
  }

  function handleSkipLLM() {
    updateProfile({ onboardingComplete: true });
    router.push("/profile");
  }

  if (!loaded) return null;

  if (!wallet) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <OnboardingHeader />
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
          <div className="text-center space-y-2">
            <h1 className="text-[22px] text-primary" style={{ fontWeight: 590 }}>
              Connect your wallet to get started
            </h1>
            <p className="text-[14px] text-muted max-w-xs">
              Sealed uses your wallet as your identity — no email or password
              needed.
            </p>
          </div>
          <WalletMultiButton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <OnboardingHeader />
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          {/* Step progress */}
          <div className="mb-10">
            <div className="flex items-center gap-2 mb-2">
              <StepDot n={1} active={step === "profile"} done={step === "llm"} />
              <div className="flex-1 h-px bg-card-border" />
              <StepDot n={2} active={step === "llm"} done={false} />
            </div>
            <div className="flex justify-between text-[11px] text-muted">
              <span>Your profile</span>
              <span>AI configuration</span>
            </div>
          </div>

          {step === "profile" ? (
            <ProfileStep
              name={name}
              setName={setName}
              username={username}
              setUsername={setUsername}
              bio={bio}
              setBio={setBio}
              twitter={twitter}
              setTwitter={setTwitter}
              telegram={telegram}
              setTelegram={setTelegram}
              instagram={instagram}
              setInstagram={setInstagram}
              linkedin={linkedin}
              setLinkedin={setLinkedin}
              website={website}
              setWebsite={setWebsite}
              companyFileName={companyFileName}
              fileRef={fileRef}
              onFileChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setCompanyFileName(f.name);
              }}
              onContinue={handleProfileContinue}
            />
          ) : (
            <LLMStep
              mode={llmMode}
              setMode={setLlmMode}
              provider={provider}
              setProvider={(p) => {
                setProvider(p);
                setModel(LLM_MODELS[p][0]);
              }}
              apiKey={apiKey}
              setApiKey={setApiKey}
              model={model}
              setModel={setModel}
              showKey={showKey}
              setShowKey={setShowKey}
              onBack={() => setStep("profile")}
              onFinish={handleFinish}
              onSkip={handleSkipLLM}
            />
          )}
        </div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                        */
/* ------------------------------------------------------------------ */

function OnboardingHeader() {
  return (
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
  );
}

function StepDot({
  n,
  active,
  done,
}: {
  n: number;
  active: boolean;
  done: boolean;
}) {
  return (
    <div
      className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] transition-colors ${
        done
          ? "bg-success text-background"
          : active
          ? "bg-brand text-white"
          : "bg-surface text-muted border border-card-border"
      }`}
      style={{ fontWeight: 510 }}
    >
      {done ? (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M2 6l3 3 5-5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        n
      )}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[12px] text-muted" style={{ fontWeight: 510 }}>
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full h-10 rounded-md bg-surface border border-card-border px-3 text-[13px] text-primary placeholder-muted outline-none focus:border-accent transition-colors";

/* --- Step 1: Profile ------------------------------------------ */

function ProfileStep({
  name, setName,
  username, setUsername,
  bio, setBio,
  twitter, setTwitter,
  telegram, setTelegram,
  instagram, setInstagram,
  linkedin, setLinkedin,
  website, setWebsite,
  companyFileName, fileRef, onFileChange,
  onContinue,
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
}) {
  const canContinue = name.trim().length > 0 && username.trim().length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[20px] text-primary mb-1" style={{ fontWeight: 590 }}>
          Tell your agent about you
        </h1>
        <p className="text-[13px] text-muted">
          Your agent uses this to represent you accurately in every deal.
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full name" required>
            <input
              className={inputCls}
              placeholder="Rednave Sanjaya"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Username" required>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-[13px]">
                @
              </span>
              <input
                className={inputCls + " pl-6"}
                placeholder="rednave"
                value={username}
                onChange={(e) =>
                  setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))
                }
              />
            </div>
          </Field>
        </div>

        <Field label="About you / your business">
          <textarea
            className="w-full rounded-md bg-surface border border-card-border px-3 py-2.5 text-[13px] text-primary placeholder-muted outline-none focus:border-accent transition-colors resize-none"
            placeholder="Tell your agent about your business, what you sell, who you work with, your deal preferences — the more detail, the better it can negotiate on your behalf."
            rows={4}
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 600))}
          />
          <div className="text-right text-[11px] text-subtle mt-1">
            {bio.length}/600
          </div>
        </Field>

        {/* Social links */}
        <div>
          <p
            className="text-[12px] text-muted mb-3"
            style={{ fontWeight: 510 }}
          >
            Social accounts{" "}
            <span className="text-subtle font-normal">(optional)</span>
          </p>
          <div className="space-y-2">
            <SocialInput
              icon={<XIcon />}
              placeholder="x.com/yourhandle"
              value={twitter}
              onChange={setTwitter}
            />
            <SocialInput
              icon={<TelegramIcon />}
              placeholder="t.me/yourhandle"
              value={telegram}
              onChange={setTelegram}
            />
            <SocialInput
              icon={<InstagramIcon />}
              placeholder="instagram.com/yourhandle"
              value={instagram}
              onChange={setInstagram}
            />
            <SocialInput
              icon={<LinkedInIcon />}
              placeholder="linkedin.com/in/yourhandle"
              value={linkedin}
              onChange={setLinkedin}
            />
            <SocialInput
              icon={<GlobeIcon />}
              placeholder="yourwebsite.com"
              value={website}
              onChange={setWebsite}
            />
          </div>
        </div>

        {/* Company profile / whitepaper upload */}
        <div>
          <p
            className="text-[12px] text-muted mb-2"
            style={{ fontWeight: 510 }}
          >
            Company profile / whitepaper{" "}
            <span className="text-subtle font-normal">(optional)</span>
          </p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full h-20 rounded-md border border-dashed border-card-border hover:border-accent/50 flex flex-col items-center justify-center gap-1.5 text-muted hover:text-primary transition-colors cursor-pointer"
          >
            {companyFileName ? (
              <>
                <FileIcon className="w-5 h-5 text-accent" />
                <span className="text-[12px] text-primary">{companyFileName}</span>
                <span className="text-[11px] text-muted">Click to replace</span>
              </>
            ) : (
              <>
                <UploadIcon className="w-5 h-5" />
                <span className="text-[12px]">Upload PDF or DOCX</span>
              </>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.doc"
            className="hidden"
            onChange={onFileChange}
          />
        </div>
      </div>

      <button
        onClick={onContinue}
        disabled={!canContinue}
        className="btn-primary w-full h-10 rounded-md text-[13px] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Continue
      </button>
    </div>
  );
}

function SocialInput({
  icon,
  placeholder,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 h-9 rounded-md bg-surface border border-card-border px-3 focus-within:border-accent transition-colors">
      <span className="text-muted flex-shrink-0 w-4 flex items-center justify-center">
        {icon}
      </span>
      <input
        className="flex-1 bg-transparent text-[13px] text-primary placeholder-subtle outline-none"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/* --- Step 2: LLM config --------------------------------------- */

function LLMStep({
  mode, setMode,
  provider, setProvider,
  apiKey, setApiKey,
  model, setModel,
  showKey, setShowKey,
  onBack, onFinish, onSkip,
}: {
  mode: "own-key" | "sealed-tokens";
  setMode: (m: "own-key" | "sealed-tokens") => void;
  provider: LLMProvider;
  setProvider: (p: LLMProvider) => void;
  apiKey: string;
  setApiKey: (k: string) => void;
  model: string;
  setModel: (m: string) => void;
  showKey: boolean;
  setShowKey: (v: boolean) => void;
  onBack: () => void;
  onFinish: () => void;
  onSkip: () => void;
}) {
  const PROVIDERS: { id: LLMProvider; label: string }[] = [
    { id: "anthropic", label: "Anthropic" },
    { id: "openai", label: "OpenAI" },
    { id: "groq", label: "Groq" },
  ];

  const TOKEN_PACKAGES = [
    { tokens: "1,000", price: "$5", label: "Starter" },
    { tokens: "5,000", price: "$20", label: "Pro", highlight: true },
    { tokens: "15,000", price: "$50", label: "Team" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[20px] text-primary mb-1" style={{ fontWeight: 590 }}>
          Power your agent
        </h1>
        <p className="text-[13px] text-muted">
          Choose an LLM to power your Sealed agent&apos;s negotiation and deal
          analysis.
        </p>
      </div>

      {/* Mode tabs */}
      <div className="flex rounded-md bg-surface border border-card-border p-0.5">
        {(["own-key", "sealed-tokens"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 h-8 rounded text-[12px] transition-colors ${
              mode === m
                ? "bg-surface-hover text-primary"
                : "text-muted hover:text-primary"
            }`}
            style={{ fontWeight: 510 }}
          >
            {m === "own-key" ? "Use my own API key" : "Buy Sealed tokens"}
          </button>
        ))}
      </div>

      {mode === "own-key" ? (
        <div className="space-y-4">
          {/* Provider selector */}
          <Field label="Provider">
            <div className="grid grid-cols-3 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProvider(p.id)}
                  className={`h-9 rounded-md text-[12px] border transition-colors ${
                    provider === p.id
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-card-border bg-surface text-muted hover:text-primary hover:border-card-border"
                  }`}
                  style={{ fontWeight: 510 }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </Field>

          {/* Model selector */}
          <Field label="Model">
            <select
              className={inputCls + " cursor-pointer"}
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {LLM_MODELS[provider].map((m) => (
                <option key={m} value={m} className="bg-surface">
                  {m}
                </option>
              ))}
            </select>
          </Field>

          {/* API key */}
          <Field label="API key">
            <div className="relative">
              <input
                className={inputCls + " pr-10"}
                type={showKey ? "text" : "password"}
                placeholder={
                  provider === "anthropic"
                    ? "sk-ant-..."
                    : provider === "openai"
                    ? "sk-..."
                    : "gsk_..."
                }
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors"
                aria-label={showKey ? "Hide key" : "Show key"}
              >
                {showKey ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            <p className="text-[11px] text-subtle mt-1.5">
              Stored locally in your browser. Never sent to Sealed servers.
            </p>
          </Field>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[12px] text-muted">
            Buy tokens to use Sealed&apos;s hosted models — no API key needed.
          </p>
          <div className="grid grid-cols-3 gap-3">
            {TOKEN_PACKAGES.map((pkg) => (
              <div
                key={pkg.label}
                className={`relative rounded-md border p-4 text-center ${
                  pkg.highlight
                    ? "border-accent/40 bg-accent/5"
                    : "border-card-border bg-surface"
                }`}
              >
                {pkg.highlight && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] bg-accent text-background px-2 py-0.5 rounded-full" style={{ fontWeight: 510 }}>
                    Popular
                  </span>
                )}
                <div
                  className="text-[11px] text-muted mb-1"
                  style={{ fontWeight: 510 }}
                >
                  {pkg.label}
                </div>
                <div
                  className="text-[18px] text-primary"
                  style={{ fontWeight: 590 }}
                >
                  {pkg.price}
                </div>
                <div className="text-[11px] text-muted mt-0.5">
                  {pkg.tokens} tokens
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-md bg-surface border border-card-border px-4 py-3 text-center">
            <p className="text-[13px] text-muted">
              Token purchases coming soon.{" "}
              <button className="text-accent hover:text-accent-hover underline">
                Join the waitlist
              </button>
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="btn-ghost h-10 px-4 rounded-md text-[13px] flex-shrink-0"
        >
          Back
        </button>
        <button
          onClick={onFinish}
          className="btn-primary h-10 rounded-md text-[13px] flex-1"
        >
          {mode === "own-key" && apiKey.trim()
            ? "Save & continue"
            : "Continue"}
        </button>
      </div>
      <button
        onClick={onSkip}
        className="w-full text-center text-[12px] text-subtle hover:text-muted transition-colors"
      >
        Skip for now — set up later
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Icons (inline SVG, Lucide-style)                                     */
/* ------------------------------------------------------------------ */

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.820 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

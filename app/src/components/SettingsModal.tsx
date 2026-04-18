"use client";

import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useBusinessMemory } from "@/memory/localstorage-store";
import {
  DEFAULT_BOUNDARIES,
  NEGOTIATION_STYLE_DESCRIPTIONS,
  NegotiationBoundaries,
  NegotiationStyle,
  PAYMENT_TERM_LABELS,
  PaymentTerm,
} from "@/memory/types";
import { useToast } from "./Toast";

const STYLES: NegotiationStyle[] = ["conservative", "balanced", "aggressive"];
const PAYMENT_TERMS = Object.keys(PAYMENT_TERM_LABELS) as PaymentTerm[];

const labelStyle: React.CSSProperties = {
  fontWeight: 510,
  letterSpacing: "-0.006em",
};
const headingStyle: React.CSSProperties = {
  fontWeight: 590,
  letterSpacing: "-0.014em",
};

export default function SettingsModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const { publicKey } = useWallet();
  const { memory, updateMemory } = useBusinessMemory(publicKey ?? null);
  const toast = useToast();

  const [draft, setDraft] = useState<NegotiationBoundaries>(
    () => memory?.boundaries ?? DEFAULT_BOUNDARIES
  );
  const [redLinesText, setRedLinesText] = useState<string>(
    () => (memory?.boundaries.redLines ?? []).join("\n")
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const walletConnected = !!publicKey;

  const patch = useMemo(
    () =>
      function update<K extends keyof NegotiationBoundaries>(
        key: K,
        value: NegotiationBoundaries[K]
      ) {
        setDraft((prev) => ({ ...prev, [key]: value }));
      },
    []
  );

  function togglePaymentTerm(term: PaymentTerm) {
    setDraft((prev) => {
      const exists = prev.acceptedPaymentTerms.includes(term);
      return {
        ...prev,
        acceptedPaymentTerms: exists
          ? prev.acceptedPaymentTerms.filter((t) => t !== term)
          : [...prev.acceptedPaymentTerms, term],
      };
    });
  }

  async function handleSave() {
    if (!walletConnected) return;
    const redLines = redLinesText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const boundaries: NegotiationBoundaries = { ...draft, redLines };
    await updateMemory({ boundaries });
    toast.show({
      variant: "success",
      title: "Settings saved",
      description: "Your negotiation boundaries are updated.",
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-[2px] px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-surface border border-card-border rounded-2xl"
        style={{ boxShadow: "var(--shadow-dialog)" }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-card-border-subtle px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2
              id="settings-title"
              className="text-[16px] text-primary"
              style={headingStyle}
            >
              Agent settings
            </h2>
            <p className="text-[12px] text-muted mt-0.5">
              Boundaries your Negotiator agent will respect
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-md hover:bg-[rgba(255,255,255,0.04)] text-muted hover:text-primary transition-colors flex items-center justify-center"
            aria-label="Close settings"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-7">
          {!walletConnected && (
            <div
              className="text-[13px] text-foreground bg-[rgba(113,112,255,0.08)] border border-[rgba(113,112,255,0.25)] rounded-lg px-4 py-3"
            >
              Connect your wallet to save settings. Changes won&apos;t persist
              until connected.
            </div>
          )}

          {/* Negotiation Style */}
          <Section
            title="Negotiation style"
            helper="How hard the agent pushes on your behalf."
          >
            <div className="grid grid-cols-3 gap-2">
              {STYLES.map((style) => (
                <button
                  key={style}
                  onClick={() => patch("negotiationStyle", style)}
                  className={`px-3 py-2.5 rounded-lg border text-[13px] capitalize transition-colors ${
                    draft.negotiationStyle === style
                      ? "bg-[rgba(113,112,255,0.10)] border-[rgba(113,112,255,0.40)] text-accent"
                      : "bg-[rgba(255,255,255,0.02)] border-card-border text-foreground hover:bg-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.14)]"
                  }`}
                  style={labelStyle}
                >
                  {style}
                </button>
              ))}
            </div>
            <p className="text-[12px] text-muted mt-2 leading-relaxed">
              {NEGOTIATION_STYLE_DESCRIPTIONS[draft.negotiationStyle]}
            </p>
          </Section>

          {/* Price Flexibility */}
          <Section
            title="Price flexibility"
            helper="Max percentage the agent may move off your initial number."
          >
            <div className="grid grid-cols-2 gap-4">
              <NumberField
                label="Max increase accepted (%)"
                hint="Buyer side: how much over your offer you'd still accept"
                value={draft.maxPriceIncrease}
                min={0}
                max={100}
                onChange={(v) => patch("maxPriceIncrease", v)}
              />
              <NumberField
                label="Max decrease accepted (%)"
                hint="Seller side: how much under your asking you'd still accept"
                value={draft.maxPriceDecrease}
                min={0}
                max={100}
                onChange={(v) => patch("maxPriceDecrease", v)}
              />
            </div>
          </Section>

          {/* Timeline + Milestones */}
          <Section
            title="Timeline & milestones"
            helper="Structural limits the agent must work within."
          >
            <div className="grid grid-cols-2 gap-4">
              <NumberField
                label="Max timeline extension (days)"
                value={draft.maxTimelineExtensionDays}
                min={0}
                max={365}
                onChange={(v) => patch("maxTimelineExtensionDays", v)}
              />
              <NumberField
                label="Max first-milestone share (%)"
                hint="Caps how front-loaded the deal can be"
                value={draft.maxFrontLoadPercent}
                min={0}
                max={100}
                onChange={(v) => patch("maxFrontLoadPercent", v)}
              />
              <NumberField
                label="Min milestones"
                value={draft.minMilestones}
                min={1}
                max={10}
                onChange={(v) => patch("minMilestones", v)}
              />
              <NumberField
                label="Max milestones"
                value={draft.maxMilestones}
                min={1}
                max={10}
                onChange={(v) => patch("maxMilestones", v)}
              />
            </div>
          </Section>

          {/* Payment Terms */}
          <Section
            title="Accepted payment terms"
            helper="The agent will only agree to these structures."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PAYMENT_TERMS.map((term) => {
                const checked = draft.acceptedPaymentTerms.includes(term);
                return (
                  <label
                    key={term}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                      checked
                        ? "bg-[rgba(113,112,255,0.08)] border-[rgba(113,112,255,0.35)]"
                        : "bg-[rgba(255,255,255,0.02)] border-card-border hover:bg-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.14)]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePaymentTerm(term)}
                      className="w-4 h-4 accent-accent"
                    />
                    <span className="text-[13px] text-foreground">
                      {PAYMENT_TERM_LABELS[term]}
                    </span>
                  </label>
                );
              })}
            </div>
          </Section>

          {/* Red Lines */}
          <Section
            title="Deal breakers"
            helper="One per line. If a proposal violates any of these, the agent will auto-reject."
          >
            <textarea
              value={redLinesText}
              onChange={(e) => setRedLinesText(e.target.value)}
              rows={4}
              placeholder={
                "No payment in advance\nNo buyers from blacklisted regions\nNo milestones over 30 days"
              }
              className="w-full bg-[rgba(255,255,255,0.02)] border border-card-border rounded-lg px-3.5 py-2.5 text-[13px] text-foreground placeholder:text-subtle hover:border-[rgba(255,255,255,0.14)] focus:outline-none resize-none transition-colors"
            />
          </Section>

          {/* Autonomy */}
          <Section
            title="Autonomy envelope"
            helper="When the agent decides alone vs asks you."
          >
            <div className="grid grid-cols-2 gap-4">
              <NumberField
                label="Auto-approve below (USDC)"
                hint="Deal size the agent can close without you"
                value={draft.autoApproveBelowUsdc}
                min={0}
                max={1_000_000}
                onChange={(v) => patch("autoApproveBelowUsdc", v)}
              />
              <NumberField
                label="Need approval above (USDC)"
                hint="Always escalate to you above this"
                value={draft.requireApprovalAboveUsdc}
                min={0}
                max={10_000_000}
                onChange={(v) => patch("requireApprovalAboveUsdc", v)}
              />
              <NumberField
                label="Max negotiation rounds"
                hint="Hard cap before escalating to you"
                value={draft.maxNegotiationRounds}
                min={1}
                max={20}
                onChange={(v) => patch("maxNegotiationRounds", v)}
              />
            </div>
          </Section>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-surface border-t border-card-border-subtle px-6 py-4 flex items-center justify-between gap-3">
          <button
            onClick={() => {
              setDraft(DEFAULT_BOUNDARIES);
              setRedLinesText("");
            }}
            className="text-[13px] text-muted hover:text-primary transition-colors"
          >
            Reset to defaults
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="btn-ghost rounded-lg px-4 h-9 text-[13px]"
              style={labelStyle}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!walletConnected}
              className="btn-primary rounded-lg px-4 h-9 text-[13px]"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  helper,
  children,
}: {
  title: string;
  helper?: string;
  children: React.ReactNode;
}) {
  const labelStyleLocal: React.CSSProperties = {
    fontWeight: 590,
    letterSpacing: "-0.012em",
  };
  return (
    <div>
      <h3 className="text-[13px] text-primary" style={labelStyleLocal}>
        {title}
      </h3>
      {helper && (
        <p className="text-[12px] text-muted mt-1 mb-3 leading-relaxed">
          {helper}
        </p>
      )}
      {!helper && <div className="mb-3" />}
      {children}
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  const labelStyleLocal: React.CSSProperties = {
    fontWeight: 510,
    letterSpacing: "-0.006em",
  };
  return (
    <label className="block">
      <span className="text-[12px] text-foreground" style={labelStyleLocal}>
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(n);
        }}
        className="mt-1.5 w-full bg-[rgba(255,255,255,0.02)] border border-card-border rounded-lg px-3 py-2 text-[13px] text-primary font-mono hover:border-[rgba(255,255,255,0.14)] focus:outline-none transition-colors"
      />
      {hint && (
        <span className="block text-[11px] text-subtle mt-1 leading-relaxed">
          {hint}
        </span>
      )}
    </label>
  );
}

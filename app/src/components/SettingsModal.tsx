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

export default function SettingsModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const { publicKey } = useWallet();
  const { memory, updateMemory } = useBusinessMemory(publicKey ?? null);
  const toast = useToast();

  // Lazy init from memory at mount. Parent remounts this component on re-open,
  // so draft always starts fresh from current memory.
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
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-card border border-card-border rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-card-border px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2
              id="settings-title"
              className="text-lg font-semibold text-white"
            >
              Agent Settings
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Boundaries your Negotiator agent will respect
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg hover:bg-background text-foreground hover:text-accent transition-colors flex items-center justify-center"
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-7">
          {!walletConnected && (
            <div className="text-sm text-foreground bg-accent/10 border border-accent/30 rounded-lg px-4 py-3">
              Connect your wallet to save settings. Changes will not persist
              until connected.
            </div>
          )}

          {/* Negotiation Style */}
          <Section
            title="Negotiation Style"
            helper="How hard the agent pushes on your behalf."
          >
            <div className="grid grid-cols-3 gap-2">
              {STYLES.map((style) => (
                <button
                  key={style}
                  onClick={() => patch("negotiationStyle", style)}
                  className={`px-3 py-3 rounded-lg border text-sm font-medium capitalize transition-colors ${
                    draft.negotiationStyle === style
                      ? "bg-accent/15 border-accent text-accent"
                      : "border-card-border text-foreground hover:border-accent/50"
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted mt-2">
              {NEGOTIATION_STYLE_DESCRIPTIONS[draft.negotiationStyle]}
            </p>
          </Section>

          {/* Price Flexibility */}
          <Section
            title="Price Flexibility"
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
            title="Timeline & Milestones"
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
            title="Accepted Payment Terms"
            helper="The agent will only agree to these structures."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PAYMENT_TERMS.map((term) => {
                const checked = draft.acceptedPaymentTerms.includes(term);
                return (
                  <label
                    key={term}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                      checked
                        ? "bg-accent/10 border-accent/50 text-foreground"
                        : "border-card-border text-foreground hover:border-accent/50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePaymentTerm(term)}
                      className="w-4 h-4 accent-accent"
                    />
                    <span className="text-sm">{PAYMENT_TERM_LABELS[term]}</span>
                  </label>
                );
              })}
            </div>
          </Section>

          {/* Red Lines */}
          <Section
            title="Deal Breakers"
            helper="One per line. If a proposal violates any of these, the agent will auto-reject."
          >
            <textarea
              value={redLinesText}
              onChange={(e) => setRedLinesText(e.target.value)}
              rows={4}
              placeholder={
                "No payment in advance\nNo buyers from blacklisted regions\nNo milestones over 30 days"
              }
              className="w-full bg-background border border-card-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent resize-none"
            />
          </Section>

          {/* Autonomy */}
          <Section
            title="Autonomy Envelope"
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
        <div className="sticky bottom-0 bg-card border-t border-card-border px-6 py-4 flex items-center justify-between gap-3">
          <button
            onClick={() => {
              setDraft(DEFAULT_BOUNDARIES);
              setRedLinesText("");
            }}
            className="text-sm text-muted hover:text-foreground transition-colors"
          >
            Reset to defaults
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-background transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!walletConnected}
              className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
  return (
    <div>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {helper && <p className="text-xs text-muted mt-0.5 mb-3">{helper}</p>}
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
  return (
    <label className="block">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(n);
        }}
        className="mt-1 w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
      />
      {hint && <span className="block text-[11px] text-muted mt-1">{hint}</span>}
    </label>
  );
}

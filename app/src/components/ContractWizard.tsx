"use client";

import { useState, useEffect, useRef } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

type ContractType = "sale" | "service" | "partnership" | "rental" | "nda" | "other";

interface WizardMilestone {
  description: string;
  amount: string;
}

interface WizardData {
  contractType: ContractType | null;
  title: string;
  counterparty: string;
  totalAmount: string;
  // Sale
  goodsName: string;
  deliveryDate: string;
  warrantyDays: string;
  // Service
  scopeOfWork: string;
  serviceDeadline: string;
  revisions: string;
  // Partnership
  myContribution: string;
  theirContribution: string;
  profitSplit: string;
  partnershipDuration: string;
  // Rental
  assetDescription: string;
  rentalStart: string;
  rentalEnd: string;
  securityDeposit: string;
  // NDA
  protectedInfo: string;
  ndaDuration: string;
  breachPenalty: string;
  // Milestones
  milestones: WizardMilestone[];
}

const DEFAULT_DATA: WizardData = {
  contractType: null,
  title: "",
  counterparty: "",
  totalAmount: "",
  goodsName: "",
  deliveryDate: "",
  warrantyDays: "",
  scopeOfWork: "",
  serviceDeadline: "",
  revisions: "",
  myContribution: "",
  theirContribution: "",
  profitSplit: "",
  partnershipDuration: "",
  assetDescription: "",
  rentalStart: "",
  rentalEnd: "",
  securityDeposit: "",
  protectedInfo: "",
  ndaDuration: "",
  breachPenalty: "",
  milestones: [],
};

// ── Step definitions ───────────────────────────────────────────────────────

interface SelectOption {
  label: string;
  description?: string;
  value: ContractType;
}

interface SelectStepDef {
  kind: "select";
  id: string;
  title: string;
  options: SelectOption[];
}

interface InputStepDef {
  kind: "input";
  id: string;
  title: string;
  subtitle?: string;
  field: keyof WizardData;
  inputType: "text" | "number" | "date" | "textarea";
  placeholder?: string;
  optional?: boolean;
}

interface FriendPickerStepDef {
  kind: "friend_picker";
  id: string;
  title: string;
  subtitle?: string;
}

interface MilestonesStepDef {
  kind: "milestones";
  id: "milestones";
}

interface ReviewStepDef {
  kind: "review";
  id: "review";
}

type StepDef = SelectStepDef | InputStepDef | FriendPickerStepDef | MilestonesStepDef | ReviewStepDef;

const CONTRACT_TYPE_STEP: SelectStepDef = {
  kind: "select",
  id: "contract_type",
  title: "What type of contract do you want to create?",
  options: [
    { label: "Purchase Agreement", description: "Goods purchase with payment milestones", value: "sale" },
    { label: "Service Contract", description: "Deliverable-based project with milestones", value: "service" },
    { label: "Partnership Agreement (MOU)", description: "Business collaboration with profit sharing", value: "partnership" },
    { label: "Rental Agreement", description: "Asset/property rental with security deposit", value: "rental" },
    { label: "Confidentiality Agreement (NDA)", description: "Breach penalty locked in escrow", value: "nda" },
    { label: "Other", description: "Free-form contract description", value: "other" },
  ],
};

const COMMON_PREFIX: StepDef[] = [
  {
    kind: "input",
    id: "title",
    title: "Contract title",
    subtitle: "A short, recognizable name for this deal",
    field: "title",
    inputType: "text",
    placeholder: "e.g. Logo design for Acme Corp",
  },
  {
    kind: "input",
    id: "total_amount",
    title: "Total deal value (USDC)",
    subtitle: "Amount to be locked in escrow",
    field: "totalAmount",
    inputType: "number",
    placeholder: "e.g. 5000",
  },
];

const TYPE_STEPS: Record<ContractType, InputStepDef[]> = {
  sale: [
    { kind: "input", id: "goods_name", title: "What goods are being purchased?", field: "goodsName", inputType: "text", placeholder: "e.g. 100 units Dell Latitude 5540 laptop" },
    { kind: "input", id: "delivery_date", title: "Delivery deadline", field: "deliveryDate", inputType: "date", optional: true },
    { kind: "input", id: "warranty_days", title: "Warranty period (days)", subtitle: "Optional", field: "warrantyDays", inputType: "number", placeholder: "e.g. 30", optional: true },
  ],
  service: [
    { kind: "input", id: "scope_of_work", title: "Job description", subtitle: "What needs to be completed?", field: "scopeOfWork", inputType: "textarea", placeholder: "e.g. UI/UX design for 10 mobile app screens..." },
    { kind: "input", id: "service_deadline", title: "Project deadline", field: "serviceDeadline", inputType: "date" },
    { kind: "input", id: "revisions", title: "Number of free revisions", subtitle: "Optional", field: "revisions", inputType: "number", placeholder: "e.g. 3", optional: true },
  ],
  partnership: [
    { kind: "input", id: "my_contribution", title: "Your contribution", subtitle: "Capital, assets, or skills you bring", field: "myContribution", inputType: "text", placeholder: "e.g. $500K working capital" },
    { kind: "input", id: "their_contribution", title: "Partner's contribution", field: "theirContribution", inputType: "text", placeholder: "e.g. National distribution network" },
    { kind: "input", id: "profit_split", title: "Profit split (%)", subtitle: "What percentage is your share?", field: "profitSplit", inputType: "number", placeholder: "e.g. 60 (You 60%, partner 40%)" },
    { kind: "input", id: "partnership_duration", title: "Partnership duration (months)", field: "partnershipDuration", inputType: "number", placeholder: "e.g. 12" },
  ],
  rental: [
    { kind: "input", id: "asset_description", title: "Asset being rented", field: "assetDescription", inputType: "text", placeholder: "e.g. 500m² warehouse in Industrial Estate" },
    { kind: "input", id: "rental_start", title: "Rental start date", field: "rentalStart", inputType: "date" },
    { kind: "input", id: "rental_end", title: "Rental end date", field: "rentalEnd", inputType: "date" },
    { kind: "input", id: "security_deposit", title: "Deposit amount (USDC)", subtitle: "Optional — returned if no damage", field: "securityDeposit", inputType: "number", placeholder: "e.g. 1000", optional: true },
  ],
  nda: [
    { kind: "input", id: "protected_info", title: "Protected information", subtitle: "What must not be disclosed?", field: "protectedInfo", inputType: "textarea", placeholder: "e.g. Pricing strategy, customer data, product roadmap..." },
    { kind: "input", id: "nda_duration", title: "Confidentiality duration (years)", field: "ndaDuration", inputType: "number", placeholder: "e.g. 3" },
    { kind: "input", id: "breach_penalty", title: "Breach penalty (USDC)", subtitle: "Locked in escrow, released if breach is proven", field: "breachPenalty", inputType: "number", placeholder: "e.g. 10000" },
  ],
  other: [
    { kind: "input", id: "scope_of_work", title: "Deal description", subtitle: "Describe the agreement you want to create", field: "scopeOfWork", inputType: "textarea", placeholder: "Describe your deal in detail..." },
  ],
};

const COMMON_SUFFIX: StepDef[] = [
  { kind: "milestones", id: "milestones" },
  { kind: "review", id: "review" },
];

function buildSteps(contractType: ContractType | null): StepDef[] {
  return [
    CONTRACT_TYPE_STEP,
    ...COMMON_PREFIX,
    ...(contractType ? TYPE_STEPS[contractType] : []),
    ...COMMON_SUFFIX,
  ];
}

// ── Milestone auto-generation ───────────────────────────────────────────────

function generateMilestones(data: WizardData): WizardMilestone[] {
  const total = parseFloat(data.totalAmount) || 0;
  const half = round2(total * 0.5);
  const third = round2(total * 0.3);
  const remainder = round2(total - third * 2);

  switch (data.contractType) {
    case "sale":
      return [
        { description: "Down payment (50%)", amount: String(half) },
        { description: `Delivery of ${data.goodsName || "goods"}`, amount: "0" },
        { description: "Final payment after goods received (50%)", amount: String(half) },
      ];
    case "service":
      return [
        { description: "Kickoff / initial payment (30%)", amount: String(third) },
        { description: "Halfway completion (40%)", amount: String(remainder) },
        { description: "Final deliverable & acceptance (30%)", amount: String(third) },
      ];
    case "partnership":
      return [
        { description: "Initial capital deposit", amount: String(round2(total * 0.7)) },
        { description: "First profit distribution", amount: String(round2(total * 0.3)) },
      ];
    case "rental": {
      const deposit = parseFloat(data.securityDeposit) || round2(total * 0.2);
      return [
        { description: "Security deposit", amount: String(deposit) },
        { description: "First period rental fee", amount: String(round2(total - deposit)) },
      ];
    }
    case "nda":
      return [
        { description: "NDA penalty locked (for duration of contract)", amount: String(total) },
      ];
    default:
      return [
        { description: "First payment (50%)", amount: String(half) },
        { description: "Second payment (50%)", amount: String(half) },
      ];
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Prompt builder ─────────────────────────────────────────────────────────

function getTypeName(type: ContractType | null): string {
  const map: Record<ContractType, string> = {
    sale: "Purchase Agreement",
    service: "Service Contract",
    partnership: "Partnership Agreement (MOU)",
    rental: "Rental Agreement",
    nda: "Confidentiality Agreement (NDA)",
    other: "Contract",
  };
  return type ? map[type] : "Contract";
}

export function buildWizardPrompt(data: WizardData): string {
  const parts: string[] = [];

  parts.push(`Create a ${getTypeName(data.contractType)} titled "${data.title}".`);
  parts.push(`Total value: ${data.totalAmount} USDC.`);

  if (data.contractType === "sale") {
    if (data.goodsName) parts.push(`Goods: ${data.goodsName}.`);
    if (data.deliveryDate) parts.push(`Delivery deadline: ${data.deliveryDate}.`);
    if (data.warrantyDays) parts.push(`Warranty: ${data.warrantyDays} days.`);
  } else if (data.contractType === "service") {
    if (data.scopeOfWork) parts.push(`Scope of work: ${data.scopeOfWork}.`);
    if (data.serviceDeadline) parts.push(`Deadline: ${data.serviceDeadline}.`);
    if (data.revisions) parts.push(`Free revisions: ${data.revisions}.`);
  } else if (data.contractType === "partnership") {
    if (data.myContribution) parts.push(`My contribution: ${data.myContribution}.`);
    if (data.theirContribution) parts.push(`Partner contribution: ${data.theirContribution}.`);
    if (data.profitSplit) parts.push(`Profit split: ${data.profitSplit}% for me.`);
    if (data.partnershipDuration) parts.push(`Duration: ${data.partnershipDuration} months.`);
  } else if (data.contractType === "rental") {
    if (data.assetDescription) parts.push(`Asset: ${data.assetDescription}.`);
    if (data.rentalStart && data.rentalEnd)
      parts.push(`Rental period: ${data.rentalStart} to ${data.rentalEnd}.`);
    if (data.securityDeposit) parts.push(`Security deposit: ${data.securityDeposit} USDC.`);
  } else if (data.contractType === "nda") {
    if (data.protectedInfo) parts.push(`Protected information: ${data.protectedInfo}.`);
    if (data.ndaDuration) parts.push(`Confidentiality duration: ${data.ndaDuration} years.`);
    if (data.breachPenalty) parts.push(`Breach penalty: ${data.breachPenalty} USDC locked in escrow.`);
  } else if (data.scopeOfWork) {
    parts.push(`Details: ${data.scopeOfWork}.`);
  }

  if (data.milestones.length > 0) {
    parts.push(
      `\nMilestones:\n` +
        data.milestones
          .map((m, i) => `${i + 1}. ${m.description}: ${m.amount} USDC`)
          .join("\n")
    );
  }

  return parts.join(" ");
}

// ── Style constants ────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = { fontWeight: 510, letterSpacing: "-0.006em" };
const headingStyle: React.CSSProperties = { fontWeight: 590, letterSpacing: "-0.014em" };

// ── Friend types ───────────────────────────────────────────────────────────

interface FriendProfile {
  name?: string;
  handle?: string;
}

interface FriendEntry {
  id: string;
  counterpartyWallet: string;
  profile: FriendProfile | null;
}

// ── Prefill types (must match ChatInterface WizardPrefill) ─────────────────

interface WizardInitialData {
  contractType?: ContractType;
  title?: string;
  totalAmount?: string;
  milestones?: WizardMilestone[];
}

// Find the first step index where required data is missing
function computeStartStep(initial: WizardData, stepId?: string): number {
  const steps = buildSteps(initial.contractType);
  if (stepId) {
    const idx = steps.findIndex((s) => s.id === stepId);
    if (idx >= 0) return idx;
  }
  // Fall back: first empty required step
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.kind === "select" && !initial.contractType) return i;
    if (step.kind === "input" && !step.optional) {
      const val = String((initial as unknown as Record<string, unknown>)[step.field] ?? "").trim();
      if (!val) return i;
    }
    if (step.kind === "milestones") return i; // always let user review milestones
  }
  return 0;
}

// ── Main component ─────────────────────────────────────────────────────────

export function ContractWizard({
  onComplete,
  onClose,
  wallet,
  initialData,
  initialStepId,
}: {
  onComplete: (prompt: string) => void;
  onClose: () => void;
  wallet?: string;
  initialData?: WizardInitialData;
  initialStepId?: string;
}) {
  const merged: WizardData = initialData
    ? { ...DEFAULT_DATA, ...initialData }
    : DEFAULT_DATA;

  const [data, setData] = useState<WizardData>(merged);
  const [stepIndex, setStepIndex] = useState(() => computeStartStep(merged, initialStepId));
  const [selectedOption, setSelectedOption] = useState(0);

  const steps = buildSteps(data.contractType);
  const step = steps[stepIndex];
  const totalSteps = steps.length;

  useEffect(() => {
    setSelectedOption(0);
  }, [stepIndex]);

  useEffect(() => {
    if (step.kind === "milestones" && data.milestones.length === 0) {
      setData((prev) => ({ ...prev, milestones: generateMilestones(prev) }));
    }
  }, [step.kind, data.milestones.length]);

  useEffect(() => {
    if (step.kind !== "select") return;

    function onKey(e: KeyboardEvent) {
      if (step.kind !== "select") return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedOption((p) => Math.min(p + 1, step.options.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedOption((p) => Math.max(p - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        commitSelectOption(selectedOption, step);
      } else if (e.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedOption]);

  function commitSelectOption(index: number, s: SelectStepDef) {
    if (s.id === "contract_type") {
      const type = s.options[index].value;
      setData((prev) => ({ ...prev, contractType: type, milestones: [] }));
    }
    setStepIndex((p) => p + 1);
  }

  function handleSelectOption(index: number) {
    if (step.kind !== "select") return;
    commitSelectOption(index, step);
  }

  function advance() {
    if (stepIndex < steps.length - 1) {
      setStepIndex((p) => p + 1);
    } else {
      onComplete(buildWizardPrompt(data));
    }
  }

  function goBack() {
    if (stepIndex > 0) setStepIndex((p) => p - 1);
  }

  function setField<K extends keyof WizardData>(field: K, value: WizardData[K]) {
    setData((prev) => ({ ...prev, [field]: value }));
  }

  function updateMilestone(i: number, key: "description" | "amount", val: string) {
    setData((prev) => {
      const milestones = [...prev.milestones];
      milestones[i] = { ...milestones[i], [key]: val };
      return { ...prev, milestones };
    });
  }

  function addMilestone() {
    setData((prev) => ({ ...prev, milestones: [...prev.milestones, { description: "", amount: "" }] }));
  }

  function removeMilestone(i: number) {
    setData((prev) => ({ ...prev, milestones: prev.milestones.filter((_, idx) => idx !== i) }));
  }

  const progress = Math.round(((stepIndex + 1) / totalSteps) * 100);
  const isLastStep = stepIndex === totalSteps - 1;

  const inputValue =
    step.kind === "input" ? String((data as unknown as Record<string, unknown>)[step.field] ?? "") : "";

  const canAdvance =
    step.kind === "select"
      ? false
      : step.kind === "friend_picker"
      ? !!data.counterparty.trim()
      : step.kind === "input"
      ? !!step.optional || !!inputValue.trim()
      : true;

  return (
    <div className="w-full max-w-xl mx-auto">
      <div
        className="rounded-2xl overflow-hidden border border-card-border"
        style={{ background: "var(--surface)", boxShadow: "var(--shadow-dialog)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-card-border">
          <span className="text-[13px] text-foreground" style={headingStyle}>
            {step.id === "contract_type" ? "Create new contract" : getTypeName(data.contractType)}
          </span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[11px] text-subtle">
              <span
                className="font-mono text-muted"
                style={labelStyle}
              >
                {stepIndex + 1}
              </span>
              <span className="text-subtle/60">/</span>
              <span className="font-mono">{totalSteps}</span>
            </div>
            <button
              onClick={onClose}
              className="h-5 w-5 flex items-center justify-center rounded text-subtle hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M1 1l10 10M11 1L1 11" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-px bg-card-border">
          <div
            className="h-full bg-accent transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Body */}
        <div>
          {step.kind === "select" && (
            <SelectStep
              key={step.id}
              step={step}
              selected={selectedOption}
              onHover={setSelectedOption}
              onSelect={handleSelectOption}
            />
          )}

          {step.kind === "input" && (
            <InputStep
              key={step.id}
              step={step}
              value={inputValue}
              onChange={(v) => setField(step.field, v as WizardData[typeof step.field])}
              onSubmit={advance}
            />
          )}

          {step.kind === "friend_picker" && (
            <FriendPickerStep
              key={step.id}
              wallet={wallet}
              value={data.counterparty}
              onSelect={(addr) => setData((prev) => ({ ...prev, counterparty: addr }))}
              onSubmit={advance}
            />
          )}

          {step.kind === "milestones" && (
            <MilestonesStep
              milestones={data.milestones}
              totalAmount={data.totalAmount}
              onUpdate={updateMilestone}
              onAdd={addMilestone}
              onRemove={removeMilestone}
            />
          )}

          {step.kind === "review" && <ReviewStep data={data} />}
        </div>

        {/* Footer */}
        <div className="border-t border-card-border px-5 py-3 flex items-center justify-between">
          {step.kind === "select" ? (
            <>
              <div className="flex items-center gap-3 text-[11px] text-subtle select-none">
                <span>↑↓ navigate</span>
                <span className="opacity-40">·</span>
                <span>Enter to select</span>
                <span className="opacity-40">·</span>
                <span>Esc to close</span>
              </div>
              {stepIndex > 0 && (
                <button
                  onClick={goBack}
                  className="text-[12px] text-muted hover:text-foreground transition-colors"
                >
                  ← Back
                </button>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 ml-auto">
              {stepIndex > 0 && (
                <button
                  onClick={goBack}
                  className="px-3 py-1.5 text-[12px] text-muted hover:text-foreground transition-colors"
                >
                  Back
                </button>
              )}
              {step.kind === "input" && step.optional && (
                <button
                  onClick={advance}
                  className="px-3 py-1.5 text-[12px] text-subtle hover:text-foreground transition-colors"
                >
                  Skip
                </button>
              )}
              <button
                onClick={advance}
                disabled={!canAdvance}
                className="btn-primary px-4 py-1.5 text-[12px] rounded-lg flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isLastStep ? (
                  <>
                    Generate &amp; Send
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </>
                ) : (
                  <>
                    Continue
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Friend picker step ─────────────────────────────────────────────────────

function FriendPickerStep({
  wallet,
  value,
  onSelect,
  onSubmit,
}: {
  wallet: string | undefined;
  value: string;
  onSelect: (addr: string) => void;
  onSubmit: () => void;
}) {
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showManual, setShowManual] = useState(false);
  const [manualInput, setManualInput] = useState(value);

  useEffect(() => {
    if (!wallet) {
      setLoading(false);
      setShowManual(true);
      return;
    }
    fetch("/api/friends", { headers: { "x-wallet": wallet } })
      .then((r) => r.json())
      .then((data) => {
        const list: FriendEntry[] = data.friends ?? [];
        setFriends(list);
        if (list.length === 0) setShowManual(true);
      })
      .catch(() => setShowManual(true))
      .finally(() => setLoading(false));
  }, [wallet]);

  function handleFriendClick(friendWallet: string) {
    onSelect(friendWallet);
    setTimeout(() => onSubmit(), 80);
  }

  return (
    <div className="px-5 py-5 space-y-4">
      <div>
        <p className="text-[15px] text-primary" style={headingStyle}>
          Who is the counterparty?
        </p>
        <p className="text-[13px] text-muted mt-0.5">
          Select from your friends list or enter a wallet address manually
        </p>
      </div>

      {loading && (
        <div className="flex gap-1 items-center py-4 justify-center">
          {[0, 150, 300].map((d) => (
            <span
              key={d}
              className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce"
              style={{ animationDelay: `${d}ms` }}
            />
          ))}
        </div>
      )}

      {!loading && friends.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted uppercase tracking-[0.06em]" style={{ fontWeight: 510 }}>
            Your friends
          </p>
          <div className="space-y-1">
            {friends.map((f) => {
              const displayName =
                f.profile?.name ??
                f.profile?.handle ??
                `${f.counterpartyWallet.slice(0, 6)}…${f.counterpartyWallet.slice(-4)}`;
              const isSelected = value === f.counterpartyWallet;
              return (
                <button
                  key={f.id}
                  onClick={() => handleFriendClick(f.counterpartyWallet)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all border ${
                    isSelected
                      ? "bg-accent/10 border-accent/40"
                      : "bg-[rgba(255,255,255,0.02)] border-card-border hover:border-accent/20 hover:bg-[rgba(255,255,255,0.03)]"
                  }`}
                >
                  <div
                    className="h-8 w-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-[12px] text-accent shrink-0"
                    style={{ fontWeight: 590 }}
                  >
                    {displayName[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-foreground truncate" style={labelStyle}>
                      {displayName}
                    </p>
                    <p className="text-[11px] text-subtle font-mono">
                      {f.counterpartyWallet.slice(0, 6)}…{f.counterpartyWallet.slice(-4)}
                    </p>
                  </div>
                  {isSelected && (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-accent shrink-0"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!loading && !showManual && friends.length > 0 && (
        <button
          onClick={() => setShowManual(true)}
          className="text-[12px] text-muted hover:text-accent transition-colors"
        >
          Enter wallet address manually →
        </button>
      )}

      {!loading && showManual && (
        <div className="space-y-2">
          {friends.length > 0 && (
            <p className="text-[12px] text-muted" style={{ fontWeight: 510 }}>
              Or enter wallet manually:
            </p>
          )}
          <input
            type="text"
            value={manualInput}
            onChange={(e) => {
              setManualInput(e.target.value);
              onSelect(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && manualInput.trim()) {
                e.preventDefault();
                onSelect(manualInput.trim());
                onSubmit();
              }
            }}
            placeholder="Solana wallet address…"
            className="w-full bg-[rgba(255,255,255,0.02)] border border-card-border rounded-lg px-3.5 py-2.5 text-[14px] text-foreground placeholder:text-subtle focus:outline-none focus:border-accent/50 transition-colors"
            autoFocus={friends.length === 0}
          />
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SelectStep({
  step,
  selected,
  onHover,
  onSelect,
}: {
  step: SelectStepDef;
  selected: number;
  onHover: (i: number) => void;
  onSelect: (i: number) => void;
}) {
  return (
    <div className="py-2">
      <div className="px-5 pt-3 pb-2">
        <p className="text-[15px] text-primary" style={headingStyle}>
          {step.title}
        </p>
      </div>
      <div className="px-2 pb-1 space-y-px">
        {step.options.map((opt, i) => {
          const isActive = selected === i;
          return (
            <button
              key={opt.value}
              onClick={() => onSelect(i)}
              onMouseEnter={() => onHover(i)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                isActive ? "bg-surface-hover" : "hover:bg-[rgba(255,255,255,0.02)]"
              }`}
            >
              <span
                className={`h-6 w-6 flex items-center justify-center rounded text-[12px] shrink-0 transition-all border ${
                  isActive
                    ? "bg-accent border-accent text-white"
                    : "bg-transparent border-card-border text-subtle"
                }`}
                style={labelStyle}
              >
                {i + 1}
              </span>
              <span className="flex-1 min-w-0">
                <span
                  className={`block text-[14px] transition-colors ${
                    isActive ? "text-primary" : "text-foreground"
                  }`}
                  style={labelStyle}
                >
                  {opt.label}
                </span>
                {opt.description && (
                  <span className="block text-[12px] text-subtle mt-0.5 truncate">
                    {opt.description}
                  </span>
                )}
              </span>
              {isActive && (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-accent shrink-0"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function InputStep({
  step,
  value,
  onChange,
  onSubmit,
}: {
  step: InputStepDef;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (step.inputType === "textarea") {
      textareaRef.current?.focus();
    } else {
      inputRef.current?.focus();
    }
  }, [step.id, step.inputType]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && step.inputType !== "textarea") {
      e.preventDefault();
      if (value.trim() || step.optional) onSubmit();
    }
  }

  const inputClass =
    "w-full bg-[rgba(255,255,255,0.02)] border border-card-border rounded-lg px-3.5 py-2.5 text-[14px] text-foreground placeholder:text-subtle focus:outline-none focus:border-accent/50 transition-colors";

  return (
    <div className="px-5 py-5 space-y-3">
      <div>
        <p className="text-[15px] text-primary" style={headingStyle}>
          {step.title}
        </p>
        {step.subtitle && (
          <p className="text-[13px] text-muted mt-0.5">{step.subtitle}</p>
        )}
      </div>

      {step.inputType === "textarea" ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={step.placeholder}
          rows={4}
          className={`${inputClass} resize-none`}
          style={{ minHeight: "90px" }}
        />
      ) : (
        <input
          ref={inputRef}
          type={step.inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={step.placeholder}
          className={inputClass}
        />
      )}

      {step.optional && (
        <p className="text-[11px] text-subtle">
          Optional — press Skip to continue without filling this in
        </p>
      )}
    </div>
  );
}

function MilestonesStep({
  milestones,
  totalAmount,
  onUpdate,
  onAdd,
  onRemove,
}: {
  milestones: WizardMilestone[];
  totalAmount: string;
  onUpdate: (i: number, key: "description" | "amount", v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  const total = parseFloat(totalAmount) || 0;
  const allocated = milestones.reduce((s, m) => s + (parseFloat(m.amount) || 0), 0);
  const remaining = round2(total - allocated);
  const balanced = Math.abs(remaining) < 0.01;

  return (
    <div className="px-5 py-5 space-y-4">
      <div>
        <p className="text-[15px] text-primary" style={headingStyle}>
          Payment milestones
        </p>
        <p className="text-[13px] text-muted mt-0.5">
          Edit or adjust. Total must equal {totalAmount || "0"} USDC.
        </p>
      </div>

      <div className="space-y-2">
        {milestones.map((m, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[11px] text-subtle w-4 text-center shrink-0">{i + 1}</span>
            <input
              type="text"
              value={m.description}
              onChange={(e) => onUpdate(i, "description", e.target.value)}
              placeholder="Milestone description"
              className="flex-1 bg-[rgba(255,255,255,0.02)] border border-card-border rounded-lg px-3 py-2 text-[13px] text-foreground placeholder:text-subtle focus:outline-none focus:border-accent/50 transition-colors"
            />
            <input
              type="number"
              value={m.amount}
              onChange={(e) => onUpdate(i, "amount", e.target.value)}
              placeholder="USDC"
              className="w-24 shrink-0 bg-[rgba(255,255,255,0.02)] border border-card-border rounded-lg px-3 py-2 text-[13px] text-foreground placeholder:text-subtle focus:outline-none focus:border-accent/50 transition-colors"
            />
            {milestones.length > 1 && (
              <button
                onClick={() => onRemove(i)}
                className="text-subtle hover:text-danger transition-colors shrink-0"
                aria-label="Remove milestone"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M1 1l10 10M11 1L1 11" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={onAdd}
          disabled={milestones.length >= 10}
          className="text-[12px] text-accent hover:text-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 1v10M1 6h10" />
          </svg>
          Add milestone
        </button>
        <span
          className={`text-[12px] transition-colors ${balanced ? "text-success" : "text-warning"}`}
          style={labelStyle}
        >
          {balanced
            ? "✓ Total balanced"
            : remaining > 0
            ? `${remaining} USDC remaining`
            : `${Math.abs(remaining)} USDC over budget`}
        </span>
      </div>
    </div>
  );
}

function ReviewStep({ data }: { data: WizardData }) {
  const rows: { label: string; value: string }[] = [
    { label: "Contract type", value: getTypeName(data.contractType) },
    { label: "Title", value: data.title || "—" },
    {
      label: "Counterparty",
      value: data.counterparty
        ? `${data.counterparty.slice(0, 8)}…${data.counterparty.slice(-4)}`
        : "—",
    },
    { label: "Total", value: data.totalAmount ? `${data.totalAmount} USDC` : "—" },
  ];

  if (data.contractType === "sale") {
    if (data.goodsName) rows.push({ label: "Goods", value: data.goodsName });
    if (data.deliveryDate) rows.push({ label: "Delivery deadline", value: data.deliveryDate });
    if (data.warrantyDays) rows.push({ label: "Warranty", value: `${data.warrantyDays} days` });
  } else if (data.contractType === "service") {
    if (data.scopeOfWork)
      rows.push({ label: "Scope of work", value: data.scopeOfWork.length > 80 ? data.scopeOfWork.slice(0, 80) + "…" : data.scopeOfWork });
    if (data.serviceDeadline) rows.push({ label: "Deadline", value: data.serviceDeadline });
    if (data.revisions) rows.push({ label: "Free revisions", value: `${data.revisions}×` });
  } else if (data.contractType === "partnership") {
    if (data.profitSplit)
      rows.push({ label: "Profit split", value: `${data.profitSplit}% / ${round2(100 - parseFloat(data.profitSplit))}%` });
    if (data.partnershipDuration) rows.push({ label: "Duration", value: `${data.partnershipDuration} months` });
  } else if (data.contractType === "rental") {
    if (data.assetDescription) rows.push({ label: "Asset", value: data.assetDescription });
    if (data.rentalStart && data.rentalEnd)
      rows.push({ label: "Period", value: `${data.rentalStart} – ${data.rentalEnd}` });
    if (data.securityDeposit) rows.push({ label: "Deposit", value: `${data.securityDeposit} USDC` });
  } else if (data.contractType === "nda") {
    if (data.ndaDuration) rows.push({ label: "NDA duration", value: `${data.ndaDuration} years` });
    if (data.breachPenalty) rows.push({ label: "Breach penalty", value: `${data.breachPenalty} USDC` });
  }

  return (
    <div className="px-5 py-5 space-y-4">
      <div>
        <p className="text-[15px] text-primary" style={headingStyle}>
          Review contract
        </p>
        <p className="text-[13px] text-muted mt-0.5">
          Check everything before sending to the AI agent to process.
        </p>
      </div>

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-start gap-4 text-[13px]">
            <span className="text-subtle shrink-0 w-32">{row.label}</span>
            <span className="text-foreground">{row.value}</span>
          </div>
        ))}
      </div>

      {data.milestones.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <span className="text-[11px] text-subtle uppercase tracking-[0.08em]" style={labelStyle}>
            Milestones ({data.milestones.length})
          </span>
          <div className="space-y-1">
            {data.milestones.map((m, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-[12px] bg-[rgba(255,255,255,0.02)] border border-card-border-subtle rounded-md px-3 py-2"
              >
                <span className="truncate mr-3 text-foreground">
                  <span className="text-subtle mr-1.5">{i + 1}.</span>
                  {m.description || <span className="text-subtle italic">No description</span>}
                </span>
                <span className="shrink-0 font-mono text-muted">{m.amount} USDC</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

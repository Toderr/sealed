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

interface MilestonesStepDef {
  kind: "milestones";
  id: "milestones";
}

interface ReviewStepDef {
  kind: "review";
  id: "review";
}

type StepDef = SelectStepDef | InputStepDef | MilestonesStepDef | ReviewStepDef;

const CONTRACT_TYPE_STEP: SelectStepDef = {
  kind: "select",
  id: "contract_type",
  title: "Jenis kontrak apa yang ingin dibuat?",
  options: [
    { label: "Kontrak Jual Beli", description: "Pembelian barang dengan milestone pembayaran", value: "sale" },
    { label: "Kontrak Jasa/Layanan", description: "Proyek berbasis deliverable dan milestone", value: "service" },
    { label: "Kontrak Kerja Sama (MOU)", description: "Kolaborasi bisnis dengan pembagian hasil", value: "partnership" },
    { label: "Kontrak Sewa", description: "Sewa aset/properti dengan deposit keamanan", value: "rental" },
    { label: "Kontrak Kerahasiaan (NDA)", description: "Denda pelanggaran dikunci di escrow", value: "nda" },
    { label: "Lainnya", description: "Deskripsi kontrak bebas", value: "other" },
  ],
};

const COMMON_PREFIX: InputStepDef[] = [
  {
    kind: "input",
    id: "title",
    title: "Judul kontrak",
    subtitle: "Nama singkat yang mudah dikenali untuk deal ini",
    field: "title",
    inputType: "text",
    placeholder: "e.g. Jasa desain logo PT Maju Bersama",
  },
  {
    kind: "input",
    id: "counterparty",
    title: "Wallet pihak lawan",
    subtitle: "Alamat Solana wallet seller / mitra / penyewa",
    field: "counterparty",
    inputType: "text",
    placeholder: "e.g. 7xKXtg2CW87d97TXJSDpbD5jBkheTqA...",
  },
  {
    kind: "input",
    id: "total_amount",
    title: "Nilai total deal (USDC)",
    subtitle: "Jumlah yang akan dikunci di escrow",
    field: "totalAmount",
    inputType: "number",
    placeholder: "e.g. 5000",
  },
];

const TYPE_STEPS: Record<ContractType, InputStepDef[]> = {
  sale: [
    { kind: "input", id: "goods_name", title: "Barang apa yang dibeli?", field: "goodsName", inputType: "text", placeholder: "e.g. 100 unit laptop Dell Latitude 5540" },
    { kind: "input", id: "delivery_date", title: "Kapan batas pengiriman?", field: "deliveryDate", inputType: "date", optional: true },
    { kind: "input", id: "warranty_days", title: "Garansi berapa hari?", subtitle: "Opsional", field: "warrantyDays", inputType: "number", placeholder: "e.g. 30", optional: true },
  ],
  service: [
    { kind: "input", id: "scope_of_work", title: "Deskripsi pekerjaan", subtitle: "Apa yang harus diselesaikan?", field: "scopeOfWork", inputType: "textarea", placeholder: "e.g. Desain UI/UX untuk 10 halaman aplikasi mobile..." },
    { kind: "input", id: "service_deadline", title: "Deadline proyek", field: "serviceDeadline", inputType: "date" },
    { kind: "input", id: "revisions", title: "Berapa kali revisi gratis?", subtitle: "Opsional", field: "revisions", inputType: "number", placeholder: "e.g. 3", optional: true },
  ],
  partnership: [
    { kind: "input", id: "my_contribution", title: "Kontribusi Anda", subtitle: "Modal, aset, atau keahlian yang Anda bawa", field: "myContribution", inputType: "text", placeholder: "e.g. Modal kerja Rp 500 juta" },
    { kind: "input", id: "their_contribution", title: "Kontribusi mitra", field: "theirContribution", inputType: "text", placeholder: "e.g. Jaringan distribusi nasional" },
    { kind: "input", id: "profit_split", title: "Pembagian hasil (%)", subtitle: "Berapa persen bagian Anda?", field: "profitSplit", inputType: "number", placeholder: "e.g. 60 (Anda 60%, mitra 40%)" },
    { kind: "input", id: "partnership_duration", title: "Durasi kerja sama (bulan)", field: "partnershipDuration", inputType: "number", placeholder: "e.g. 12" },
  ],
  rental: [
    { kind: "input", id: "asset_description", title: "Aset yang disewakan", field: "assetDescription", inputType: "text", placeholder: "e.g. Gudang 500m² di Kawasan Industri Cikarang" },
    { kind: "input", id: "rental_start", title: "Tanggal mulai sewa", field: "rentalStart", inputType: "date" },
    { kind: "input", id: "rental_end", title: "Tanggal berakhir sewa", field: "rentalEnd", inputType: "date" },
    { kind: "input", id: "security_deposit", title: "Jumlah deposit (USDC)", subtitle: "Opsional — dikembalikan jika tidak ada kerusakan", field: "securityDeposit", inputType: "number", placeholder: "e.g. 1000", optional: true },
  ],
  nda: [
    { kind: "input", id: "protected_info", title: "Informasi yang dilindungi", subtitle: "Apa yang tidak boleh dibocorkan?", field: "protectedInfo", inputType: "textarea", placeholder: "e.g. Strategi pricing, data pelanggan, rencana produk..." },
    { kind: "input", id: "nda_duration", title: "Durasi kerahasiaan (tahun)", field: "ndaDuration", inputType: "number", placeholder: "e.g. 3" },
    { kind: "input", id: "breach_penalty", title: "Denda pelanggaran (USDC)", subtitle: "Dikunci di escrow, dilepas jika terbukti melanggar", field: "breachPenalty", inputType: "number", placeholder: "e.g. 10000" },
  ],
  other: [
    { kind: "input", id: "scope_of_work", title: "Deskripsi deal", subtitle: "Jelaskan kesepakatan yang ingin dibuat", field: "scopeOfWork", inputType: "textarea", placeholder: "Jelaskan detail deal Anda..." },
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
        { description: `Pengiriman ${data.goodsName || "barang"}`, amount: "0" },
        { description: "Pelunasan setelah barang diterima (50%)", amount: String(half) },
      ];
    case "service":
      return [
        { description: "Kickoff / pembayaran awal (30%)", amount: String(third) },
        { description: "Selesai setengah pekerjaan (40%)", amount: String(remainder) },
        { description: "Deliverable final & acceptance (30%)", amount: String(third) },
      ];
    case "partnership":
      return [
        { description: "Setoran modal awal", amount: String(round2(total * 0.7)) },
        { description: "Distribusi profit tahap pertama", amount: String(round2(total * 0.3)) },
      ];
    case "rental": {
      const deposit = parseFloat(data.securityDeposit) || round2(total * 0.2);
      return [
        { description: "Deposit keamanan", amount: String(deposit) },
        { description: "Biaya sewa periode pertama", amount: String(round2(total - deposit)) },
      ];
    }
    case "nda":
      return [
        { description: "Lock denda NDA (dikunci selama kontrak berlaku)", amount: String(total) },
      ];
    default:
      return [
        { description: "Pembayaran pertama (50%)", amount: String(half) },
        { description: "Pembayaran kedua (50%)", amount: String(half) },
      ];
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Prompt builder ─────────────────────────────────────────────────────────

function getTypeName(type: ContractType | null): string {
  const map: Record<ContractType, string> = {
    sale: "Kontrak Jual Beli",
    service: "Kontrak Jasa/Layanan",
    partnership: "Kontrak Kerja Sama (MOU)",
    rental: "Kontrak Sewa",
    nda: "Kontrak Kerahasiaan (NDA)",
    other: "Kontrak",
  };
  return type ? map[type] : "Kontrak";
}

export function buildWizardPrompt(data: WizardData): string {
  const parts: string[] = [];

  parts.push(`Buat ${getTypeName(data.contractType)} dengan judul "${data.title}".`);
  parts.push(`Pihak lawan (seller/mitra) wallet: ${data.counterparty}.`);
  parts.push(`Nilai total: ${data.totalAmount} USDC.`);

  if (data.contractType === "sale") {
    if (data.goodsName) parts.push(`Barang: ${data.goodsName}.`);
    if (data.deliveryDate) parts.push(`Deadline pengiriman: ${data.deliveryDate}.`);
    if (data.warrantyDays) parts.push(`Garansi: ${data.warrantyDays} hari.`);
  } else if (data.contractType === "service") {
    if (data.scopeOfWork) parts.push(`Scope kerja: ${data.scopeOfWork}.`);
    if (data.serviceDeadline) parts.push(`Deadline: ${data.serviceDeadline}.`);
    if (data.revisions) parts.push(`Revisi gratis: ${data.revisions} kali.`);
  } else if (data.contractType === "partnership") {
    if (data.myContribution) parts.push(`Kontribusi saya: ${data.myContribution}.`);
    if (data.theirContribution) parts.push(`Kontribusi mitra: ${data.theirContribution}.`);
    if (data.profitSplit) parts.push(`Bagi hasil: ${data.profitSplit}% untuk saya.`);
    if (data.partnershipDuration) parts.push(`Durasi: ${data.partnershipDuration} bulan.`);
  } else if (data.contractType === "rental") {
    if (data.assetDescription) parts.push(`Aset: ${data.assetDescription}.`);
    if (data.rentalStart && data.rentalEnd)
      parts.push(`Periode sewa: ${data.rentalStart} sampai ${data.rentalEnd}.`);
    if (data.securityDeposit) parts.push(`Deposit: ${data.securityDeposit} USDC.`);
  } else if (data.contractType === "nda") {
    if (data.protectedInfo) parts.push(`Informasi yang dilindungi: ${data.protectedInfo}.`);
    if (data.ndaDuration) parts.push(`Durasi kerahasiaan: ${data.ndaDuration} tahun.`);
    if (data.breachPenalty) parts.push(`Denda pelanggaran: ${data.breachPenalty} USDC dikunci di escrow.`);
  } else if (data.scopeOfWork) {
    parts.push(`Detail: ${data.scopeOfWork}.`);
  }

  if (data.milestones.length > 0) {
    parts.push(
      `\nMilestone:\n` +
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

// ── Main component ─────────────────────────────────────────────────────────

export function ContractWizard({
  onComplete,
  onClose,
}: {
  onComplete: (prompt: string) => void;
  onClose: () => void;
}) {
  const [data, setData] = useState<WizardData>(DEFAULT_DATA);
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(0);

  const steps = buildSteps(data.contractType);
  const step = steps[stepIndex];
  const totalSteps = steps.length;

  // Reset selected option when step changes
  useEffect(() => {
    setSelectedOption(0);
  }, [stepIndex]);

  // Auto-generate milestones when entering milestone step
  useEffect(() => {
    if (step.kind === "milestones" && data.milestones.length === 0) {
      setData((prev) => ({ ...prev, milestones: generateMilestones(prev) }));
    }
  }, [step.kind, data.milestones.length]);

  // Keyboard nav for select steps
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

  // Determine if Next is enabled for input steps
  const inputValue =
    step.kind === "input" ? String((data as unknown as Record<string, unknown>)[step.field] ?? "") : "";
  const canAdvance = step.kind !== "input" || !!step.optional || !!inputValue.trim();

  return (
    <div className="w-full max-w-xl mx-auto">
      <div
        className="rounded-2xl overflow-hidden border border-card-border"
        style={{ background: "var(--surface)", boxShadow: "var(--shadow-dialog)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-card-border">
          <span className="text-[13px] text-foreground" style={headingStyle}>
            {step.id === "contract_type" ? "Buat kontrak baru" : getTypeName(data.contractType)}
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
          Opsional — tekan Skip untuk melanjutkan tanpa mengisi
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
          Milestone pembayaran
        </p>
        <p className="text-[13px] text-muted mt-0.5">
          Edit atau sesuaikan. Total harus sama dengan {totalAmount || "0"} USDC.
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
              placeholder="Deskripsi milestone"
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
                aria-label="Hapus milestone"
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
          Tambah milestone
        </button>
        <span
          className={`text-[12px] transition-colors ${balanced ? "text-success" : "text-warning"}`}
          style={labelStyle}
        >
          {balanced
            ? "✓ Total sesuai"
            : remaining > 0
            ? `Sisa ${remaining} USDC`
            : `Kelebihan ${Math.abs(remaining)} USDC`}
        </span>
      </div>
    </div>
  );
}

function ReviewStep({ data }: { data: WizardData }) {
  const rows: { label: string; value: string }[] = [
    { label: "Jenis kontrak", value: getTypeName(data.contractType) },
    { label: "Judul", value: data.title || "—" },
    {
      label: "Counterparty wallet",
      value: data.counterparty
        ? `${data.counterparty.slice(0, 8)}…${data.counterparty.slice(-4)}`
        : "—",
    },
    { label: "Total", value: data.totalAmount ? `${data.totalAmount} USDC` : "—" },
  ];

  if (data.contractType === "sale") {
    if (data.goodsName) rows.push({ label: "Barang", value: data.goodsName });
    if (data.deliveryDate) rows.push({ label: "Deadline kirim", value: data.deliveryDate });
    if (data.warrantyDays) rows.push({ label: "Garansi", value: `${data.warrantyDays} hari` });
  } else if (data.contractType === "service") {
    if (data.scopeOfWork)
      rows.push({ label: "Scope kerja", value: data.scopeOfWork.length > 80 ? data.scopeOfWork.slice(0, 80) + "…" : data.scopeOfWork });
    if (data.serviceDeadline) rows.push({ label: "Deadline", value: data.serviceDeadline });
    if (data.revisions) rows.push({ label: "Revisi gratis", value: `${data.revisions}×` });
  } else if (data.contractType === "partnership") {
    if (data.profitSplit)
      rows.push({ label: "Bagi hasil", value: `${data.profitSplit}% / ${round2(100 - parseFloat(data.profitSplit))}%` });
    if (data.partnershipDuration) rows.push({ label: "Durasi", value: `${data.partnershipDuration} bulan` });
  } else if (data.contractType === "rental") {
    if (data.assetDescription) rows.push({ label: "Aset", value: data.assetDescription });
    if (data.rentalStart && data.rentalEnd)
      rows.push({ label: "Periode", value: `${data.rentalStart} – ${data.rentalEnd}` });
    if (data.securityDeposit) rows.push({ label: "Deposit", value: `${data.securityDeposit} USDC` });
  } else if (data.contractType === "nda") {
    if (data.ndaDuration) rows.push({ label: "Durasi NDA", value: `${data.ndaDuration} tahun` });
    if (data.breachPenalty) rows.push({ label: "Denda", value: `${data.breachPenalty} USDC` });
  }

  return (
    <div className="px-5 py-5 space-y-4">
      <div>
        <p className="text-[15px] text-primary" style={headingStyle}>
          Review kontrak
        </p>
        <p className="text-[13px] text-muted mt-0.5">
          Cek kembali sebelum dikirim ke AI agent untuk diproses.
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
                  {m.description || <span className="text-subtle italic">Tanpa deskripsi</span>}
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

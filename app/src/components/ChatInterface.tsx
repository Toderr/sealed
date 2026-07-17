"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useAppWallet as useWallet } from "@/lib/use-app-wallet";
import { Paperclip, Send, Sparkles, Settings } from "lucide-react";
import { ChatMessage, DealParams, ProofBy, formatUsdc } from "@/lib/types";
import { SealedMark } from "@/components/SealedLogo";
import { loadProfileFromStorage } from "@/lib/profile-store";
import { isAgentConfigError } from "@/lib/agent-config-error";
import { dispatchLlm, type LlmMessage } from "@/lib/llm-dispatch";
import { apiFetch } from "@/lib/api-client";
import { ContractWizard } from "@/components/ContractWizard";
import { renderMarkdown } from "@/lib/render-markdown";
import { MOCK_DATA } from "@/lib/env";
import MockDealForm from "@/components/MockDealForm";
import { labelStyle, headingStyle } from "@/lib/typography";

type ContractType = "sale" | "service" | "partnership" | "rental" | "nda" | "other";

export interface PartialDeal {
  contract_type: ContractType | null;
  title: string | null;
  total_amount: number | null;
  milestones: Array<{ description: string; amount: number; proof_by?: ProofBy }> | null;
}

function extractJsonBlock(text: string): string | null {
  const m = text.match(/```json\s*([\s\S]*?)```/);
  return m ? m[1].trim() : null;
}

// Coerce the LLM's per-milestone proof_by to a valid ProofBy, defaulting to
// "seller" (today's behavior) when absent or invalid.
function normalizeProofBy(value: unknown): ProofBy {
  return value === "buyer" ? "buyer" : "seller";
}

function tryParseDealParams(text: string): DealParams | undefined {
  const block = extractJsonBlock(text);
  if (!block) return undefined;
  try {
    const parsed = JSON.parse(block);
    // Require deal_id, total_amount, and milestones. seller_wallet is optional.
    if (
      parsed.deal_id &&
      parsed.total_amount &&
      Array.isArray(parsed.milestones) &&
      parsed.milestones.length > 0 &&
      parsed.status !== "partial"
    ) {
      return {
        dealId: parsed.deal_id,
        title: parsed.title ?? parsed.deal_id,
        sellerWallet: parsed.seller_wallet ?? "",
        creatorRole: parsed.creator_role === "seller" ? "seller" : "buyer",
        totalAmount: parsed.total_amount,
        milestones: parsed.milestones.map(
          (m: { description: string; amount: number; proof_by?: unknown }) => ({
            description: m.description,
            amount: m.amount,
            proof_by: normalizeProofBy(m.proof_by),
          })
        ),
      };
    }
  } catch {
    // not valid JSON
  }
  return undefined;
}

function tryParsePartialDeal(text: string): PartialDeal | null {
  const block = extractJsonBlock(text);
  if (!block) return null;
  try {
    const parsed = JSON.parse(block);
    if (parsed.status === "partial") {
      return {
        contract_type: parsed.contract_type ?? null,
        title: parsed.title ?? null,
        total_amount: typeof parsed.total_amount === "number" ? parsed.total_amount : null,
        milestones: Array.isArray(parsed.milestones)
          ? parsed.milestones.map(
              (m: { description: string; amount: number; proof_by?: unknown }) => ({
                description: m.description,
                amount: m.amount,
                proof_by: normalizeProofBy(m.proof_by),
              })
            )
          : null,
      };
    }
  } catch {
    // not valid JSON
  }
  return null;
}

// Strip ```json ... ``` blocks from text shown to the user.
// If nothing remains after stripping, return a neutral fallback so the bubble is never empty.
function stripJsonBlocks(text: string): string {
  const stripped = text.replace(/```json[\s\S]*?```/g, "").trim();
  return stripped || "Got it — I've updated the deal summary.";
}

// Given what the agent knows so far, return the wizard step id to start at
function getWizardStartStep(partial: PartialDeal): string {
  if (!partial.contract_type) return "contract_type";
  if (!partial.title) return "title";
  if (!partial.total_amount) return "total_amount";
  return "milestones"; // all basic fields known, let user review/edit milestones
}

interface WizardPrefill {
  contractType?: ContractType;
  title?: string;
  totalAmount?: string;
  milestones?: Array<{ description: string; amount: string }>;
}

const NEW_DEAL_SUGGESTIONS = [
  "Draft a vendor deal for 100 units at $5,000 with two delivery milestones",
  "Create a website project agreement with design, build, and launch payments",
  "Set up a service contract with a 30% deposit and final approval milestone",
  "Prepare an escrow for a monthly retainer with weekly deliverables",
  "Turn my rough scope into a clean deal both sides can review",
];

export default function ChatInterface({
  creatorRole = "buyer",
  onDealCreated,
  onPartialDeal,
  onFirstMessage,
}: {
  // The side the creator chose in the pre-composer step. In offline mode the
  // MockDealForm uses it to label the counterparty field and tag the deal.
  creatorRole?: "buyer" | "seller";
  onDealCreated: (params: DealParams) => Promise<void>;
  onPartialDeal?: (deal: PartialDeal | null) => void;
  onFirstMessage?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardPrefill, setWizardPrefill] = useState<WizardPrefill | undefined>();
  const [wizardStartStep, setWizardStartStep] = useState<string | undefined>();
  // When the agent isn't configured (no key / rejected key), we surface a modal
  // pointing to Agent Setup instead of a cryptic "Error: …" chat bubble.
  const [agentConfigError, setAgentConfigError] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { connected, publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? undefined;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleWizardComplete(prompt: string) {
    setShowWizard(false);
    await sendMessage(prompt);
  }

  function openWizard() {
    setShowWizard(true);
    setMessages([]);
    setWizardPrefill(undefined);
    setWizardStartStep(undefined);
  }

  async function sendMessage(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;

    if (messages.length === 0) {
      onFirstMessage?.();
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!overrideText) setInput("");
    setLoading(true);

    try {
      const wallet = publicKey?.toBase58() ?? null;
      const apiMessages = [...messages, userMsg].map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const profile = wallet ? loadProfileFromStorage(wallet) : null;
      const ownKey = profile?.llmConfig?.mode === "own-key" ? profile.llmConfig : null;

      let responseText: string;

      if (ownKey) {
        // Client-side path: fetch system prompt, call LLM directly with user's key
        const { systemPrompt } = await apiFetch<{ systemPrompt: string }>("/api/agent/context", {
          method: "POST",
          body: { wallet },
        });

        responseText = await dispatchLlm({
          provider: ownKey.provider,
          model: ownKey.model,
          apiKey: ownKey.apiKey,
          system: systemPrompt,
          messages: apiMessages as LlmMessage[],
          maxTokens: 1024,
        });
      } else {
        // Server-side path: server uses its configured LLM key
        const data = await apiFetch<{ response: string }>("/api/agent", {
          method: "POST",
          wallet: wallet ?? undefined,
          body: { messages: apiMessages },
        });
        responseText = data.response;
      }

      const dealParams = tryParseDealParams(responseText);

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: stripJsonBlocks(responseText),
        dealParams,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // Auto-show targeted wizard when no complete deal was produced
      if (!dealParams) {
        const partial = tryParsePartialDeal(responseText);
        if (partial) {
          const prefill: WizardPrefill = {};
          if (partial.contract_type) prefill.contractType = partial.contract_type;
          if (partial.title) prefill.title = partial.title;
          if (partial.total_amount) prefill.totalAmount = String(partial.total_amount);
          if (partial.milestones) {
            prefill.milestones = partial.milestones.map((m) => ({
              description: m.description,
              amount: String(m.amount),
            }));
          }
          setWizardPrefill(Object.keys(prefill).length > 0 ? prefill : undefined);
          setWizardStartStep(getWizardStartStep(partial));
          onPartialDeal?.(partial);
        } else {
          setWizardPrefill(undefined);
          setWizardStartStep(undefined);
          onPartialDeal?.(null);
        }
        setShowWizard(true);
      }
    } catch (err) {
      // Agent-not-configured → a modal pointing to Agent Setup, not a cryptic
      // "Error: No LLM provider configured" bubble the user can't act on.
      if (isAgentConfigError(err)) {
        setAgentConfigError(true);
      } else {
        const errorMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : "Something went wrong"}. Please try again.`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const showEmptyPrompt = messages.length === 0 && !showWizard;

  // Fully-offline mode: replace the AI chat with a manual deal form.
  if (MOCK_DATA) {
    return (
      <div className="flex flex-col h-full w-full overflow-y-auto">
        <MockDealForm creatorRole={creatorRole} onDealCreated={onDealCreated} onFirstMessage={onFirstMessage} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full max-w-5xl mx-auto">
      {/* Messages */}
      <div
        className={`flex-1 overflow-y-auto ${
          showEmptyPrompt ? "px-4 sm:px-6 py-0" : "px-4 sm:px-6 py-8 space-y-4"
        }`}
      >
        {messages.length === 0 && showWizard && (
          <div className="flex items-center justify-center h-full py-8">
            <ContractWizard
              onComplete={handleWizardComplete}
              onClose={() => setShowWizard(false)}
              wallet={wallet}
              initialData={wizardPrefill}
              initialStepId={wizardStartStep}
            />
          </div>
        )}

        {showEmptyPrompt && (
          <div className="min-h-full flex flex-col items-center justify-center py-10 text-center">
            <div className="w-full max-w-3xl space-y-6">
              <div className="flex justify-center">
                <div className="inline-flex items-center gap-2 rounded-full border border-card-border bg-surface px-3 py-1.5 text-[12px] text-muted">
                  <span className="text-accent" aria-hidden="true">
                    <SealedMark size={16} />
                  </span>
                  Sealed Deal Agent
                </div>
              </div>

              <div className="space-y-3">
                <h1
                  className="text-[34px] sm:text-[44px] text-primary leading-tight"
                  style={{ ...headingStyle, letterSpacing: "-0.024em" }}
                >
                  Structure a deal in plain language
                </h1>
                <p className="text-[14px] sm:text-[15px] text-muted leading-relaxed max-w-2xl mx-auto">
                  Describe the scope, amount, timeline, and deliverables. Sealed
                  turns it into reviewable terms before anyone signs.
                </p>
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  sendMessage();
                }}
                className="w-full"
              >
                <div className="surface-card rounded-[28px] border border-card-border p-2.5 flex items-end gap-1.5 text-left">
                  <button
                    type="button"
                    onClick={openWizard}
                    disabled={!connected}
                    title="Open guided setup"
                    aria-label="Open guided setup"
                    className="h-11 w-11 shrink-0 rounded-full text-muted hover:text-accent hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  >
                    <Paperclip size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={openWizard}
                    disabled={!connected}
                    title="Use guided setup"
                    aria-label="Use guided setup"
                    className="h-11 w-11 shrink-0 rounded-full text-accent hover:bg-accent/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  >
                    <Sparkles size={18} aria-hidden="true" />
                  </button>
                  <label htmlFor="new-deal-prompt" className="sr-only">
                    Describe your deal
                  </label>
                  <textarea
                    id="new-deal-prompt"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      connected
                        ? "Tell Sealed what deal you want to create..."
                        : "Connect wallet to start..."
                    }
                    disabled={!connected}
                    rows={1}
                    className="min-h-11 max-h-36 flex-1 resize-none bg-transparent px-2 py-3 text-[14px] text-foreground placeholder:text-subtle outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = "auto";
                      target.style.height = Math.min(target.scrollHeight, 144) + "px";
                    }}
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || loading || !connected}
                    aria-label="Send message"
                    className="btn-primary h-11 min-w-11 rounded-full px-4 text-[13px] shrink-0 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  >
                    {loading ? (
                      <svg
                        className="animate-spin"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path d="M21 12a9 9 0 1 1-6.22-8.56" strokeLinecap="round" />
                      </svg>
                    ) : (
                      <>
                        <span className="hidden sm:inline">Send</span>
                        <Send size={15} aria-hidden="true" />
                      </>
                    )}
                  </button>
                </div>
              </form>

              <div className="flex flex-wrap justify-center gap-2 pt-3">
                {NEW_DEAL_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setInput(suggestion)}
                    disabled={!connected}
                    className="min-h-10 rounded-full border border-card-border bg-surface px-4 py-2 text-[12px] text-muted hover:text-primary hover:border-accent/40 hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id}>
            <div
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-[14px] leading-relaxed ${
                  msg.role === "user"
                    ? "bg-brand text-white"
                    : "surface-card text-foreground"
                }`}
                style={msg.role === "user" ? { fontWeight: 510 } : undefined}
              >
                <div className="whitespace-pre-wrap">{renderMarkdown(msg.content)}</div>
              </div>
            </div>

            {/* Deal preview card */}
            {msg.dealParams && (
              <div className="mt-3 ml-0 max-w-[80%]">
                <DealPreview
                  params={msg.dealParams}
                  onConfirm={onDealCreated}
                  disabled={!connected}
                />

              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="surface-card rounded-2xl px-4 py-3 text-sm">
              <div className="flex gap-1 items-center h-5">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {!showEmptyPrompt && (
      <div className="border-t border-card-border-subtle px-4 sm:px-6 py-4 bg-panel">
        <div className="flex gap-2 items-end">
          {/* Wizard shortcut button */}
          <button
            onClick={openWizard}
            disabled={!connected}
            title="Use wizard"
            aria-label="Use wizard"
            className="shrink-0 h-10 w-10 flex items-center justify-center rounded-lg border border-card-border text-subtle hover:text-accent hover:border-accent/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <Sparkles size={16} aria-hidden="true" />
          </button>
          <label htmlFor="deal-chat-input" className="sr-only">
            Describe your deal
          </label>
          <textarea
            id="deal-chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              connected
                ? "Describe your deal…"
                : "Connect wallet to start…"
            }
            disabled={!connected}
            rows={1}
            className="flex-1 resize-none bg-[rgba(255,255,255,0.02)] border border-card-border rounded-lg px-3.5 py-2.5 text-[14px] text-foreground placeholder:text-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 hover:border-[rgba(255,255,255,0.14)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ minHeight: "40px", maxHeight: "140px" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = Math.min(target.scrollHeight, 140) + "px";
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading || !connected}
            className="btn-primary rounded-lg px-4 h-10 text-[13px] shrink-0 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            aria-label="Send message"
          >
            {loading ? (
              <svg
                className="animate-spin"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 1 1-6.22-8.56" strokeLinecap="round" />
              </svg>
            ) : (
              <>
                Send
                <Send size={13} aria-hidden="true" />
              </>
            )}
          </button>
        </div>
      </div>
      )}

      {agentConfigError && (
        <div
          onClick={() => setAgentConfigError(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} className="modal-card" style={{ width: "100%", maxWidth: 440, borderRadius: 14, padding: 24 }}>
            <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 10, background: "rgba(113,112,255,0.12)", color: "var(--accent)", marginBottom: 14 }}>
              <Settings size={20} aria-hidden="true" />
            </div>
            <p style={{ fontSize: 16, fontWeight: 600, color: "var(--primary)", margin: "0 0 6px" }}>Set up your AI agent first</p>
            <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "0 0 20px", lineHeight: 1.55 }}>
              Your agent needs an AI provider before it can draft deals. Add your own API key (OpenAI, Anthropic, Groq, and more) on the Agent Setup page — it takes a minute.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-ghost" onClick={() => setAgentConfigError(false)} style={{ height: 40, borderRadius: 9, fontSize: 13, flex: "0 0 auto", padding: "0 16px" }}>
                Not now
              </button>
              <Link
                href={wallet ? `/profile/${wallet}?tab=agent` : "/profile"}
                className="btn-primary"
                style={{ height: 40, borderRadius: 9, fontSize: 13, flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, fontWeight: 510, textDecoration: "none" }}
              >
                <Settings size={14} aria-hidden="true" />
                Go to Agent Setup
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DealPreview({
  params,
  onConfirm,
  disabled,
}: {
  params: DealParams;
  onConfirm: (params: DealParams) => Promise<void>;
  disabled: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Per-milestone proof responsibility, editable before the deal is created.
  // Seeded from the AI-drafted proof_by (defaulting to "seller").
  const [proofBy, setProofBy] = useState<ProofBy[]>(() =>
    params.milestones.map((m) => (m.proof_by === "buyer" ? "buyer" : "seller"))
  );

  async function handleConfirm() {
    setSaving(true);
    await onConfirm({
      ...params,
      milestones: params.milestones.map((m, i) => ({ ...m, proof_by: proofBy[i] })),
    });
    setSaving(false);
    setSaved(true);
  }

  return (
    <div className="surface-card rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          <h3 className="text-[13px] text-primary" style={labelStyle}>
            Deal ready
          </h3>
        </div>
        <span className="text-[11px] text-subtle font-mono">
          {params.dealId}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 text-[13px]">
        <div>
          <span
            className="text-subtle text-[11px] uppercase tracking-[0.08em]"
            style={labelStyle}
          >
            Seller
          </span>
          <p className="font-mono text-[12px] text-foreground mt-1">
            {params.sellerWallet.slice(0, 8)}…{params.sellerWallet.slice(-4)}
          </p>
        </div>
        <div>
          <span
            className="text-subtle text-[11px] uppercase tracking-[0.08em]"
            style={labelStyle}
          >
            Total
          </span>
          <p className="text-primary mt-1" style={labelStyle}>
            {formatUsdc(params.totalAmount)} USDC
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <span
          className="text-subtle text-[11px] uppercase tracking-[0.08em]"
          style={labelStyle}
        >
          Milestones ({params.milestones.length})
        </span>
        <div className="space-y-1">
          {params.milestones.map((m, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-2 text-[12px] bg-[rgba(255,255,255,0.02)] border border-card-border-subtle rounded-md px-3 py-2"
            >
              <span className="truncate mr-1 text-foreground">
                <span className="text-subtle mr-1.5">{i + 1}.</span>
                {m.description}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={proofBy[i]}
                  onChange={(e) =>
                    setProofBy((prev) =>
                      prev.map((p, idx) => (idx === i ? (e.target.value as ProofBy) : p))
                    )
                  }
                  disabled={disabled || saving || saved}
                  title="Who uploads this milestone's proof"
                  aria-label={`Who uploads proof for milestone ${i + 1}`}
                  className="bg-[rgba(255,255,255,0.02)] border border-card-border-subtle rounded px-1.5 py-1 text-[11px] text-muted focus:outline-none focus:border-accent/50 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  <option value="seller">Seller proof</option>
                  <option value="buyer">Buyer proof</option>
                </select>
                <span className="font-mono text-muted">{formatUsdc(m.amount)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {saved ? (
        <div className="flex items-center gap-2 text-accent text-[13px] pt-1" style={labelStyle}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0a8 8 0 110 16A8 8 0 018 0zm3.78 5.22a.75.75 0 00-1.06 0L7 8.94 5.28 7.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l4.25-4.25a.75.75 0 000-1.06z" />
          </svg>
          Opening negotiation room…
        </div>
      ) : (
        <button
          onClick={handleConfirm}
          disabled={disabled || saving}
          className="btn-primary w-full rounded-lg py-2.5 text-[13px] flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.22-8.56" strokeLinecap="round" />
              </svg>
              Saving draft…
            </>
          ) : disabled ? (
            "Connect wallet first"
          ) : (
            "Open negotiation room"
          )}
        </button>
      )}
    </div>
  );
}

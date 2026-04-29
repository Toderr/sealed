"use client";

import { useState, useRef, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ChatMessage, DealParams, formatUsdc } from "@/lib/types";
import { SealedMark } from "@/components/SealedLogo";

function tryParseDealParams(text: string): DealParams | undefined {
  // Look for JSON block in the response (```json...``` or raw JSON object)
  const jsonMatch =
    text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*"milestones"[\s\S]*\})/);
  if (!jsonMatch) return undefined;

  try {
    const parsed = JSON.parse(jsonMatch[1]);
    if (
      parsed.deal_id &&
      parsed.seller_wallet &&
      parsed.total_amount &&
      Array.isArray(parsed.milestones)
    ) {
      return {
        dealId: parsed.deal_id,
        sellerWallet: parsed.seller_wallet,
        totalAmount: parsed.total_amount,
        milestones: parsed.milestones.map(
          (m: { description: string; amount: number }) => ({
            description: m.description,
            amount: m.amount,
          })
        ),
      };
    }
  } catch {
    // not valid JSON
  }
  return undefined;
}

const labelStyle: React.CSSProperties = { fontWeight: 510, letterSpacing: "-0.006em" };
const headingStyle: React.CSSProperties = { fontWeight: 590, letterSpacing: "-0.014em" };

export default function ChatInterface({
  onDealCreated,
}: {
  onDealCreated: (params: DealParams) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { connected, publicKey } = useWallet();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const apiMessages = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (publicKey) headers["x-wallet"] = publicKey.toBase58();

      const res = await fetch("/api/agent", {
        method: "POST",
        headers,
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);

      const data = await res.json();
      const dealParams = tryParseDealParams(data.response);

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.response,
        dealParams,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Error: ${err instanceof Error ? err.message : "Something went wrong"}. Please try again.`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
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

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-8 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4">
            <div className="text-primary/90">
              <SealedMark size={56} />
            </div>
            <h2
              className="text-[22px] text-primary"
              style={{ ...headingStyle, letterSpacing: "-0.022em" }}
            >
              Start a new deal
            </h2>
            <p className="text-muted max-w-md text-[14px] leading-relaxed">
              Describe your business deal in natural language. The agent will
              structure it into an escrow-protected agreement with milestones.
            </p>
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 justify-center mt-3 w-full max-w-xl">
              {[
                "I want to buy 100 units of product X for $5,000 USDC",
                "Set up a service contract with 3 payment milestones",
                "Create an escrow for a website development project",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="flex-1 min-w-0 px-3.5 py-2.5 text-[13px] text-muted surface-card-subtle rounded-lg hover:bg-[rgba(255,255,255,0.04)] hover:text-primary hover:border-[rgba(255,255,255,0.12)] transition-colors text-left"
                >
                  {suggestion}
                </button>
              ))}
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
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>

            {/* Deal preview card */}
            {msg.dealParams && (
              <div className="mt-3 ml-0 max-w-[80%]">
                <DealPreview
                  params={msg.dealParams}
                  onConfirm={() => onDealCreated(msg.dealParams!)}
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
      <div className="border-t border-card-border-subtle px-4 sm:px-6 py-4 bg-panel">
        <div className="flex gap-2 items-end">
          <textarea
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
            className="flex-1 resize-none bg-[rgba(255,255,255,0.02)] border border-card-border rounded-lg px-3.5 py-2.5 text-[14px] text-foreground placeholder:text-subtle focus:outline-none hover:border-[rgba(255,255,255,0.14)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ minHeight: "40px", maxHeight: "140px" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = Math.min(target.scrollHeight, 140) + "px";
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading || !connected}
            className="btn-primary rounded-lg px-4 h-10 text-[13px] shrink-0 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
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
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function DealPreview({
  params,
  onConfirm,
  disabled,
}: {
  params: DealParams;
  onConfirm: () => void;
  disabled: boolean;
}) {
  const [confirmed, setConfirmed] = useState(false);

  function handleConfirm() {
    setConfirmed(true);
    onConfirm();
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
              className="flex items-center justify-between text-[12px] bg-[rgba(255,255,255,0.02)] border border-card-border-subtle rounded-md px-3 py-2"
            >
              <span className="truncate mr-2 text-foreground">
                <span className="text-subtle mr-1.5">{i + 1}.</span>
                {m.description}
              </span>
              <span className="shrink-0 font-mono text-muted">
                {formatUsdc(m.amount)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {confirmed ? (
        <div
          className="flex items-center gap-2 text-accent text-[13px] pt-1"
          style={labelStyle}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 0a8 8 0 110 16A8 8 0 018 0zm3.78 5.22a.75.75 0 00-1.06 0L7 8.94 5.28 7.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l4.25-4.25a.75.75 0 000-1.06z" />
          </svg>
          Negotiation started, review terms
        </div>
      ) : (
        <button
          onClick={handleConfirm}
          disabled={disabled}
          className="btn-primary w-full rounded-lg py-2.5 text-[13px]"
        >
          {disabled ? "Connect wallet first" : "Start negotiation"}
        </button>
      )}
    </div>
  );
}

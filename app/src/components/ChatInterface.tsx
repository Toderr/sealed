"use client";

import { useState, useRef, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ChatMessage, DealParams, formatUsdc } from "@/lib/types";

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

export default function ChatInterface({
  onDealCreated,
}: {
  onDealCreated: (params: DealParams) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { connected } = useWallet();

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

      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4">
            <div className="text-4xl">🤝</div>
            <h2 className="text-xl font-semibold">Create a new deal</h2>
            <p className="text-muted max-w-md">
              Describe your business deal in natural language. The AI agent will
              help structure it into an escrow-protected agreement with
              milestones.
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {[
                "I want to buy 100 units of product X for $5,000 USDC",
                "Set up a service contract with 3 payment milestones",
                "Create an escrow for a website development project",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="px-3 py-2 text-sm text-muted border border-card-border rounded-lg hover:border-accent hover:text-foreground transition-colors text-left"
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
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-accent text-white"
                    : "bg-card border border-card-border"
                }`}
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
            <div className="bg-card border border-card-border rounded-2xl px-4 py-3 text-sm">
              <div className="flex gap-1">
                <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-card-border px-4 py-4">
        <div className="flex gap-3 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              connected
                ? "Describe your deal..."
                : "Connect wallet to start..."
            }
            disabled={!connected}
            rows={1}
            className="flex-1 resize-none bg-card border border-card-border rounded-xl px-4 py-3 text-sm placeholder:text-muted focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ minHeight: "44px", maxHeight: "120px" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = Math.min(target.scrollHeight, 120) + "px";
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading || !connected}
            className="bg-accent hover:bg-accent-hover text-white rounded-xl px-5 py-3 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {loading ? "..." : "Send"}
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
    <div className="bg-card border border-accent/30 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-accent">Deal Ready</h3>
        <span className="text-xs text-muted font-mono">{params.dealId}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-muted text-xs">Seller</span>
          <p className="font-mono text-xs mt-0.5">
            {params.sellerWallet.slice(0, 8)}...{params.sellerWallet.slice(-4)}
          </p>
        </div>
        <div>
          <span className="text-muted text-xs">Total</span>
          <p className="font-semibold mt-0.5">
            {formatUsdc(params.totalAmount)} USDC
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="text-muted text-xs">
          Milestones ({params.milestones.length})
        </span>
        {params.milestones.map((m, i) => (
          <div
            key={i}
            className="flex items-center justify-between text-xs bg-background/50 rounded-lg px-3 py-2"
          >
            <span className="truncate mr-2">
              {i + 1}. {m.description}
            </span>
            <span className="shrink-0 font-mono">
              {formatUsdc(m.amount)} USDC
            </span>
          </div>
        ))}
      </div>

      {confirmed ? (
        <div className="flex items-center gap-2 text-success text-sm font-medium py-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0a8 8 0 110 16A8 8 0 018 0zm3.78 5.22a.75.75 0 00-1.06 0L7 8.94 5.28 7.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l4.25-4.25a.75.75 0 000-1.06z" />
          </svg>
          Deal created. Switch to My Deals tab.
        </div>
      ) : (
        <button
          onClick={handleConfirm}
          disabled={disabled}
          className="w-full bg-accent hover:bg-accent-hover text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {disabled ? "Connect wallet first" : "Create Deal"}
        </button>
      )}
    </div>
  );
}

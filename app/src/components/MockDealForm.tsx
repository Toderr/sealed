"use client";

// Manual deal-creation form for fully-offline mode (MOCK_DATA). Replaces the AI
// chat: you fill title, counterparty, and milestones, and it emits the same
// DealParams the Structurer agent would have produced — so the existing
// LiveDealSheet → invite → negotiate flow works unchanged.

import { useState } from "react";
import type { DealParams } from "@/lib/types";
import { useAppWallet as useWallet } from "@/lib/use-app-wallet";
import { MOCK_IDENTITIES } from "@/lib/mock-wallet";
import { labelStyle, headingStyle } from "@/lib/typography";

type MilestoneRow = { description: string; amount: string };

export default function MockDealForm({
  onDealCreated,
  onFirstMessage,
}: {
  onDealCreated: (params: DealParams) => Promise<void>;
  onFirstMessage?: () => void;
}) {
  const { publicKey } = useWallet();
  const [title, setTitle] = useState("");
  const [seller, setSeller] = useState(MOCK_IDENTITIES.seller.toBase58());
  const [milestones, setMilestones] = useState<MilestoneRow[]>([
    { description: "", amount: "" },
  ]);
  const [error, setError] = useState<string | null>(null);

  const total = milestones.reduce((sum, m) => sum + (parseFloat(m.amount) || 0), 0);

  function updateMilestone(i: number, patch: Partial<MilestoneRow>) {
    setMilestones((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }
  function addMilestone() {
    setMilestones((prev) => [...prev, { description: "", amount: "" }]);
  }
  function removeMilestone(i: number) {
    setMilestones((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  async function handleCreate() {
    setError(null);
    if (!title.trim()) return setError("Add a deal title.");
    if (!seller.trim() || seller.trim().length < 32) return setError("Enter a valid seller wallet.");
    const parsed = milestones
      .map((m) => ({ description: m.description.trim(), amount: parseFloat(m.amount) || 0 }))
      .filter((m) => m.description && m.amount > 0);
    if (parsed.length === 0) return setError("Add at least one milestone with a description and amount.");

    const dealId = `deal-${Date.now().toString(36)}`;
    const params: DealParams = {
      dealId,
      title: title.trim(),
      sellerWallet: seller.trim(),
      totalAmount: parsed.reduce((s, m) => s + m.amount, 0),
      milestones: parsed,
    };

    onFirstMessage?.();
    await onDealCreated(params);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    background: "var(--surface)",
    border: "1px solid var(--card-border)",
    borderRadius: 8,
    color: "var(--primary)",
    fontSize: 13,
    outline: "none",
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 20px", width: "100%" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div
          style={{
            display: "inline-block",
            padding: "3px 10px",
            borderRadius: 20,
            background: "rgba(245,166,35,0.12)",
            color: "#f5a623",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.04em",
            marginBottom: 12,
          }}
        >
          OFFLINE MODE — MANUAL DEAL
        </div>
        <h2 style={{ ...headingStyle, fontSize: 24, color: "var(--primary)", margin: "0 0 6px" }}>
          Create a deal
        </h2>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>
          No AI, no chain. Fill the terms and it builds the deal directly.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={{ ...labelStyle, fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 6 }}>
            Deal title
          </label>
          <input
            style={inputStyle}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Landing page design"
          />
        </div>

        <div>
          <label style={{ ...labelStyle, fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 6 }}>
            Seller wallet (counterparty)
          </label>
          <input
            style={{ ...inputStyle, fontFamily: "ui-monospace, monospace", fontSize: 12 }}
            value={seller}
            onChange={(e) => setSeller(e.target.value)}
            placeholder="Seller wallet address"
          />
          <button
            onClick={() => setSeller(MOCK_IDENTITIES.seller.toBase58())}
            style={{ marginTop: 6, fontSize: 11, color: "var(--accent)", background: "none", border: 0, cursor: "pointer", padding: 0 }}
          >
            Use mock seller identity
          </button>
        </div>

        <div>
          <label style={{ ...labelStyle, fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 8 }}>
            Milestones
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {milestones.map((m, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  value={m.description}
                  onChange={(e) => updateMilestone(i, { description: e.target.value })}
                  placeholder={`Milestone ${i + 1} description`}
                />
                <input
                  style={{ ...inputStyle, width: 110 }}
                  value={m.amount}
                  onChange={(e) => updateMilestone(i, { amount: e.target.value })}
                  placeholder="USDC"
                  inputMode="decimal"
                />
                <button
                  onClick={() => removeMilestone(i)}
                  disabled={milestones.length === 1}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 6,
                    border: "1px solid var(--card-border)",
                    background: "transparent",
                    color: "var(--muted)",
                    cursor: milestones.length === 1 ? "not-allowed" : "pointer",
                    opacity: milestones.length === 1 ? 0.4 : 1,
                  }}
                  aria-label="Remove milestone"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addMilestone}
            style={{ marginTop: 8, fontSize: 12, color: "var(--accent)", background: "none", border: 0, cursor: "pointer", padding: 0 }}
          >
            + Add milestone
          </button>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 12px",
            background: "var(--surface)",
            borderRadius: 8,
            border: "1px solid var(--card-border)",
          }}
        >
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Total</span>
          <span style={{ ...labelStyle, fontSize: 15, color: "var(--primary)", fontFamily: "ui-monospace, monospace" }}>
            {total.toLocaleString()} USDC
          </span>
        </div>

        {error && (
          <p style={{ fontSize: 12, color: "var(--danger)", margin: 0 }}>{error}</p>
        )}

        <button
          onClick={handleCreate}
          disabled={!publicKey}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: 0,
            background: publicKey ? "var(--accent)" : "var(--card-border)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: publicKey ? "pointer" : "not-allowed",
          }}
        >
          Create deal
        </button>
      </div>
    </div>
  );
}

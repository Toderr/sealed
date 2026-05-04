"use client";

import { useEffect, useState } from "react";
import { formatUsdc, type DealParams } from "@/lib/types";
import type { NegotiationBoundaries } from "@/memory/types";
import type { Proposal, Revision } from "@/negotiation/types";
import { getLlmHeaders } from "@/lib/llm-headers";

type ViewState =
  | { kind: "running" }
  | { kind: "done"; proposal: Proposal }
  | { kind: "error"; message: string };

const labelStyle: React.CSSProperties = {
  fontWeight: 510,
  letterSpacing: "-0.006em",
};
const headingStyle: React.CSSProperties = {
  fontWeight: 590,
  letterSpacing: "-0.014em",
};

export default function NegotiationView({
  initialTerms,
  buyerWallet,
  buyerBoundaries,
  onAccept,
  onCancel,
}: {
  initialTerms: DealParams;
  buyerWallet: string;
  buyerBoundaries: NegotiationBoundaries;
  onAccept: (finalTerms: DealParams) => void;
  onCancel: () => void;
}) {
  const [state, setState] = useState<ViewState>({ kind: "running" });

  useEffect(() => {
    const controller = new AbortController();
    const proposalId = `${initialTerms.dealId}-${Date.now()}`;

    (async () => {
      try {
        const res = await fetch("/api/negotiate", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getLlmHeaders(buyerWallet) },
          body: JSON.stringify({
            proposalId,
            buyerWallet,
            initialTerms,
            buyerBoundaries,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `API error ${res.status}`);
        }

        const data = (await res.json()) as { proposal: Proposal };
        setState({ kind: "done", proposal: data.proposal });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    })();

    return () => controller.abort();
  }, [initialTerms, buyerWallet, buyerBoundaries]);

  if (state.kind === "running") {
    return <RunningState onCancel={onCancel} />;
  }

  if (state.kind === "error") {
    return <ErrorState message={state.message} onCancel={onCancel} />;
  }

  return (
    <DoneState
      proposal={state.proposal}
      onAccept={onAccept}
      onCancel={onCancel}
    />
  );
}

function RunningState({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 max-w-md mx-auto text-center px-6">
      <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-accent/10 text-accent">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="animate-pulse"
        >
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </div>
      <div className="space-y-2">
        <h2
          className="text-[22px] text-primary"
          style={{ ...headingStyle, letterSpacing: "-0.022em" }}
        >
          Agents negotiating
        </h2>
        <p className="text-[14px] text-muted leading-relaxed">
          Your Negotiator and the seller&apos;s Negotiator are exchanging
          proposals. This usually takes 15–30 seconds.
        </p>
      </div>
      <div className="flex items-center gap-2 text-[12px] text-subtle">
        <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
        <span>Running up to 5 rounds</span>
      </div>
      <button
        onClick={onCancel}
        className="text-[13px] text-muted hover:text-primary transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

function ErrorState({
  message,
  onCancel,
}: {
  message: string;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 max-w-md mx-auto text-center px-6">
      <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-[rgba(248,113,113,0.10)] text-danger">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
      <h2 className="text-[18px] text-primary" style={headingStyle}>
        Negotiation failed
      </h2>
      <p className="text-[13px] text-muted">{message}</p>
      <button
        onClick={onCancel}
        className="btn-primary rounded-lg px-4 py-2.5 text-[13px] mt-2"
      >
        Back to chat
      </button>
    </div>
  );
}

function DoneState({
  proposal,
  onAccept,
  onCancel,
}: {
  proposal: Proposal;
  onAccept: (terms: DealParams) => void;
  onCancel: () => void;
}) {
  const summary = proposal.summary;
  const finalTerms = proposal.finalTerms;
  const agreed = proposal.status === "agreed" && finalTerms;

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-6 py-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 pb-4 border-b border-card-border-subtle">
        <div>
          <h2
            className="text-[22px] text-primary"
            style={{ ...headingStyle, letterSpacing: "-0.022em" }}
          >
            Negotiation complete
          </h2>
          <p className="text-[13px] text-muted mt-1">
            {proposal.revisions.length - 1} rounds · status{" "}
            <StatusBadge status={proposal.status} />
          </p>
        </div>
        <button
          onClick={onCancel}
          className="text-[13px] text-muted hover:text-primary transition-colors flex items-center gap-1.5"
          aria-label="Back to chat"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Transcript */}
        <div className="lg:col-span-2 space-y-3">
          <h3
            className="text-[11px] uppercase tracking-[0.08em] text-subtle"
            style={labelStyle}
          >
            Transcript
          </h3>
          {proposal.revisions.map((r) => (
            <TranscriptBubble key={r.round} revision={r} />
          ))}
        </div>

        {/* Summary sidebar */}
        <div className="space-y-3">
          {summary && (
            <>
              <RecommendationCard summary={summary} agreed={!!agreed} />
              <ProsConsCard summary={summary} />
              <ConcessionsCard summary={summary} />
              {summary.riskFlags.length > 0 && (
                <RiskFlagsCard summary={summary} />
              )}
            </>
          )}

          {agreed && finalTerms && (
            <FinalTermsCard
              terms={finalTerms}
              initial={proposal.initialTerms}
            />
          )}

          <div className="sticky bottom-0 bg-background pt-4 pb-2 space-y-2">
            <button
              onClick={() => finalTerms && onAccept(finalTerms)}
              disabled={!agreed}
              className="btn-primary w-full rounded-lg py-3 text-[13px]"
            >
              {agreed ? "Accept & create deal on-chain" : "No agreement reached"}
            </button>
            <button
              onClick={onCancel}
              className="btn-ghost w-full rounded-lg py-2.5 text-[13px]"
              style={labelStyle}
            >
              Reject & renegotiate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Proposal["status"] }) {
  const colors: Record<Proposal["status"], string> = {
    agreed: "text-success",
    rejected: "text-danger",
    escalated: "text-warning",
    negotiating: "text-accent",
    expired: "text-muted",
  };
  return (
    <span
      className={`capitalize ${colors[status]}`}
      style={labelStyle}
    >
      {status}
    </span>
  );
}

function TranscriptBubble({ revision }: { revision: Revision }) {
  const isBuyer = revision.onBehalfOf === "buyer";
  const isOpener = revision.action === "open";

  return (
    <div className={`flex ${isBuyer ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[88%] rounded-xl p-4 border ${
          isBuyer
            ? "bg-[rgba(113,112,255,0.06)] border-[rgba(113,112,255,0.22)]"
            : "surface-card"
        }`}
      >
        <div className="flex items-center gap-2 mb-2">
          <span
            className="text-[10px] text-subtle uppercase tracking-[0.08em]"
            style={labelStyle}
          >
            {isBuyer ? "Buyer Agent" : "Seller Agent"}
          </span>
          <span className="text-[10px] text-subtle">
            · Round {revision.round} · {revision.action}
          </span>
        </div>
        <p
          className={`text-[13px] text-foreground leading-relaxed ${
            isOpener ? "italic" : ""
          }`}
        >
          {revision.reasoning}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
          <div>
            <span
              className="text-subtle text-[10px] uppercase tracking-[0.08em]"
              style={labelStyle}
            >
              Total
            </span>
            <p className="font-mono text-foreground mt-1">
              {formatUsdc(revision.proposedTerms.totalAmount)} USDC
            </p>
          </div>
          <div>
            <span
              className="text-subtle text-[10px] uppercase tracking-[0.08em]"
              style={labelStyle}
            >
              Milestones
            </span>
            <p className="font-mono text-foreground mt-1">
              {revision.proposedTerms.milestones.length}
            </p>
          </div>
        </div>
        {revision.concessions.length > 0 && (
          <div className="mt-3">
            <span
              className="text-[10px] uppercase tracking-[0.08em] text-subtle"
              style={labelStyle}
            >
              Concessions
            </span>
            <ul className="text-[12px] text-foreground mt-1.5 space-y-1">
              {revision.concessions.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-danger shrink-0">−</span>
                  <span className="leading-relaxed">{c}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {revision.asks.length > 0 && !isOpener && (
          <div className="mt-2">
            <span
              className="text-[10px] uppercase tracking-[0.08em] text-subtle"
              style={labelStyle}
            >
              Asks
            </span>
            <ul className="text-[12px] text-foreground mt-1.5 space-y-1">
              {revision.asks.map((a, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-accent shrink-0">+</span>
                  <span className="leading-relaxed">{a}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function RecommendationCard({
  summary,
  agreed,
}: {
  summary: NonNullable<Proposal["summary"]>;
  agreed: boolean;
}) {
  const recColors = {
    accept:
      "border-[rgba(16,185,129,0.25)] bg-[rgba(16,185,129,0.05)] text-success",
    reject:
      "border-[rgba(248,113,113,0.25)] bg-[rgba(248,113,113,0.05)] text-danger",
    renegotiate:
      "border-[rgba(251,191,36,0.25)] bg-[rgba(251,191,36,0.05)] text-warning",
  } as const;

  const confPercent = Math.round(summary.confidenceScore * 100);

  return (
    <div
      className={`rounded-xl border p-4 ${recColors[summary.recommendation]}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span
          className="text-[10px] uppercase tracking-[0.08em]"
          style={labelStyle}
        >
          Recommendation
        </span>
        <span className="text-[11px] font-mono">
          {confPercent}% confidence
        </span>
      </div>
      <p
        className="text-[17px] capitalize"
        style={{ ...headingStyle, letterSpacing: "-0.018em" }}
      >
        {agreed ? summary.recommendation : "No agreement"}
      </p>
      <p className="text-[12px] text-foreground/80 mt-2 leading-relaxed">
        {summary.recommendationReasoning}
      </p>
    </div>
  );
}

function ProsConsCard({
  summary,
}: {
  summary: NonNullable<Proposal["summary"]>;
}) {
  return (
    <div className="surface-card rounded-xl p-4 space-y-3">
      <h3 className="text-[13px] text-primary" style={labelStyle}>
        Pros & cons
      </h3>
      {summary.pros.length > 0 && (
        <div>
          <p
            className="text-[10px] uppercase tracking-[0.08em] text-success mb-1.5"
            style={labelStyle}
          >
            Pros
          </p>
          <ul className="text-[12px] text-foreground space-y-1">
            {summary.pros.map((p, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-success shrink-0">+</span>
                <span className="leading-relaxed">{p}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {summary.cons.length > 0 && (
        <div>
          <p
            className="text-[10px] uppercase tracking-[0.08em] text-danger mb-1.5"
            style={labelStyle}
          >
            Cons
          </p>
          <ul className="text-[12px] text-foreground space-y-1">
            {summary.cons.map((c, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-danger shrink-0">−</span>
                <span className="leading-relaxed">{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ConcessionsCard({
  summary,
}: {
  summary: NonNullable<Proposal["summary"]>;
}) {
  if (summary.keyConcessions.length === 0) return null;
  return (
    <div className="surface-card rounded-xl p-4">
      <h3
        className="text-[13px] text-primary mb-3"
        style={labelStyle}
      >
        Key concessions
      </h3>
      <ul className="space-y-2.5">
        {summary.keyConcessions.map((c, i) => (
          <li key={i} className="text-[12px]">
            <p className="text-foreground leading-relaxed">
              <span
                className={`text-[10px] uppercase tracking-[0.08em] mr-1.5 ${
                  c.party === "buyer" ? "text-accent" : "text-warning"
                }`}
                style={labelStyle}
              >
                {c.party}
              </span>
              {c.item}
            </p>
            <p className="text-subtle text-[11px] mt-0.5 pl-1">
              {c.rationale}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RiskFlagsCard({
  summary,
}: {
  summary: NonNullable<Proposal["summary"]>;
}) {
  return (
    <div className="rounded-xl border border-[rgba(248,113,113,0.25)] bg-[rgba(248,113,113,0.04)] p-4">
      <h3
        className="text-[13px] text-danger mb-2"
        style={labelStyle}
      >
        Risk flags
      </h3>
      <ul className="text-[12px] text-foreground space-y-1.5">
        {summary.riskFlags.map((r, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-danger shrink-0">!</span>
            <span className="leading-relaxed">{r}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FinalTermsCard({
  terms,
  initial,
}: {
  terms: DealParams;
  initial: DealParams;
}) {
  const delta = terms.totalAmount - initial.totalAmount;
  const deltaPercent = initial.totalAmount
    ? (delta / initial.totalAmount) * 100
    : 0;

  return (
    <div className="surface-card rounded-xl p-4 border-[rgba(113,112,255,0.25)]">
      <h3
        className="text-[13px] text-primary mb-3"
        style={labelStyle}
      >
        Final terms
      </h3>
      <div className="flex items-baseline justify-between mb-3">
        <span
          className="text-subtle text-[10px] uppercase tracking-[0.08em]"
          style={labelStyle}
        >
          Total
        </span>
        <div className="text-right">
          <p
            className="text-[17px] text-primary font-mono"
            style={{ fontWeight: 590, letterSpacing: "-0.014em" }}
          >
            {formatUsdc(terms.totalAmount)}
            <span className="text-muted text-[12px] ml-1.5">USDC</span>
          </p>
          {delta !== 0 && (
            <p
              className={`text-[11px] font-mono mt-0.5 ${
                delta > 0 ? "text-danger" : "text-success"
              }`}
            >
              {delta > 0 ? "+" : ""}
              {deltaPercent.toFixed(1)}% vs initial
            </p>
          )}
        </div>
      </div>
      <div className="space-y-1">
        {terms.milestones.map((m, i) => (
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
  );
}

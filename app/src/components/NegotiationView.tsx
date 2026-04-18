"use client";

import { useEffect, useState } from "react";
import { formatUsdc, type DealParams } from "@/lib/types";
import type { NegotiationBoundaries } from "@/memory/types";
import type { Proposal, Revision } from "@/negotiation/types";

type ViewState =
  | { kind: "running" }
  | { kind: "done"; proposal: Proposal }
  | { kind: "error"; message: string };

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
          headers: { "Content-Type": "application/json" },
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
      <div className="flex gap-2 text-2xl">
        <span className="animate-bounce" style={{ animationDelay: "0ms" }}>
          🤝
        </span>
      </div>
      <div>
        <h2 className="text-xl font-semibold text-white">
          Agents negotiating...
        </h2>
        <p className="text-sm text-foreground mt-2">
          Your Negotiator and the seller&apos;s Negotiator are exchanging
          proposals. This usually takes 15-30 seconds.
        </p>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
        <span>Running up to 5 rounds</span>
      </div>
      <button
        onClick={onCancel}
        className="text-sm text-muted hover:text-foreground transition-colors"
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
      <div className="text-2xl">⚠️</div>
      <h2 className="text-lg font-semibold text-white">Negotiation failed</h2>
      <p className="text-sm text-foreground">{message}</p>
      <button
        onClick={onCancel}
        className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
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
    <div className="h-full overflow-y-auto px-6 py-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">
            Negotiation Complete
          </h2>
          <p className="text-sm text-foreground mt-1">
            {proposal.revisions.length - 1} rounds, status:{" "}
            <StatusBadge status={proposal.status} />
          </p>
        </div>
        <button
          onClick={onCancel}
          className="text-sm text-muted hover:text-foreground transition-colors"
          aria-label="Back to chat"
        >
          ← Back
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Transcript */}
        <div className="lg:col-span-2 space-y-3">
          <h3 className="text-sm font-semibold text-white">Transcript</h3>
          {proposal.revisions.map((r) => (
            <TranscriptBubble key={r.round} revision={r} />
          ))}
        </div>

        {/* Summary sidebar */}
        <div className="space-y-4">
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
              className="w-full bg-accent hover:bg-accent-hover text-white rounded-lg py-3 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {agreed ? "Accept & Create Deal On-Chain" : "No agreement reached"}
            </button>
            <button
              onClick={onCancel}
              className="w-full border border-card-border text-foreground hover:bg-card rounded-lg py-2.5 text-sm font-medium transition-colors"
            >
              Reject & Renegotiate
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
    escalated: "text-yellow-400",
    negotiating: "text-accent",
    expired: "text-muted",
  };
  return (
    <span className={`font-semibold capitalize ${colors[status]}`}>
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
        className={`max-w-[85%] rounded-2xl p-4 border ${
          isBuyer
            ? "bg-accent/10 border-accent/30"
            : "bg-card border-card-border"
        }`}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-white uppercase tracking-wide">
            {isBuyer ? "Buyer Agent" : "Seller Agent"}
          </span>
          <span className="text-[10px] text-muted">
            Round {revision.round} · {revision.action}
          </span>
        </div>
        {!isOpener && (
          <p className="text-sm text-foreground leading-relaxed">
            {revision.reasoning}
          </p>
        )}
        {isOpener && (
          <p className="text-sm text-foreground leading-relaxed italic">
            {revision.reasoning}
          </p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted">Total</span>
            <p className="font-mono text-foreground mt-0.5">
              {formatUsdc(revision.proposedTerms.totalAmount)} USDC
            </p>
          </div>
          <div>
            <span className="text-muted">Milestones</span>
            <p className="font-mono text-foreground mt-0.5">
              {revision.proposedTerms.milestones.length}
            </p>
          </div>
        </div>
        {revision.concessions.length > 0 && (
          <div className="mt-3">
            <span className="text-[10px] uppercase tracking-wide text-muted font-semibold">
              Concessions
            </span>
            <ul className="text-xs text-foreground mt-1 space-y-0.5">
              {revision.concessions.map((c, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-danger">−</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {revision.asks.length > 0 && !isOpener && (
          <div className="mt-2">
            <span className="text-[10px] uppercase tracking-wide text-muted font-semibold">
              Asks
            </span>
            <ul className="text-xs text-foreground mt-1 space-y-0.5">
              {revision.asks.map((a, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-accent">+</span>
                  <span>{a}</span>
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
    accept: "border-success/40 bg-success/10 text-success",
    reject: "border-danger/40 bg-danger/10 text-danger",
    renegotiate: "border-yellow-400/40 bg-yellow-400/10 text-yellow-400",
  } as const;

  const confPercent = Math.round(summary.confidenceScore * 100);

  return (
    <div
      className={`rounded-xl border p-4 ${recColors[summary.recommendation]}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide">
          Recommendation
        </span>
        <span className="text-xs font-mono">
          {confPercent}% confidence
        </span>
      </div>
      <p className="text-lg font-semibold capitalize">
        {agreed ? summary.recommendation : "No agreement"}
      </p>
      <p className="text-xs text-foreground mt-2 leading-relaxed">
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
    <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-white">Pros & Cons</h3>
      {summary.pros.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-success font-semibold mb-1.5">
            Pros
          </p>
          <ul className="text-xs text-foreground space-y-1">
            {summary.pros.map((p, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-success">+</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {summary.cons.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-danger font-semibold mb-1.5">
            Cons
          </p>
          <ul className="text-xs text-foreground space-y-1">
            {summary.cons.map((c, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-danger">−</span>
                <span>{c}</span>
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
    <div className="bg-card border border-card-border rounded-xl p-4">
      <h3 className="text-sm font-semibold text-white mb-2">
        Key Concessions
      </h3>
      <ul className="space-y-2">
        {summary.keyConcessions.map((c, i) => (
          <li key={i} className="text-xs">
            <p className="text-foreground">
              <span
                className={`font-semibold uppercase text-[10px] mr-1.5 ${
                  c.party === "buyer" ? "text-accent" : "text-yellow-400"
                }`}
              >
                {c.party}
              </span>
              {c.item}
            </p>
            <p className="text-muted mt-0.5 pl-1.5">{c.rationale}</p>
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
    <div className="bg-danger/5 border border-danger/30 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-danger mb-2">Risk Flags</h3>
      <ul className="text-xs text-foreground space-y-1">
        {summary.riskFlags.map((r, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="text-danger">!</span>
            <span>{r}</span>
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
    <div className="bg-card border border-accent/30 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-white mb-3">Final Terms</h3>
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-xs text-muted">Total</span>
        <div className="text-right">
          <p className="text-lg font-semibold text-foreground">
            {formatUsdc(terms.totalAmount)} USDC
          </p>
          {delta !== 0 && (
            <p
              className={`text-xs ${
                delta > 0 ? "text-danger" : "text-success"
              }`}
            >
              {delta > 0 ? "+" : ""}
              {deltaPercent.toFixed(1)}% vs initial
            </p>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        {terms.milestones.map((m, i) => (
          <div
            key={i}
            className="flex items-center justify-between text-xs bg-background/50 rounded-lg px-3 py-2"
          >
            <span className="truncate mr-2 text-foreground">
              {i + 1}. {m.description}
            </span>
            <span className="shrink-0 font-mono text-foreground">
              {formatUsdc(m.amount)} USDC
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

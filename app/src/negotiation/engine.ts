// Negotiation engine. Runs alternating rounds between buyer and seller
// agents until one accepts, rejects, or max rounds is reached. Server-side.

import { AgentRole } from "@/agents/types";
import {
  buildNegotiatorPrompt,
  SUMMARIZER_PROMPT,
} from "@/agents/prompts/negotiator";
import type { DealParams } from "@/lib/types";
import type { NegotiationBoundaries } from "@/memory/types";
import type {
  NegotiationSummary,
  Proposal,
  Revision,
  RevisionAction,
} from "./types";

type LlmCaller = (system: string, userMessage: string) => Promise<string>;

interface AgentTurnOutput {
  action: RevisionAction;
  proposedTerms: DealParams;
  reasoning: string;
  concessions: string[];
  asks: string[];
}

function extractJson<T>(text: string): T {
  // LLMs sometimes wrap in ```json ... ``` or ``` ... ```
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("No JSON object found in agent response");
  }
  return JSON.parse(raw.slice(start, end + 1)) as T;
}

function validateTurn(out: AgentTurnOutput, initial: DealParams): AgentTurnOutput {
  if (!["counter", "accept", "reject"].includes(out.action)) {
    throw new Error(`invalid action: ${out.action}`);
  }
  // Preserve immutable metadata
  out.proposedTerms.dealId = initial.dealId;
  out.proposedTerms.sellerWallet = initial.sellerWallet;

  // Normalize milestones: ensure amounts sum to totalAmount within tolerance
  const sum = out.proposedTerms.milestones.reduce((a, m) => a + m.amount, 0);
  if (Math.abs(sum - out.proposedTerms.totalAmount) > 0.01) {
    // Rebalance: scale milestones to match totalAmount
    const scale = out.proposedTerms.totalAmount / (sum || 1);
    out.proposedTerms.milestones = out.proposedTerms.milestones.map((m) => ({
      description: m.description,
      amount: Math.round(m.amount * scale * 100) / 100,
    }));
  }
  return out;
}

function buildTurnPrompt(
  latestProposal: DealParams,
  transcript: Revision[]
): string {
  const history = transcript
    .map(
      (r) =>
        `Round ${r.round}, ${r.onBehalfOf.toUpperCase()} (${r.action}): ${r.reasoning}`
    )
    .join("\n");

  return `Current proposal on the table:
${JSON.stringify(latestProposal, null, 2)}

Negotiation history so far:
${history || "(you are the first responder)"}

Respond with your JSON decision now.`;
}

export async function runNegotiation(
  params: {
    proposalId: string;
    buyerWallet: string;
    sellerWallet: string;
    initialTerms: DealParams;
    buyerBoundaries: NegotiationBoundaries;
    sellerBoundaries: NegotiationBoundaries;
  },
  callLlm: LlmCaller
): Promise<Proposal> {
  const now = () => Math.floor(Date.now() / 1000);
  const maxRounds = Math.min(
    params.buyerBoundaries.maxNegotiationRounds,
    params.sellerBoundaries.maxNegotiationRounds
  );

  const revisions: Revision[] = [];

  // Seed: buyer's initial offer. Not an LLM turn, but recorded for transcript.
  revisions.push({
    round: 0,
    by: AgentRole.Structurer,
    onBehalfOf: "buyer",
    action: "open",
    proposedTerms: params.initialTerms,
    reasoning: "Initial deal structured from user's description.",
    concessions: [],
    asks: ["full deal as described"],
    timestamp: now(),
  });

  let latestProposal = params.initialTerms;
  let finalAction: RevisionAction | null = null;
  let round = 1;

  // Turn order: seller responds first to buyer's opening, then alternates.
  let currentSide: "buyer" | "seller" = "seller";

  while (round <= maxRounds) {
    const boundaries =
      currentSide === "buyer"
        ? params.buyerBoundaries
        : params.sellerBoundaries;
    const system = buildNegotiatorPrompt(currentSide, boundaries);
    const user = buildTurnPrompt(latestProposal, revisions);

    let raw: string;
    try {
      raw = await callLlm(system, user);
    } catch (err) {
      throw new Error(
        `Agent call failed on round ${round} (${currentSide}): ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    let turn: AgentTurnOutput;
    try {
      const parsed = extractJson<AgentTurnOutput>(raw);
      turn = validateTurn(parsed, params.initialTerms);
    } catch (err) {
      throw new Error(
        `Failed to parse ${currentSide} agent output on round ${round}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    revisions.push({
      round,
      by: AgentRole.Negotiator,
      onBehalfOf: currentSide,
      action: turn.action,
      proposedTerms: turn.proposedTerms,
      reasoning: turn.reasoning,
      concessions: turn.concessions ?? [],
      asks: turn.asks ?? [],
      timestamp: now(),
    });

    latestProposal = turn.proposedTerms;

    if (turn.action === "accept" || turn.action === "reject") {
      finalAction = turn.action;
      break;
    }

    currentSide = currentSide === "seller" ? "buyer" : "seller";
    round += 1;
  }

  const status =
    finalAction === "accept"
      ? "agreed"
      : finalAction === "reject"
      ? "rejected"
      : "escalated";

  const summary = await runSummarizer(revisions, latestProposal, callLlm);

  return {
    id: params.proposalId,
    origin: "manual",
    buyerWallet: params.buyerWallet,
    sellerWallet: params.sellerWallet,
    initialTerms: params.initialTerms,
    revisions,
    status,
    finalTerms: status === "agreed" ? latestProposal : undefined,
    summary,
    buyerBoundaries: params.buyerBoundaries,
    sellerBoundaries: params.sellerBoundaries,
    createdAt: now(),
    updatedAt: now(),
  };
}

async function runSummarizer(
  revisions: Revision[],
  finalTerms: DealParams,
  callLlm: LlmCaller
): Promise<NegotiationSummary> {
  const transcript = revisions
    .map(
      (r) => `[Round ${r.round}, ${r.onBehalfOf} (${r.action})]
  reasoning: ${r.reasoning}
  concessions: ${r.concessions.join("; ") || "none"}
  asks: ${r.asks.join("; ") || "none"}
  terms: total=${r.proposedTerms.totalAmount}, milestones=${r.proposedTerms.milestones.length}`
    )
    .join("\n\n");

  const userMessage = `Final agreed terms:
${JSON.stringify(finalTerms, null, 2)}

Full transcript:
${transcript}

Produce the summary JSON now.`;

  const raw = await callLlm(SUMMARIZER_PROMPT, userMessage);
  try {
    return extractJson<NegotiationSummary>(raw);
  } catch {
    // Fall back to a minimal summary if the model misbehaves. Better UX than
    // crashing the whole negotiation on a summarizer format error.
    return {
      pros: [],
      cons: ["Summarizer output could not be parsed. Review transcript manually."],
      keyConcessions: [],
      riskFlags: ["Summary generation failed; human review recommended"],
      confidenceScore: 0.3,
      recommendation: "renegotiate",
      recommendationReasoning:
        "Automated summary unavailable. Review the transcript before signing.",
    };
  }
}

import { NextRequest, NextResponse } from "next/server";
import { runNegotiation } from "@/negotiation/engine";
import { defaultSellerBoundaries } from "@/negotiation/types";
import type { DealParams } from "@/lib/types";
import type { NegotiationBoundaries, NegotiationStyle } from "@/memory/types";
import { dispatchLlm, getLlmOptsFromEnv } from "@/lib/llm-dispatch";
import { supabase, table } from "@/lib/supabase";
import { AgentRole } from "@/agents/types";
import type { Proposal } from "@/negotiation/types";

interface NegotiateRequest {
  proposalId: string;
  buyerWallet: string;
  initialTerms: DealParams;
  buyerBoundaries: NegotiationBoundaries;
  sellerBoundaries?: NegotiationBoundaries;
  renegotiationRequest?: string;
  overrideInstructions?: string;
}

function getLlmOpts(request: NextRequest) {
  const provider = request.headers.get("x-llm-provider");
  const model = request.headers.get("x-llm-model");
  const apiKey = request.headers.get("x-llm-key");
  if (provider && model && apiKey) return { provider, model, apiKey };
  return getLlmOptsFromEnv();
}

function isRateLimitedNegotiationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /429|rate.?limit|temporarily rate-limited|quota/i.test(message);
}

function buildEscalatedProposal(body: NegotiateRequest, reason: string): Proposal {
  const now = Date.now();
  const requestText =
    typeof body.renegotiationRequest === "string"
      ? body.renegotiationRequest.trim()
      : typeof body.overrideInstructions === "string"
      ? body.overrideInstructions.trim()
      : "";

  return {
    id: `${body.proposalId}-escalated`,
    origin: "manual",
    buyerWallet: body.buyerWallet,
    sellerWallet: body.initialTerms.sellerWallet,
    initialTerms: body.initialTerms,
    revisions: [
      {
        round: 1,
        by: AgentRole.Negotiator,
        onBehalfOf: "buyer",
        action: "counter",
        proposedTerms: body.initialTerms,
        reasoning: requestText || "Renegotiation requested.",
        concessions: [],
        asks: requestText ? [requestText] : ["Review renegotiated terms manually."],
        timestamp: now,
      },
    ],
    status: "escalated",
    summary: {
      pros: ["Renegotiation request captured for both parties"],
      cons: ["Agent negotiation could not complete because the LLM provider was rate-limited"],
      keyConcessions: [],
      riskFlags: [reason],
      confidenceScore: 0.35,
      recommendation: "renegotiate",
      recommendationReasoning:
        "The deal is escalated so both parties can review the requested change while the agent provider recovers.",
    },
    buyerBoundaries: body.buyerBoundaries,
    sellerBoundaries: body.sellerBoundaries ?? defaultSellerBoundaries(),
    createdAt: now,
    updatedAt: now,
  };
}

export async function POST(request: NextRequest) {
  let body: NegotiateRequest | null = null;

  try {
    body = (await request.json()) as NegotiateRequest;
    if (
      !body?.proposalId ||
      !body?.buyerWallet ||
      !body?.initialTerms ||
      !body?.buyerBoundaries
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Apply buyer's saved persona to their negotiation boundaries
    const { data: templates } = await supabase
      .from(table("agent_templates"))
      .select("style_index, price_floor, escalate_after")
      .eq("wallet", body.buyerWallet)
      .limit(1);
    if (templates && templates.length > 0) {
      const p = templates[0];
      const styleMap: NegotiationStyle[] = ["conservative", "balanced", "balanced"];
      body.buyerBoundaries = {
        ...body.buyerBoundaries,
        negotiationStyle: styleMap[p.style_index ?? 1],
        maxPriceDecrease: 100 - (p.price_floor ?? 80),
        maxNegotiationRounds: p.escalate_after ?? body.buyerBoundaries.maxNegotiationRounds,
      };
    }

    // Buyer's agent uses their own LLM config (from client headers)
    const buyerLlm = getLlmOpts(request);
    if (!buyerLlm) {
      return NextResponse.json({ error: "No LLM provider configured" }, { status: 500 });
    }

    // Seller's simulated agent always uses the server's LLM so it doesn't
    // compete with the buyer's quota (avoids 429 on free-tier models)
    const sellerLlm = getLlmOptsFromEnv() ?? buyerLlm;
    const renegotiationRequest =
      typeof body.renegotiationRequest === "string"
        ? body.renegotiationRequest.trim()
        : typeof body.overrideInstructions === "string"
        ? body.overrideInstructions.trim()
        : "";

    const buyerCallLlm = (system: string, user: string) =>
      dispatchLlm({ ...buyerLlm, system, messages: [{ role: "user", content: user }], maxTokens: 1024 });

    const sellerCallLlm = (system: string, user: string) =>
      dispatchLlm({ ...sellerLlm, system, messages: [{ role: "user", content: user }], maxTokens: 1024 });

    const proposal = await runNegotiation(
      {
        proposalId: body.proposalId,
        buyerWallet: body.buyerWallet,
        sellerWallet: body.initialTerms.sellerWallet,
        initialTerms: body.initialTerms,
        buyerBoundaries: body.buyerBoundaries,
        sellerBoundaries: body.sellerBoundaries ?? defaultSellerBoundaries(),
        renegotiationRequest: renegotiationRequest || undefined,
      },
      buyerCallLlm,
      sellerCallLlm
    );

    return NextResponse.json({ proposal });
  } catch (err) {
    console.error("Negotiation failed:", err);
    if (body?.initialTerms && isRateLimitedNegotiationError(err)) {
      return NextResponse.json({
        proposal: buildEscalatedProposal(
          body,
          "The selected LLM provider is temporarily rate-limited."
        ),
      });
    }

    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unknown negotiation error",
      },
      { status: 500 }
    );
  }
}

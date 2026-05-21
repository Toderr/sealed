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

type LlmOpts = { provider: string; model: string; apiKey: string };

function getLlmOpts(request: NextRequest) {
  const provider = request.headers.get("x-llm-provider");
  const model = request.headers.get("x-llm-model");
  const apiKey = request.headers.get("x-llm-key");
  if (provider && model && apiKey) return { provider, model, apiKey };
  return getLlmOptsFromEnv();
}

function llmLabel(opts: LlmOpts) {
  return `${opts.provider}:${opts.model}`;
}

function sameLlm(a: LlmOpts, b: LlmOpts) {
  return a.provider === b.provider && a.model === b.model && a.apiKey === b.apiKey;
}

function isOpenRouterFreeModel(opts: LlmOpts | null) {
  return opts?.provider === "openrouter" && /:free$/i.test(opts.model);
}

function selectSellerLlm(
  buyerLlm: LlmOpts,
  serverLlm: LlmOpts | null
): { opts: LlmOpts; source: "buyer" | "server" } {
  if (!serverLlm) return { opts: buyerLlm, source: "buyer" };

  // Free OpenRouter models are useful for demos but unstable for production
  // negotiation. If the buyer supplied a real provider such as OpenAI, use it
  // for the simulated seller too instead of failing the seller turn.
  if (isOpenRouterFreeModel(serverLlm) && !isOpenRouterFreeModel(buyerLlm)) {
    return { opts: buyerLlm, source: "buyer" };
  }

  return { opts: serverLlm, source: "server" };
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
      cons: ["The automated negotiation needs manual review before it can continue"],
      keyConcessions: [],
      riskFlags: [reason],
      confidenceScore: 0.35,
      recommendation: "renegotiate",
      recommendationReasoning:
        "The deal is escalated so both parties can review the requested change before signing.",
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

    const serverLlm = getLlmOptsFromEnv();
    const sellerLlm = selectSellerLlm(buyerLlm, serverLlm);
    console.info("[negotiate] LLM routing", {
      buyer: llmLabel(buyerLlm),
      seller: llmLabel(sellerLlm.opts),
      sellerSource: sellerLlm.source,
    });

    const renegotiationRequest =
      typeof body.renegotiationRequest === "string"
        ? body.renegotiationRequest.trim()
        : typeof body.overrideInstructions === "string"
        ? body.overrideInstructions.trim()
        : "";

    const buyerCallLlm = (system: string, user: string) =>
      dispatchLlm({ ...buyerLlm, system, messages: [{ role: "user", content: user }], maxTokens: 1024 });

    const sellerCallLlm = async (system: string, user: string) => {
      try {
        return await dispatchLlm({
          ...sellerLlm.opts,
          system,
          messages: [{ role: "user", content: user }],
          maxTokens: 1024,
        });
      } catch (error) {
        if (isRateLimitedNegotiationError(error) && !sameLlm(sellerLlm.opts, buyerLlm)) {
          console.warn("[negotiate] Seller LLM rate-limited; retrying seller turn with buyer LLM", {
            failedSeller: llmLabel(sellerLlm.opts),
            fallback: llmLabel(buyerLlm),
          });
          return dispatchLlm({
            ...buyerLlm,
            system,
            messages: [{ role: "user", content: user }],
            maxTokens: 1024,
          });
        }
        throw error;
      }
    };

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
          "The automated negotiation paused before reaching a clear agreement."
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

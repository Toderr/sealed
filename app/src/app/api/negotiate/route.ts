import { NextRequest, NextResponse } from "next/server";
import { runNegotiation } from "@/negotiation/engine";
import { defaultSellerBoundaries } from "@/negotiation/types";
import type { DealParams } from "@/lib/types";
import type { NegotiationBoundaries, NegotiationStyle } from "@/memory/types";
import { dispatchLlm, getLlmOptsFromEnv } from "@/lib/llm-dispatch";
import { supabase, table } from "@/lib/supabase";

interface NegotiateRequest {
  proposalId: string;
  buyerWallet: string;
  initialTerms: DealParams;
  buyerBoundaries: NegotiationBoundaries;
  sellerBoundaries?: NegotiationBoundaries;
}

function getLlmOpts(request: NextRequest) {
  const provider = request.headers.get("x-llm-provider");
  const model = request.headers.get("x-llm-model");
  const apiKey = request.headers.get("x-llm-key");
  if (provider && model && apiKey) return { provider, model, apiKey };
  return getLlmOptsFromEnv();
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as NegotiateRequest;
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
      },
      buyerCallLlm,
      sellerCallLlm
    );

    return NextResponse.json({ proposal });
  } catch (err) {
    console.error("Negotiation failed:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unknown negotiation error",
      },
      { status: 500 }
    );
  }
}

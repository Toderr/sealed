import { NextRequest, NextResponse } from "next/server";
import { runNegotiation } from "@/negotiation/engine";
import { defaultSellerBoundaries } from "@/negotiation/types";
import type { DealParams } from "@/lib/types";
import type { NegotiationBoundaries } from "@/memory/types";
import { dispatchLlm, getLlmOptsFromEnv } from "@/lib/llm-dispatch";

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

    const llm = getLlmOpts(request);
    if (!llm) {
      return NextResponse.json({ error: "No LLM provider configured" }, { status: 500 });
    }

    const callLlm = (system: string, user: string) =>
      dispatchLlm({
        ...llm,
        system,
        messages: [{ role: "user", content: user }],
        maxTokens: 1024,
      });

    const proposal = await runNegotiation(
      {
        proposalId: body.proposalId,
        buyerWallet: body.buyerWallet,
        sellerWallet: body.initialTerms.sellerWallet,
        initialTerms: body.initialTerms,
        buyerBoundaries: body.buyerBoundaries,
        sellerBoundaries: body.sellerBoundaries ?? defaultSellerBoundaries(),
      },
      callLlm
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

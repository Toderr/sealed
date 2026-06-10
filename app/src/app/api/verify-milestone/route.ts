import { NextRequest, NextResponse } from "next/server";
import { VERIFIER_SYSTEM_PROMPT } from "@/agents/prompts/verifier";
import type { ProofType, VerifierReview } from "@/lib/types";
import { dispatchLlm, getLlmOptsFromRequest, type LlmMessage } from "@/lib/llm-dispatch";
import { extractJson } from "@/lib/extract-json";

interface VerifyRequest {
  milestoneDescription: string;
  proofType: ProofType;
  proofData: string;
  sellerNote?: string;
}

function buildUserMessage(body: VerifyRequest): LlmMessage {
  const note = body.sellerNote ? `\n\nSeller's note: ${body.sellerNote}` : "";

  if (body.proofType === "image") {
    return {
      role: "user",
      content: [
        {
          text: `Milestone description:\n${body.milestoneDescription}\n\nProof submitted: see attached image.${note}\n\nReview the image and respond with the JSON decision.`,
        },
        { imageDataUrl: body.proofData },
      ],
    };
  }

  if (body.proofType === "url") {
    return {
      role: "user",
      content: `Milestone description:\n${body.milestoneDescription}\n\nProof submitted (URL reference): ${body.proofData}${note}\n\nYou cannot fetch the URL. Advise based on the reference plus any seller note. Respond with JSON.`,
    };
  }

  return {
    role: "user",
    content: `Milestone description:\n${body.milestoneDescription}\n\nProof submitted (text): ${body.proofData}${note}\n\nRespond with JSON.`,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as VerifyRequest;
    if (!body?.milestoneDescription || !body?.proofType || !body?.proofData) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    if (
      body.proofType === "image" &&
      !body.proofData.startsWith("data:image/")
    ) {
      return NextResponse.json(
        { error: "Image proof must be a data URL" },
        { status: 400 }
      );
    }

    const llm = getLlmOptsFromRequest(request);
    if (!llm) {
      return NextResponse.json({ error: "No LLM provider configured" }, { status: 500 });
    }

    const raw = await dispatchLlm({
      ...llm,
      system: VERIFIER_SYSTEM_PROMPT,
      messages: [buildUserMessage(body)],
      maxTokens: 512,
    });

    const parsed = extractJson<Omit<VerifierReview, "reviewedAt">>(raw, "verifier response");
    const review: VerifierReview = {
      ...parsed,
      reviewedAt: Math.floor(Date.now() / 1000),
    };

    return NextResponse.json({ review });
  } catch (err) {
    console.error("Milestone verification failed:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unknown verification error",
      },
      { status: 500 }
    );
  }
}

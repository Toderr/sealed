import { NextRequest, NextResponse } from "next/server";
import { VERIFIER_SYSTEM_PROMPT } from "@/agents/prompts/verifier";
import type { ProofType, VerifierReview } from "@/lib/types";
import { dispatchLlm, getLlmOptsFromEnv, type LlmMessage } from "@/lib/llm-dispatch";

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

function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("No JSON object found in verifier response");
  }
  return JSON.parse(raw.slice(start, end + 1)) as T;
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

    const llm = getLlmOpts(request);
    if (!llm) {
      return NextResponse.json({ error: "No LLM provider configured" }, { status: 500 });
    }

    const raw = await dispatchLlm({
      ...llm,
      system: VERIFIER_SYSTEM_PROMPT,
      messages: [buildUserMessage(body)],
      maxTokens: 512,
    });

    const parsed = extractJson<Omit<VerifierReview, "reviewedAt">>(raw);
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

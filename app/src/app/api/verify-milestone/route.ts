import { NextRequest } from "next/server";
import { VERIFIER_SYSTEM_PROMPT } from "@/agents/prompts/verifier";
import type { ProofType, VerifierReview } from "@/lib/types";
import { dispatchLlm, friendlyLlmError, getLlmOptsFromRequest, type LlmMessage } from "@/lib/llm-dispatch";
import { extractJson } from "@/lib/extract-json";
import { HttpError, json, withRoute, parseJsonBody } from "@/lib/api-error";

interface VerifyRequest {
  milestoneDescription: string;
  proofType: ProofType;
  proofData: string;
  sellerNote?: string;
}

const RECOMMENDATIONS = new Set(["approve", "reject", "request_clarification"]);

// extractJson only parses — the LLM can emit any shape under the precise
// VerifierReview type. Validate fields before the value reaches callers.
function validateReviewShape(p: unknown): Omit<VerifierReview, "reviewedAt"> {
  if (!p || typeof p !== "object") throw new HttpError(502, "Verifier returned a malformed review");
  const o = p as Record<string, unknown>;
  if (typeof o.confidence !== "number" || !Number.isFinite(o.confidence) || o.confidence < 0 || o.confidence > 1) {
    throw new HttpError(502, "Verifier returned an invalid confidence score");
  }
  if (typeof o.recommendation !== "string" || !RECOMMENDATIONS.has(o.recommendation)) {
    throw new HttpError(502, "Verifier returned an invalid recommendation");
  }
  if (typeof o.notes !== "string") {
    throw new HttpError(502, "Verifier returned malformed notes");
  }
  return {
    confidence: o.confidence,
    recommendation: o.recommendation as VerifierReview["recommendation"],
    notes: o.notes,
  };
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

export const POST = withRoute(async (request: NextRequest) => {
  try {
    const body = (await parseJsonBody(request)) as VerifyRequest;
    if (!body?.milestoneDescription || !body?.proofType || !body?.proofData) {
      throw new HttpError(400, "Missing required fields");
    }
    if (
      body.proofType === "image" &&
      !body.proofData.startsWith("data:image/")
    ) {
      throw new HttpError(400, "Image proof must be a data URL");
    }

    const llm = getLlmOptsFromRequest(request);
    if (!llm) {
      throw new HttpError(500, "No LLM provider configured");
    }

    const raw = await dispatchLlm({
      ...llm,
      system: VERIFIER_SYSTEM_PROMPT,
      messages: [buildUserMessage(body)],
      maxTokens: 512,
    });

    const parsed = extractJson<unknown>(raw, "verifier response");
    const review: VerifierReview = {
      ...validateReviewShape(parsed),
      reviewedAt: Math.floor(Date.now() / 1000),
    };

    return json({ review });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error("Milestone verification failed:", err);
    throw new HttpError(502, friendlyLlmError(err));
  }
});

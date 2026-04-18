import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { VERIFIER_SYSTEM_PROMPT } from "@/agents/prompts/verifier";
import type { ProofType, VerifierReview } from "@/lib/types";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_MODEL = "anthropic/claude-sonnet-4";

interface VerifyRequest {
  milestoneDescription: string;
  proofType: ProofType;
  proofData: string; // data URL for image, raw string for url/text
  sellerNote?: string;
}

function parseDataUrl(dataUrl: string): {
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  base64: string;
} {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/);
  if (!match) throw new Error("Invalid image data URL");
  return {
    mediaType: match[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
    base64: match[2],
  };
}

function buildUserText(body: VerifyRequest): string {
  const note = body.sellerNote
    ? `\n\nSeller's note: ${body.sellerNote}`
    : "";
  if (body.proofType === "image") {
    return `Milestone description:
${body.milestoneDescription}

Proof submitted: see attached image.${note}

Review the image and respond with the JSON decision.`;
  }
  if (body.proofType === "url") {
    return `Milestone description:
${body.milestoneDescription}

Proof submitted (URL reference): ${body.proofData}${note}

You cannot fetch the URL. Advise based on the reference plus any seller note. Respond with JSON.`;
  }
  // text
  return `Milestone description:
${body.milestoneDescription}

Proof submitted (text): ${body.proofData}${note}

Respond with JSON.`;
}

async function callOpenRouter(body: VerifyRequest): Promise<string> {
  const userContent: unknown[] = [{ type: "text", text: buildUserText(body) }];
  if (body.proofType === "image") {
    userContent.push({
      type: "image_url",
      image_url: { url: body.proofData },
    });
  }
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || OPENROUTER_MODEL,
      max_tokens: 512,
      messages: [
        { role: "system", content: VERIFIER_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter error ${response.status}: ${err}`);
  }
  const data = await response.json();
  return data.choices[0].message.content;
}

async function callAnthropic(body: VerifyRequest): Promise<string> {
  const client = new Anthropic();
  const userContent: Anthropic.ContentBlockParam[] = [
    { type: "text", text: buildUserText(body) },
  ];
  if (body.proofType === "image") {
    const { mediaType, base64 } = parseDataUrl(body.proofData);
    userContent.push({
      type: "image",
      source: { type: "base64", media_type: mediaType, data: base64 },
    });
  }
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 512,
    system: VERIFIER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });
  const content = response.content[0];
  return content.type === "text" ? content.text : "";
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

    const raw = process.env.OPENROUTER_API_KEY
      ? await callOpenRouter(body)
      : await callAnthropic(body);

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

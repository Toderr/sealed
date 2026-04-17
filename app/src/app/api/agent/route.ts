import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are a B2B deal structuring agent. Your job is to help business owners create escrow deals on Solana.

When a user describes a deal in natural language, extract these structured parameters:
- deal_id: A short unique identifier for the deal
- seller_wallet: The seller's Solana wallet address
- total_amount: Total deal value in USDC
- milestones: Array of { description, amount } objects

Rules:
- All amounts must be in USDC
- Milestone amounts must sum to total_amount
- Each milestone should be clearly verifiable
- Maximum 10 milestones per deal
- Keep deal_id under 32 characters

Respond in JSON format when you have enough information to create the deal.
Ask clarifying questions if the deal terms are incomplete.
Speak in both English and Bahasa Indonesia as appropriate for the user.`;

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_MODEL = "anthropic/claude-sonnet-4";

async function callOpenRouter(messages: Anthropic.MessageParam[]) {
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || OPENROUTER_MODEL,
      max_tokens: 1024,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
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

async function callAnthropic(messages: Anthropic.MessageParam[]) {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages,
  });

  const content = response.content[0];
  return content.type === "text" ? content.text : "";
}

export async function POST(request: NextRequest) {
  const { messages } = await request.json();

  const useOpenRouter = !!process.env.OPENROUTER_API_KEY;
  const text = useOpenRouter
    ? await callOpenRouter(messages)
    : await callAnthropic(messages);

  return NextResponse.json({ response: text });
}

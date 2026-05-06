import { NextRequest, NextResponse } from "next/server";
import { buildMemoryContext } from "@/lib/agent-memory";
import { dispatchLlm, getLlmOptsFromEnv } from "@/lib/llm-dispatch";

const BASE_SYSTEM_PROMPT = `You are a B2B deal structuring agent. Your job is to help business owners create escrow deals on Solana.

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
Always respond in the same language the user writes in. If they write in English, reply in English only. If they write in Bahasa Indonesia, reply only in Bahasa Indonesia. Never mix languages in a single response.`;

async function buildSystemPrompt(wallet: string | undefined): Promise<string> {
  if (!wallet) return BASE_SYSTEM_PROMPT;
  const memory = await buildMemoryContext(wallet);
  if (!memory) return BASE_SYSTEM_PROMPT;
  return `${BASE_SYSTEM_PROMPT}\n\n--- Known context about this user (from past deals) ---\n${memory}\n\nUse this context to personalize your suggestions, but never reveal raw memory entries verbatim.`;
}

function getLlmOpts(request: NextRequest) {
  const provider = request.headers.get("x-llm-provider");
  const model = request.headers.get("x-llm-model");
  const apiKey = request.headers.get("x-llm-key");
  if (provider && model && apiKey) return { provider, model, apiKey };
  return getLlmOptsFromEnv();
}

export async function POST(request: NextRequest) {
  const { messages } = await request.json();
  const wallet = request.headers.get("x-wallet") ?? undefined;

  const llm = getLlmOpts(request);
  if (!llm) {
    return NextResponse.json({ error: "No LLM provider configured" }, { status: 500 });
  }

  const systemPrompt = await buildSystemPrompt(wallet);

  try {
    const text = await dispatchLlm({
      ...llm,
      system: systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      maxTokens: 1024,
    });
    return NextResponse.json({ response: text });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[agent] LLM call failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

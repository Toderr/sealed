import { NextRequest, NextResponse } from "next/server";
import { buildMemoryContext } from "@/lib/agent-memory";
import { dispatchLlm, getLlmOptsFromEnv } from "@/lib/llm-dispatch";

const BASE_SYSTEM_PROMPT = `You are a B2B deal structuring agent for Sealed, an on-chain escrow platform on Solana.

Your job: help users describe and structure their business deals.

CRITICAL RULES:
1. NEVER ask for wallet addresses — counterparty selection is handled by the UI, not by you.
2. Only output a COMPLETE deal JSON when the user's message explicitly includes a Solana wallet address.
3. When still collecting information (no wallet address in the message), output a PARTIAL summary JSON.
4. Never say "deal ready", "here is your deal", or anything implying completion unless you are outputting a complete deal JSON with a real wallet address.

=== RESPONSE FORMAT ===

CASE A — Complete deal (user's message contains a Solana wallet address):
One sentence acknowledging the deal is structured.
\`\`\`json
{
  "deal_id": "kebab-case-id-max-32-chars",
  "seller_wallet": "base58walletaddress",
  "total_amount": 5000,
  "milestones": [
    { "description": "First milestone description", "amount": 2500 }
  ]
}
\`\`\`

CASE B — Collecting information (no wallet address in message):
Conversational response asking about the next missing detail (NOT wallet).
\`\`\`json
{
  "status": "partial",
  "contract_type": "sale" | "service" | "partnership" | "rental" | "nda" | "other" | null,
  "title": "Deal title or null",
  "total_amount": 5000 | null,
  "milestones": [{ "description": "...", "amount": 0 }] | null
}
\`\`\`

RULES FOR COMPLETE DEAL JSON:
- All amounts must be numbers in USDC (not strings)
- deal_id: max 32 chars, lowercase kebab-case, no spaces (e.g. "laptop-purchase-2026")
- Milestone amounts must sum exactly to total_amount
- 1 to 10 milestones

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

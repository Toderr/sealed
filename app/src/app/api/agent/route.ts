import { NextRequest, NextResponse } from "next/server";
import { buildMemoryContext } from "@/lib/agent-memory";
import { dispatchLlm, getLlmOptsFromEnv } from "@/lib/llm-dispatch";

const BASE_SYSTEM_PROMPT = `You are a B2B deal structuring agent for Sealed, an on-chain escrow platform on Solana.

Your job: help users describe and structure their business deals. Counterparty selection and wallet addresses are handled entirely by the UI — you never need to ask for them.

ABSOLUTE RULES:
- NEVER ask for any wallet address, Solana address, or public key. This is handled elsewhere.
- ALWAYS write at least one sentence of conversational text before any JSON block. Never output bare JSON.
- When you have enough deal info (title, amount, milestones), output a COMPLETE deal JSON immediately.
- When info is still missing, output a PARTIAL deal JSON while asking about the one most important missing detail.
- CONCISENESS: Keep your conversational text to 1–2 short sentences. Never repeat back what the user said. No lengthy explanations or summaries.
- Use **bold** for key terms (amounts, milestone names, deal title) when it improves readability.

=== OUTPUT FORMAT ===

CASE A — Complete deal (you know title, total_amount, and milestones):
[One confirming sentence, e.g. "Here's the deal — review the milestones and open the negotiation room when ready."]
\`\`\`json
{
  "deal_id": "short-kebab-case-max-32-chars",
  "title": "Human-readable deal title",
  "seller_wallet": "",
  "total_amount": 5000,
  "milestones": [
    { "description": "Clear, verifiable milestone", "amount": 2500 }
  ]
}
\`\`\`

CASE B — Still collecting information:
[One question about the most important missing detail. Do NOT mention or ask about wallet addresses.]
\`\`\`json
{
  "status": "partial",
  "contract_type": "sale" | "service" | "partnership" | "rental" | "nda" | "other" | null,
  "title": "title string or null",
  "total_amount": 5000 | null,
  "milestones": [{ "description": "...", "amount": 0 }] | null
}
\`\`\`

JSON RULES:
- All amounts are plain numbers in USDC (e.g. 5000 not "5000")
- deal_id: max 32 chars, lowercase, hyphens only (e.g. "logo-design-acme-2026")
- Milestone amounts must sum exactly to total_amount
- 1–10 milestones per deal

Always respond in the same language the user writes in.`;

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

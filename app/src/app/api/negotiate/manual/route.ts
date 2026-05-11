import { NextRequest, NextResponse } from "next/server";
import { supabase, table } from "@/lib/supabase";
import { dispatchLlm } from "@/lib/llm-dispatch";

// Always use a reliable paid model for agent responses.
// Ignores OPENROUTER_MODEL env var on purpose — free-tier models hit rate limits
// during real-time negotiation conversations.
function getServerLlm() {
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: "anthropic", model: "claude-haiku-4-5-20251001", apiKey: process.env.ANTHROPIC_API_KEY };
  }
  if (process.env.OPENROUTER_API_KEY) {
    return { provider: "openrouter", model: "anthropic/claude-haiku-4-5", apiKey: process.env.OPENROUTER_API_KEY };
  }
  return null;
}

async function fetchDealContext(dealId: string) {
  try {
    const { data } = await supabase
      .from(table("deals"))
      .select("title, total_amount_usdc, milestones, buyer_wallet")
      .eq("deal_id", dealId)
      .single();
    return data ?? null;
  } catch {
    return null;
  }
}

async function saveMessage(dealId: string, role: string, content: string, wallet: string) {
  try {
    await supabase.from(table("messages")).insert({ deal_id: dealId, role, content, wallet });
  } catch {}
}

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    dealId: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    isOpening?: boolean;
    sellerWallet?: string;
    // Client passes deal context directly so server doesn't need to re-fetch
    // (deal may only be in sessionStorage, not yet in Supabase)
    dealContext?: {
      title: string;
      totalAmount: number;
      milestones: Array<{ description: string; amount: number }>;
      buyerWallet: string;
    };
  };

  const { dealId, messages, isOpening, sellerWallet, dealContext } = body;

  if (!dealId) {
    return NextResponse.json({ error: "dealId required" }, { status: 400 });
  }

  // Prefer client-supplied context; fall back to Supabase fetch
  let dealTitle: string;
  let totalAmount: number;
  let buyerWallet: string;
  let milestoneList: Array<{ description: string; amount: number }>;

  if (dealContext && dealContext.title && dealContext.totalAmount > 0) {
    dealTitle = dealContext.title;
    totalAmount = dealContext.totalAmount;
    buyerWallet = dealContext.buyerWallet ?? "";
    milestoneList = dealContext.milestones ?? [];
  } else {
    const deal = await fetchDealContext(dealId);
    dealTitle = deal?.title ?? dealId;
    totalAmount = deal?.total_amount_usdc ?? 0;
    buyerWallet = deal?.buyer_wallet ?? "";
    milestoneList = deal?.milestones ?? [];
  }

  const milestonesText = milestoneList
    .map((m, i) => `  ${i + 1}. ${m.description} — $${m.amount} USDC`)
    .join("\n");

  const systemPrompt = `You are an AI negotiation agent representing the BUYER in a business deal.

Deal: "${dealTitle}"
Total value: $${totalAmount} USDC
Payment milestones:
${milestonesText || "  (no milestones defined yet)"}

You are speaking directly with the SELLER (counterparty) who is reviewing these terms.

Your role:
- Explain the deal clearly and professionally
- Consider the seller's counterproposals fairly
- Accept minor changes (timeline, ≤10% amount adjustments)
- Decline unreasonable requests, explaining why
- Work toward a mutual agreement
- When the seller proposes a change you accept, ALWAYS restate the updated terms clearly

When both parties have fully agreed on all terms (original or modified), end your response with EXACTLY this format — no extra lines between them:
[AGREED] — one sentence summarizing the final agreed terms.
<agreed_terms>{"totalAmount": <total USDC as number>, "milestones": [{"description": "<description>", "amount": <USDC as number>}]}</agreed_terms>

The <agreed_terms> JSON must reflect the FINAL negotiated values, not the original ones.

Be concise and professional. Respond in the same language the seller uses.`;

  const llm = getServerLlm();
  if (!llm) {
    return NextResponse.json({ error: "No LLM provider configured on the server" }, { status: 500 });
  }

  // Opening message: agent introduces itself and summarizes the contract
  const callMessages = isOpening
    ? [{ role: "user" as const, content: "Please introduce yourself and summarize the deal terms clearly so I can review them." }]
    : messages;

  try {
    const response = await dispatchLlm({
      ...llm,
      system: systemPrompt,
      messages: callMessages,
      maxTokens: 600,
    });

    const agreed = response.includes("[AGREED]");

    // Extract and strip the <agreed_terms> block so it doesn't appear in the chat UI
    let agreedTerms: { totalAmount: number; milestones: Array<{ description: string; amount: number }> } | null = null;
    let cleanResponse = response;
    if (agreed) {
      const match = response.match(/<agreed_terms>([\s\S]*?)<\/agreed_terms>/);
      if (match) {
        try { agreedTerms = JSON.parse(match[1].trim()); } catch {}
        cleanResponse = response.replace(/<agreed_terms>[\s\S]*?<\/agreed_terms>/, "").trim();
      }
    }

    // Persist both sides to sealed_messages so buyer can see the conversation
    if (isOpening) {
      await saveMessage(dealId, "assistant", cleanResponse, buyerWallet);
    } else if (messages.length > 0) {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
      if (lastUserMsg) {
        await saveMessage(dealId, "user", lastUserMsg.content, sellerWallet ?? "");
      }
      await saveMessage(dealId, "assistant", cleanResponse, buyerWallet);
    }

    return NextResponse.json({ response: cleanResponse, agreed, agreedTerms });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
  };

  const { dealId, messages, isOpening, sellerWallet } = body;

  if (!dealId) {
    return NextResponse.json({ error: "dealId required" }, { status: 400 });
  }

  const deal = await fetchDealContext(dealId);

  const dealTitle = deal?.title ?? dealId;
  const totalAmount = deal?.total_amount_usdc ?? 0;
  const buyerWallet = deal?.buyer_wallet ?? "";
  const milestoneList: Array<{ description: string; amount: number }> = deal?.milestones ?? [];
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

When both parties have fully agreed, end your response with:
[AGREED] — followed by one sentence summarizing the final terms.

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

    // Persist both sides to sealed_messages so buyer can see the conversation
    if (isOpening) {
      await saveMessage(dealId, "assistant", response, buyerWallet);
    } else if (messages.length > 0) {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
      if (lastUserMsg) {
        await saveMessage(dealId, "user", lastUserMsg.content, sellerWallet ?? "");
      }
      await saveMessage(dealId, "assistant", response, buyerWallet);
    }

    return NextResponse.json({ response, agreed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

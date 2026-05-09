import { NextRequest, NextResponse } from "next/server";
import { supabase, table } from "@/lib/supabase";
import { dispatchLlm, getLlmOptsFromEnv } from "@/lib/llm-dispatch";

export async function POST(request: NextRequest) {
  const { dealId, messages } = await request.json() as {
    dealId: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!dealId || !Array.isArray(messages)) {
    return NextResponse.json({ error: "dealId and messages required" }, { status: 400 });
  }

  // Fetch deal context — try Supabase, continue without it if unavailable
  let dealTitle = "this deal";
  let totalAmount = 0;
  let milestonesText = "";

  try {
    const { data } = await supabase
      .from(table("deals"))
      .select("title, total_amount_usdc, milestones")
      .eq("deal_id", dealId)
      .single();

    if (data) {
      dealTitle = data.title ?? dealId;
      totalAmount = data.total_amount_usdc ?? 0;
      const milestones: Array<{ description: string; amount: number }> = data.milestones ?? [];
      milestonesText = milestones
        .map((m, i) => `  ${i + 1}. ${m.description} — $${m.amount} USDC`)
        .join("\n");
    }
  } catch {
    // Non-fatal — proceed without deal context
  }

  const systemPrompt = `You are an AI negotiation agent representing the BUYER in a deal called "${dealTitle}".

Current deal terms:
- Total value: $${totalAmount} USDC
${milestonesText ? `- Payment milestones:\n${milestonesText}` : ""}

The counterparty (seller) does not have their own AI agent, so they are negotiating with you directly.

Your objectives:
1. Explain the current deal terms clearly if asked.
2. Consider the seller's counterproposals fairly and respond constructively.
3. Accept small, reasonable modifications (e.g. minor timeline adjustments, small amount changes within 10%).
4. Decline unreasonable changes that significantly hurt the buyer, and explain why.
5. Work toward a mutual agreement efficiently.

When both parties have reached full agreement on terms, end your response with exactly:
[AGREED] — then summarize the final agreed terms in one sentence.

Be concise and professional. Always respond in the same language the seller uses.`;

  const llm = getLlmOptsFromEnv();
  if (!llm) {
    return NextResponse.json({ error: "No LLM provider configured on the server" }, { status: 500 });
  }

  try {
    const response = await dispatchLlm({
      ...llm,
      system: systemPrompt,
      messages,
      maxTokens: 512,
    });

    const agreed = response.includes("[AGREED]");
    return NextResponse.json({ response, agreed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

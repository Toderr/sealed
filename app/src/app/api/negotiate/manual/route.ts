import { NextRequest } from "next/server";
import { supabase, table } from "@/lib/supabase";
import { dispatchLlm, friendlyLlmError, getLlmOptsFromRequest } from "@/lib/llm-dispatch";
import { HttpError, json, withRoute } from "@/lib/api-error";

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

export const POST = withRoute(async (request: NextRequest) => {
  const body = await request.json() as {
    dealId: string;
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    isOpening?: boolean;
    sellerWallet?: string;
    // Fully-manual mode: draft a reply ON BEHALF OF THE GIVEN PARTY (to send to
    // the counterparty), rather than the buyer's agent replying. The draft is
    // returned only — NOT persisted — for that party to edit and send.
    draftForParty?: "seller" | "buyer";
    // Client passes deal context directly so server doesn't need to re-fetch
    // (deal may only be in sessionStorage, not yet in Supabase)
    dealContext?: {
      title: string;
      totalAmount: number;
      milestones: Array<{ description: string; amount: number }>;
      buyerWallet: string;
    };
  };

  const { dealId, messages, isOpening, sellerWallet, draftForParty, dealContext } = body;

  if (!dealId) {
    throw new HttpError(400, "dealId required");
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
    throw new HttpError(500, "No LLM provider configured on the server");
  }

  // ── Fully-manual: draft a reply FOR THE GIVEN PARTY ─────────────────────────
  // Represent the drafting party, replying to the counterparty. A pure draft: no
  // [AGREED] handling, no persistence — just return the text for that party to
  // edit and send. Uses the caller's OWN LLM key (x-llm-* headers) first — this
  // is "draft with MY agent" — falling back to the server env.
  if (draftForParty) {
    const draftLlm = getLlmOptsFromRequest(request) ?? llm;
    if (!draftLlm) {
      throw new HttpError(400, "No agent configured. Set up your agent in Agent Setup.");
    }
    const me = draftForParty === "buyer" ? "BUYER" : "SELLER";
    const them = draftForParty === "buyer" ? "SELLER" : "BUYER";
    const draftSystem = `You are helping the ${me} draft their next reply in a deal negotiation with the ${them}.

Deal: "${dealTitle}"
Total value: $${totalAmount} USDC
Payment milestones:
${milestonesText || "  (no milestones defined yet)"}

Write ONLY the ${me.toLowerCase()}'s reply message — natural, concise, professional, in the same language as the conversation. Do not add labels, quotes, or meta-commentary; output just the message text the ${me.toLowerCase()} would send.`;
    // From the seller's POV: the counterparty's (buyer's) messages are the
    // "incoming" ones. In this transcript the seller's own lines are role "user"
    // and the buyer's are role "assistant"; flip them so the model drafts as the
    // seller responding to the buyer.
    const draftMessages = messages.map((m) =>
      m.role === "system"
        ? { role: "user" as const, content: `Context: ${m.content}` }
        : { role: (m.role === "user" ? "assistant" : "user") as "user" | "assistant", content: m.content }
    );
    if (draftMessages.length === 0) {
      draftMessages.push({ role: "user", content: "Open the conversation with a brief, friendly message proposing to proceed with these terms." });
    }
    try {
      const draft = await dispatchLlm({ ...draftLlm, system: draftSystem, messages: draftMessages, maxTokens: 800 });
      return json({ response: draft.trim(), agreed: false, agreedTerms: null });
    } catch (err) {
      if (err instanceof HttpError) throw err;
      console.error("[negotiate/manual draft] LLM call failed:", err);
      throw new HttpError(502, friendlyLlmError(err));
    }
  }

  // Opening message: agent introduces itself and summarizes the contract
  const callMessages = isOpening
    ? [{ role: "user" as const, content: "Please introduce yourself and summarize the deal terms clearly so I can review them." }]
    : messages.map((message) =>
        message.role === "system"
          ? { role: "user" as const, content: `Shared negotiation context: ${message.content}` }
          : { role: message.role, content: message.content }
      );

  try {
    const response = await dispatchLlm({
      ...llm,
      system: systemPrompt,
      messages: callMessages,
      // Needs headroom for the reply plus the <agreed_terms> JSON block; 600 was
      // low enough to truncate the block (and to trip low-credit token ceilings).
      maxTokens: 1200,
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

    return json({ response: cleanResponse, agreed, agreedTerms });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    // Log the real error (may contain raw provider JSON) server-side only, and
    // return a clean, user-facing message — never leak provider errors to chat.
    console.error("[negotiate/manual] LLM call failed:", err);
    throw new HttpError(502, friendlyLlmError(err));
  }
});

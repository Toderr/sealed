import { NextRequest, NextResponse } from "next/server";
import { dispatchLlm, getLlmOptsFromEnv } from "@/lib/llm-dispatch";
import { buildSystemPrompt } from "@/lib/agent-system-prompt";

export async function POST(request: NextRequest) {
  const { messages } = await request.json();
  const wallet = request.headers.get("x-wallet") ?? undefined;

  const llm = getLlmOptsFromEnv();
  if (!llm) {
    return NextResponse.json({ error: "No LLM provider configured on server" }, { status: 500 });
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

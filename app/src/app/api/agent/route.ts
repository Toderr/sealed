import { NextRequest } from "next/server";
import { dispatchLlm, getLlmOptsFromEnv } from "@/lib/llm-dispatch";
import { buildSystemPrompt } from "@/lib/agent-system-prompt";
import { getWallet } from "@/lib/auth";
import { HttpError, json, withRoute } from "@/lib/api-error";

export const POST = withRoute(async (request: NextRequest) => {
  const { messages } = await request.json();
  const wallet = getWallet(request) ?? undefined;

  const llm = getLlmOptsFromEnv();
  if (!llm) {
    throw new HttpError(500, "No LLM provider configured on server");
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
    return json({ response: text });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    console.error("[agent] LLM call failed:", message);
    throw new HttpError(500, message);
  }
});

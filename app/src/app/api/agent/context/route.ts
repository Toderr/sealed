import { NextRequest } from "next/server";
import { buildSystemPrompt } from "@/lib/agent-system-prompt";
import { json, withRoute } from "@/lib/api-error";

// Returns the agent system prompt (including per-user memory) for client-side
// LLM calls. The actual LLM call happens in the browser with the user's own key.
export const POST = withRoute(async (request: NextRequest) => {
  const { wallet } = await request.json();
  const systemPrompt = await buildSystemPrompt(wallet ?? undefined);
  return json({ systemPrompt });
});

import { NextRequest } from "next/server";
import { buildSystemPrompt } from "@/lib/agent-system-prompt";
import { getWallet } from "@/lib/auth";
import { json, withRoute } from "@/lib/api-error";

// Returns the agent system prompt (including per-user memory) for client-side
// LLM calls. The actual LLM call happens in the browser with the user's own key.
// Personalized to the authenticated session wallet (optional).
export const POST = withRoute(async (request: NextRequest) => {
  const wallet = await getWallet(request);
  const systemPrompt = await buildSystemPrompt(wallet ?? undefined);
  return json({ systemPrompt });
});

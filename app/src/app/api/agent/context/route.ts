import { NextRequest, NextResponse } from "next/server";
import { buildSystemPrompt } from "@/lib/agent-system-prompt";

// Returns the agent system prompt (including per-user memory) for client-side
// LLM calls. The actual LLM call happens in the browser with the user's own key.
export async function POST(request: NextRequest) {
  const { wallet } = await request.json();
  const systemPrompt = await buildSystemPrompt(wallet ?? undefined);
  return NextResponse.json({ systemPrompt });
}

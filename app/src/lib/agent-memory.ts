import { supabase, table } from "@/lib/supabase";

export type MemoryType = "preference" | "history" | "reputation" | "context";

export interface AgentMemory {
  id: string;
  wallet: string;
  memory_type: MemoryType;
  content: string;
  source_deal_id: string | null;
  created_at: string;
}

export async function getMemory(
  wallet: string,
  memoryType?: MemoryType
): Promise<AgentMemory[]> {
  let query = supabase
    .from(table("agent_memory"))
    .select("*")
    .eq("wallet", wallet)
    .order("created_at", { ascending: false })
    .limit(50);

  if (memoryType) query = query.eq("memory_type", memoryType);

  const { data } = await query;
  return (data ?? []) as AgentMemory[];
}

export async function recordMemory(
  wallet: string,
  memoryType: MemoryType,
  content: string,
  sourceDealId?: string
): Promise<void> {
  await supabase.from(table("agent_memory")).insert({
    wallet,
    memory_type: memoryType,
    content,
    source_deal_id: sourceDealId ?? null,
  });
}

export async function buildMemoryContext(wallet: string): Promise<string> {
  const memories = await getMemory(wallet);
  if (memories.length === 0) return "";

  const grouped: Record<MemoryType, string[]> = {
    preference: [],
    history: [],
    reputation: [],
    context: [],
  };

  for (const m of memories) {
    grouped[m.memory_type].push(m.content);
  }

  const sections: string[] = [];
  if (grouped.preference.length) {
    sections.push(
      `User preferences:\n${grouped.preference.map((c) => `- ${c}`).join("\n")}`
    );
  }
  if (grouped.history.length) {
    sections.push(
      `Past deal patterns:\n${grouped.history.slice(0, 5).map((c) => `- ${c}`).join("\n")}`
    );
  }
  if (grouped.reputation.length) {
    sections.push(
      `Counterparty reputation:\n${grouped.reputation.slice(0, 5).map((c) => `- ${c}`).join("\n")}`
    );
  }
  if (grouped.context.length) {
    sections.push(
      `Business context:\n${grouped.context.slice(0, 5).map((c) => `- ${c}`).join("\n")}`
    );
  }

  return sections.join("\n\n");
}

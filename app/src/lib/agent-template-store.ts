import { insforge, table } from "@/lib/insforge";
import type { AgentTemplate } from "@/lib/types";

export async function getTierLimit(wallet: string): Promise<number> {
  const { data } = await insforge.database
    .from(table("users"))
    .select("verified_at, kyc_status")
    .eq("wallet", wallet)
    .single();

  if (!data) return 1;
  const u = data as { verified_at: string | null; kyc_status: string };
  return u.verified_at && u.kyc_status === "approved" ? 10 : 1;
}

export async function getTemplates(wallet: string): Promise<AgentTemplate[]> {
  const { data } = await insforge.database
    .from(table("agent_templates"))
    .select("*")
    .eq("wallet", wallet)
    .order("created_at", { ascending: true });

  return (data ?? []) as AgentTemplate[];
}

export async function getActiveTemplate(
  wallet: string
): Promise<AgentTemplate | null> {
  const { data } = await insforge.database
    .from(table("agent_templates"))
    .select("*")
    .eq("wallet", wallet)
    .eq("active", true)
    .single();

  return (data as AgentTemplate) ?? null;
}

export async function createTemplate(
  wallet: string,
  data: Omit<AgentTemplate, "id" | "wallet" | "created_at">
): Promise<{ ok: true; template: AgentTemplate } | { ok: false; error: string }> {
  const existing = await getTemplates(wallet);
  const limit = await getTierLimit(wallet);

  if (existing.length >= limit) {
    return {
      ok: false,
      error:
        limit === 1
          ? "Unverified accounts can only have 1 template. Get verified to unlock 10."
          : "Template limit (10) reached.",
    };
  }

  // If first template, make it active
  const makeActive = existing.length === 0 ? true : data.active;

  const { data: created, error } = await insforge.database
    .from(table("agent_templates"))
    .insert({ ...data, wallet, active: makeActive })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, template: created as AgentTemplate };
}

export async function updateTemplate(
  id: string,
  wallet: string,
  updates: Partial<Omit<AgentTemplate, "id" | "wallet" | "created_at">>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await insforge.database
    .from(table("agent_templates"))
    .update(updates)
    .eq("id", id)
    .eq("wallet", wallet);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteTemplate(
  id: string,
  wallet: string
): Promise<void> {
  await insforge.database
    .from(table("agent_templates"))
    .delete()
    .eq("id", id)
    .eq("wallet", wallet);
}

export async function setActive(id: string, wallet: string): Promise<void> {
  // Deactivate all templates for this wallet first
  await insforge.database
    .from(table("agent_templates"))
    .update({ active: false })
    .eq("wallet", wallet);

  // Activate the selected one
  await insforge.database
    .from(table("agent_templates"))
    .update({ active: true })
    .eq("id", id)
    .eq("wallet", wallet);
}

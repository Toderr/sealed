import { NextRequest } from "next/server";
import type { AgentTemplate } from "@/lib/types";
import {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  setActive,
} from "@/lib/agent-template-store";
import { HttpError, json, withRoute, parseJsonBody } from "@/lib/api-error";

export const GET = withRoute(async (request: NextRequest) => {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) throw new HttpError(400, "Missing wallet");

  const templates = await getTemplates(wallet);
  return json({ templates });
});

export const POST = withRoute(async (request: NextRequest) => {
  const { wallet, ...data } = (await parseJsonBody(request)) as { wallet?: string } & Omit<AgentTemplate, "id" | "wallet" | "created_at">;
  if (!wallet) throw new HttpError(400, "Missing wallet");

  const result = await createTemplate(wallet, data);
  if (!result.ok) throw new HttpError(422, result.error);
  return json({ template: result.template });
});

export const PATCH = withRoute(async (request: NextRequest) => {
  const { id, wallet, action, ...data } = (await parseJsonBody(request)) as { id?: string; wallet?: string; action?: string } & Partial<Omit<AgentTemplate, "id" | "wallet" | "created_at">>;
  if (!id || !wallet) throw new HttpError(400, "Missing id or wallet");

  if (action === "set-active") {
    await setActive(id, wallet);
    return json({ ok: true });
  }

  const result = await updateTemplate(id, wallet, data);
  if (!result.ok) throw new HttpError(500, result.error);
  return json({ ok: true });
});

export const DELETE = withRoute(async (request: NextRequest) => {
  const { id, wallet } = (await parseJsonBody(request)) as { id?: string; wallet?: string };
  if (!id || !wallet) throw new HttpError(400, "Missing id or wallet");

  await deleteTemplate(id, wallet);
  return json({ ok: true });
});

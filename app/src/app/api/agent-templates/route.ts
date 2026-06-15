import { NextRequest } from "next/server";
import {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  setActive,
} from "@/lib/agent-template-store";
import { HttpError, json, withRoute } from "@/lib/api-error";

export const GET = withRoute(async (request: NextRequest) => {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) throw new HttpError(400, "Missing wallet");

  const templates = await getTemplates(wallet);
  return json({ templates });
});

export const POST = withRoute(async (request: NextRequest) => {
  const body = await request.json();
  const { wallet, ...data } = body;
  if (!wallet) throw new HttpError(400, "Missing wallet");

  const result = await createTemplate(wallet, data);
  if (!result.ok) throw new HttpError(422, result.error);
  return json({ template: result.template });
});

export const PATCH = withRoute(async (request: NextRequest) => {
  const body = await request.json();
  const { id, wallet, action, ...data } = body;
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
  const body = await request.json();
  const { id, wallet } = body;
  if (!id || !wallet) throw new HttpError(400, "Missing id or wallet");

  await deleteTemplate(id, wallet);
  return json({ ok: true });
});

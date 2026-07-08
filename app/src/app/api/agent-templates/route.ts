import { NextRequest } from "next/server";
import {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  setActive,
} from "@/lib/agent-template-store";
import { requireWallet } from "@/lib/auth";
import { HttpError, json, withRoute } from "@/lib/api-error";

// The wallet is always the authenticated session identity — a user can only
// read/manage their OWN agent templates.

export const GET = withRoute(async (request: NextRequest) => {
  const wallet = await requireWallet(request);
  const templates = await getTemplates(wallet);
  return json({ templates });
});

export const POST = withRoute(async (request: NextRequest) => {
  const wallet = await requireWallet(request);
  const { wallet: _ignore, ...data } = await request.json();
  void _ignore;

  const result = await createTemplate(wallet, data);
  if (!result.ok) throw new HttpError(422, result.error);
  return json({ template: result.template });
});

export const PATCH = withRoute(async (request: NextRequest) => {
  const wallet = await requireWallet(request);
  const { id, wallet: _ignore, action, ...data } = await request.json();
  void _ignore;
  if (!id) throw new HttpError(400, "Missing id");

  if (action === "set-active") {
    await setActive(id, wallet);
    return json({ ok: true });
  }

  const result = await updateTemplate(id, wallet, data);
  if (!result.ok) throw new HttpError(500, result.error);
  return json({ ok: true });
});

export const DELETE = withRoute(async (request: NextRequest) => {
  const wallet = await requireWallet(request);
  const { id } = await request.json();
  if (!id) throw new HttpError(400, "Missing id");

  await deleteTemplate(id, wallet);
  return json({ ok: true });
});

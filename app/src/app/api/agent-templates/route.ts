import { NextRequest } from "next/server";
import {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  setActive,
} from "@/lib/agent-template-store";

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) return Response.json({ error: "Missing wallet" }, { status: 400 });

  const templates = await getTemplates(wallet);
  return Response.json({ templates });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { wallet, ...data } = body;
  if (!wallet) return Response.json({ error: "Missing wallet" }, { status: 400 });

  const result = await createTemplate(wallet, data);
  if (!result.ok) return Response.json({ error: result.error }, { status: 422 });
  return Response.json({ template: result.template });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, wallet, action, ...data } = body;
  if (!id || !wallet) return Response.json({ error: "Missing id or wallet" }, { status: 400 });

  if (action === "set-active") {
    await setActive(id, wallet);
    return Response.json({ ok: true });
  }

  const result = await updateTemplate(id, wallet, data);
  if (!result.ok) return Response.json({ error: result.error }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { id, wallet } = body;
  if (!id || !wallet) return Response.json({ error: "Missing id or wallet" }, { status: 400 });

  await deleteTemplate(id, wallet);
  return Response.json({ ok: true });
}

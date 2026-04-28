import { NextRequest } from "next/server";
import { insforge, table } from "@/lib/insforge";

export async function GET(request: NextRequest) {
  const dealId = request.nextUrl.searchParams.get("deal_id");
  if (!dealId) return Response.json({ error: "Missing deal_id" }, { status: 400 });

  const { data, error } = await insforge.database
    .from(table("messages"))
    .select("id, role, content, wallet, created_at")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: true });

  if (error) return Response.json({ messages: [] });
  return Response.json({ messages: data ?? [] });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { deal_id, role, content, wallet } = body;

  if (!deal_id || !role || !content) {
    return Response.json({ error: "Missing fields" }, { status: 400 });
  }

  const { data, error } = await insforge.database
    .from(table("messages"))
    .insert({ deal_id, role, content, wallet })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ message: data });
}

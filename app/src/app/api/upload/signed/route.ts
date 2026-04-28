import { NextRequest } from "next/server";
import { insforge } from "@/lib/insforge";

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (!key) {
    return Response.json({ error: "Missing key" }, { status: 400 });
  }

  // For now return the public URL directly from InsForge Storage.
  // In production, generate short-lived signed URLs here.
  const url = insforge.storage.from("sealed-docs").getPublicUrl(key);
  return Response.json({ url });
}

import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (!key) {
    return Response.json({ error: "Missing key" }, { status: 400 });
  }

  const { data, error } = await supabase.storage
    .from("sealed-docs")
    .createSignedUrl(key, 3600);

  if (error || !data) {
    return Response.json({ error: "Failed to generate URL" }, { status: 500 });
  }

  return Response.json({ url: data.signedUrl });
}

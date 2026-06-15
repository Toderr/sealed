import { supabase } from "@/lib/supabase";
import { HttpError, json, withRoute } from "@/lib/api-error";

export const GET = withRoute(async (request) => {
  const key = request.nextUrl.searchParams.get("key");
  if (!key) {
    throw new HttpError(400, "Missing key");
  }

  const { data, error } = await supabase.storage
    .from("sealed-docs")
    .createSignedUrl(key, 3600);

  if (error || !data) {
    throw new HttpError(500, "Failed to generate URL");
  }

  return json({ url: data.signedUrl });
});

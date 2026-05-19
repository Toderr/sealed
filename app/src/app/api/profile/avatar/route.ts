import { NextRequest } from "next/server";
import sharp from "sharp";
import { supabase, table } from "@/lib/supabase";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const MAGIC_JPEG = [0xff, 0xd8, 0xff];
const MAGIC_PNG = [0x89, 0x50, 0x4e, 0x47];

function isImage(buf: Buffer): boolean {
  return (
    MAGIC_PNG.every((b, i) => buf[i] === b) ||
    MAGIC_JPEG.every((b, i) => buf[i] === b)
  );
}

export async function POST(request: NextRequest) {
  const wallet = request.headers.get("x-wallet");
  if (!wallet) {
    return Response.json({ error: "Missing x-wallet header" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return Response.json({ error: "No file" }, { status: 400 });
  if (file.size > MAX_SIZE) return Response.json({ error: "File exceeds 5 MB" }, { status: 413 });

  const buf = Buffer.from(await file.arrayBuffer());
  if (!isImage(buf)) {
    return Response.json({ error: "Only PNG and JPG are accepted" }, { status: 415 });
  }

  // Resize to 256×256 JPEG, strip metadata
  let resized: Buffer;
  try {
    resized = await sharp(buf)
      .resize(256, 256, { fit: "cover", position: "center" })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
  } catch {
    return Response.json({ error: "Image processing failed" }, { status: 422 });
  }

  const avatarUrl = `data:image/jpeg;base64,${resized.toString("base64")}`;

  // Persist to sealed_users (upsert — user may not exist yet)
  const { error } = await supabase
    .from(table("users"))
    .upsert(
      { wallet, handle: wallet, avatar_url: avatarUrl },
      { onConflict: "wallet", ignoreDuplicates: false }
    );

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ avatarUrl });
}

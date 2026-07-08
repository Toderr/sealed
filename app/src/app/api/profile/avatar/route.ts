import sharp from "sharp";
import { supabase, table } from "@/lib/supabase";
import { requireWallet } from "@/lib/auth";
import { withRoute, json, HttpError } from "@/lib/api-error";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const MAGIC_JPEG = [0xff, 0xd8, 0xff];
const MAGIC_PNG = [0x89, 0x50, 0x4e, 0x47];

function isImage(buf: Buffer): boolean {
  return (
    MAGIC_PNG.every((b, i) => buf[i] === b) ||
    MAGIC_JPEG.every((b, i) => buf[i] === b)
  );
}

export const POST = withRoute(async (request) => {
  const wallet = await requireWallet(request);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw new HttpError(400, "Invalid form data");
  }

  const file = formData.get("file") as File | null;
  if (!file) throw new HttpError(400, "No file");
  if (file.size > MAX_SIZE) throw new HttpError(413, "File exceeds 5 MB");

  const buf = Buffer.from(await file.arrayBuffer());
  if (!isImage(buf)) {
    throw new HttpError(415, "Only PNG and JPG are accepted");
  }

  // Resize to 256×256 JPEG, strip metadata
  let resized: Buffer;
  try {
    resized = await sharp(buf)
      .resize(256, 256, { fit: "cover", position: "center" })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new HttpError(422, "Image processing failed");
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
    throw new HttpError(500, error.message);
  }

  return json({ avatarUrl });
});

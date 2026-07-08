import { supabase, table } from "@/lib/supabase";
import { requireWallet } from "@/lib/auth";
import { HttpError, json, withRoute } from "@/lib/api-error";
import { randomUUID } from "crypto";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

// Magic bytes for allowed file types
const MAGIC_MAP: { mime: string; bytes: number[]; ext: string }[] = [
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46], ext: "pdf" },
  { mime: "application/vnd.openxmlformats-officedocument", bytes: [0x50, 0x4b, 0x03, 0x04], ext: "docx" },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47], ext: "png" },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff], ext: "jpg" },
];

function detectType(buf: Buffer): { mime: string; ext: string } | null {
  for (const { mime, bytes, ext } of MAGIC_MAP) {
    if (bytes.every((b, i) => buf[i] === b)) return { mime, ext };
  }
  return null;
}

export const POST = withRoute(async (request) => {
  const walletHeader = await requireWallet(request);

  const dealId = request.headers.get("x-deal-id") ?? "standalone";
  const milestoneIndex = parseInt(request.headers.get("x-milestone-index") ?? "0", 10);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw new HttpError(400, "Invalid form data");
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    throw new HttpError(400, "No file provided");
  }

  if (file.size > MAX_SIZE) {
    throw new HttpError(413, "File exceeds 10 MB limit");
  }

  const arrayBuffer = await file.arrayBuffer();
  let buf = Buffer.from(arrayBuffer as ArrayBuffer);

  // Step 1: Magic bytes validation
  const detected = detectType(buf);
  if (!detected) {
    throw new HttpError(415, "File type not allowed. Accepted: PDF, DOCX, PNG, JPG");
  }

  // Step 2: Re-encode images to strip EXIF/payloads
  if (detected.mime === "image/png" || detected.mime === "image/jpeg") {
    try {
      const sharp = (await import("sharp")).default;
      buf = (await sharp(buf).toBuffer()) as Buffer<ArrayBuffer>;
    } catch {
      throw new HttpError(422, "Image processing failed");
    }
  }

  // Step 3: Validate PDF is parseable
  if (detected.mime === "application/pdf") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<unknown>;
      await pdfParse(buf);
    } catch {
      throw new HttpError(422, "PDF could not be validated");
    }
  }

  // Step 4: Upload to Supabase Storage
  const uuid = randomUUID();
  const storagePath = `deals/${dealId}/${uuid}.${detected.ext}`;
  const blob = new Blob([buf], { type: detected.mime });

  const { error: storageError } = await supabase.storage
    .from("sealed-docs")
    .upload(storagePath, blob);

  if (storageError) {
    console.error("[upload] storage error", storageError);
    throw new HttpError(500, "Storage upload failed");
  }

  // Step 5: Replace any prior proof for this deal + milestone so a re-upload
  // supersedes the old file instead of stacking duplicates. Only applies to
  // real milestone uploads (not the "standalone" bucket). Remove the old storage
  // objects first, then their rows; failures here are non-fatal (best-effort
  // cleanup — the new record below is what matters).
  if (dealId !== "standalone") {
    const { data: prior } = await supabase
      .from(table("deliverables"))
      .select("id, storage_key")
      .eq("deal_id", dealId)
      .eq("milestone_index", milestoneIndex);
    if (prior && prior.length > 0) {
      const keys = prior.map((d) => d.storage_key).filter(Boolean);
      if (keys.length > 0) {
        await supabase.storage.from("sealed-docs").remove(keys);
      }
      await supabase
        .from(table("deliverables"))
        .delete()
        .eq("deal_id", dealId)
        .eq("milestone_index", milestoneIndex);
    }
  }

  // Step 6: Record the new deliverable in sealed_deliverables
  const { data: record, error: dbError } = await supabase
    .from(table("deliverables"))
    .insert({
      deal_id: dealId,
      milestone_index: milestoneIndex,
      submitter_wallet: walletHeader,
      storage_key: storagePath,
      filename: file.name,
      content_type: detected.mime,
      size_bytes: buf.length,
      scan_status: "clean",
    })
    .select()
    .single();

  if (dbError) {
    console.error("[upload] db error", dbError);
    throw new HttpError(500, "Failed to record file");
  }

  return json({
    id: (record as { id: string }).id,
    original_name: file.name,
    file_type: detected.mime,
    size_bytes: buf.length,
    storage_key: storagePath,
  });
});

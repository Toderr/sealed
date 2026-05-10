import { NextRequest } from "next/server";
import { supabase, table } from "@/lib/supabase";
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

export async function POST(request: NextRequest) {
  const walletHeader = request.headers.get("x-wallet");
  const dealId = request.headers.get("x-deal-id") ?? "standalone";
  const milestoneIndex = parseInt(request.headers.get("x-milestone-index") ?? "0", 10);

  if (!walletHeader) {
    return Response.json({ error: "Missing x-wallet header" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return Response.json({ error: "File exceeds 10 MB limit" }, { status: 413 });
  }

  const arrayBuffer = await file.arrayBuffer();
  let buf = Buffer.from(arrayBuffer as ArrayBuffer);

  // Step 1: Magic bytes validation
  const detected = detectType(buf);
  if (!detected) {
    return Response.json(
      { error: "File type not allowed. Accepted: PDF, DOCX, PNG, JPG" },
      { status: 415 }
    );
  }

  // Step 2: Re-encode images to strip EXIF/payloads
  if (detected.mime === "image/png" || detected.mime === "image/jpeg") {
    try {
      const sharp = (await import("sharp")).default;
      buf = (await sharp(buf).toBuffer()) as Buffer<ArrayBuffer>;
    } catch (e) {
      return Response.json(
        { error: "Image processing failed" },
        { status: 422 }
      );
    }
  }

  // Step 3: Validate PDF is parseable
  if (detected.mime === "application/pdf") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<unknown>;
      await pdfParse(buf);
    } catch {
      return Response.json(
        { error: "PDF could not be validated" },
        { status: 422 }
      );
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
    return Response.json({ error: "Storage upload failed" }, { status: 500 });
  }

  // Step 5: Record in sealed_deliverables
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
    return Response.json({ error: "Failed to record file" }, { status: 500 });
  }

  return Response.json({
    id: (record as { id: string }).id,
    original_name: file.name,
    file_type: detected.mime,
    size_bytes: buf.length,
    storage_key: storagePath,
  });
}

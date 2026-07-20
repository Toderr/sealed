import { supabase, table } from "@/lib/supabase";
import { requireWallet } from "@/lib/auth";
import { HttpError, json, withRoute } from "@/lib/api-error";
import { randomUUID } from "crypto";

// Node runtime — image re-encode (sharp) + pdf-parse need Node APIs, and the
// edge runtime has a tighter body limit. NOTE: on Vercel serverless the request
// body is hard-capped at ~4.5 MB regardless of this route's own MAX_SIZE. For
// files up to the 25 MB product limit, large uploads must go DIRECT to Supabase
// Storage via a signed upload URL (see /api/upload/sign) rather than through
// this route. This route stays the path for small files + server-side scanning.
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB (product cap; larger → Drive link)

// Magic bytes for allowed file types. Office formats (docx/pptx/xlsx) are all
// ZIP containers, so they share the PK\x03\x04 signature — the extension is
// carried through from the client filename for those. zip/exe and other
// executable/archive types are intentionally NOT accepted.
const OOXML_ZIP = [0x50, 0x4b, 0x03, 0x04];
const MAGIC_MAP: { mime: string; bytes: number[]; ext: string }[] = [
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46], ext: "pdf" },
  { mime: "application/vnd.openxmlformats-officedocument", bytes: OOXML_ZIP, ext: "docx" },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47], ext: "png" },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff], ext: "jpg" },
];

// Extensions the client may declare for allowed types. Markdown is plain text
// (no reliable magic bytes) so it's validated by extension only; the OOXML
// family shares the zip signature so the concrete ext comes from the filename.
const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  md: "text/markdown",
};
const OOXML_EXTS = new Set(["docx", "pptx", "xlsx"]);

function extOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

// Validate a file's real bytes against its declared extension. Returns the
// resolved {mime, ext} or null if the content doesn't match an allowed type.
function detectType(buf: Buffer, filename: string): { mime: string; ext: string } | null {
  const ext = extOf(filename);
  // Markdown: no magic bytes — accept by extension, treat as text.
  if (ext === "md") return { mime: "text/markdown", ext: "md" };
  // OOXML (docx/pptx/xlsx): all zip-signed; trust the declared ext once the
  // zip signature checks out, so a .pptx isn't stored/served as .docx.
  if (OOXML_EXTS.has(ext) && OOXML_ZIP.every((b, i) => buf[i] === b)) {
    return { mime: EXT_MIME[ext], ext };
  }
  // Everything else: match by magic bytes.
  for (const { mime, bytes, ext: mapExt } of MAGIC_MAP) {
    if (bytes.every((b, i) => buf[i] === b)) return { mime, ext: mapExt };
  }
  return null;
}

export const POST = withRoute(async (request) => {
  const walletHeader = requireWallet(request);

  const dealId = request.headers.get("x-deal-id") ?? "standalone";
  const milestoneIndex = parseInt(request.headers.get("x-milestone-index") ?? "0", 10);
  // Chat attachment mode (#3): the buyer shares an IMAGE in chat rather than
  // submitting milestone proof. Stores the file but does NOT create a
  // deliverable row or replace any milestone proof — it's not proof of work.
  const isChatAttachment = request.headers.get("x-chat-attachment") === "1";

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
    throw new HttpError(413, "File exceeds the 25 MB limit. Share a Google Drive link instead.");
  }

  // Authorize milestone-proof uploads: only a party to the deal may upload,
  // because Step 5 below DELETES prior proof for the milestone — otherwise any
  // wallet could wipe/replace a counterparty's proof. Skipped for the
  // "standalone" bucket and chat attachments (not milestone proof).
  if (dealId !== "standalone" && !isChatAttachment) {
    const { data: dealRow } = await supabase
      .from(table("deals"))
      .select("buyer_wallet, seller_wallet")
      .eq("deal_id", dealId)
      .maybeSingle();
    if (!dealRow) throw new HttpError(404, "Deal not found");
    if (dealRow.buyer_wallet !== walletHeader && dealRow.seller_wallet !== walletHeader) {
      throw new HttpError(403, "Only a party to this deal can upload proof");
    }
  }

  const arrayBuffer = await file.arrayBuffer();
  let buf = Buffer.from(arrayBuffer as ArrayBuffer);

  // Step 1: Content validation (magic bytes / declared extension)
  const detected = detectType(buf, file.name);
  if (!detected) {
    throw new HttpError(
      415,
      "File type not allowed. Accepted: images (PNG, JPG), PDF, DOCX, PPTX, XLSX, MD. (No zip/exe.)"
    );
  }
  // Chat attachments are images only.
  if (isChatAttachment && detected.mime !== "image/png" && detected.mime !== "image/jpeg") {
    throw new HttpError(415, "Chat attachments must be a PNG or JPG image.");
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

  // Step 3: Validate PDF is parseable.
  // pdf-parse v2 exports a PDFParse CLASS (v1's callable default is gone) —
  // calling the module directly always threw, so every PDF was rejected with
  // "PDF could not be validated".
  if (detected.mime === "application/pdf") {
    let parser: { getText: () => Promise<unknown>; destroy: () => Promise<void> } | null = null;
    try {
      const { PDFParse } = (await import("pdf-parse")) as unknown as {
        PDFParse: new (opts: { data: Uint8Array }) => {
          getText: () => Promise<unknown>;
          destroy: () => Promise<void>;
        };
      };
      parser = new PDFParse({ data: new Uint8Array(buf) });
      await parser.getText();
    } catch (err) {
      console.error("[upload] PDF validation failed:", err);
      throw new HttpError(422, "PDF could not be validated");
    } finally {
      try { await parser?.destroy(); } catch { /* best-effort cleanup */ }
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

  // Chat attachment: stored, but not proof — return the key (the client fetches
  // a signed URL to display it) without touching sealed_deliverables.
  if (isChatAttachment) {
    return json({
      original_name: file.name,
      file_type: detected.mime,
      size_bytes: buf.length,
      storage_key: storagePath,
    });
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

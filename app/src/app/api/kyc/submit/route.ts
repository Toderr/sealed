import { NextRequest } from "next/server";
import { supabase, table } from "@/lib/supabase";
import { randomUUID } from "crypto";

const MAGIC_PDF = [0x25, 0x50, 0x44, 0x46];
const MAGIC_JPG = [0xff, 0xd8, 0xff];
const MAGIC_PNG = [0x89, 0x50, 0x4e, 0x47];

function isAllowedKycFile(buf: Buffer): boolean {
  const checks = [MAGIC_PDF, MAGIC_JPG, MAGIC_PNG];
  return checks.some((magic) => magic.every((b, i) => buf[i] === b));
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { wallet, documentBase64, mimeType } = body;

  if (!wallet || !documentBase64) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const buf = Buffer.from(documentBase64, "base64");

  if (!isAllowedKycFile(buf)) {
    return Response.json(
      { error: "Only PDF, JPG, or PNG documents accepted for KYC" },
      { status: 415 }
    );
  }

  if (buf.length > 10 * 1024 * 1024) {
    return Response.json({ error: "File exceeds 10 MB" }, { status: 413 });
  }

  const uuid = randomUUID();
  const storagePath = `kyc/${wallet}/${uuid}`;
  const blob = new Blob([buf], { type: mimeType ?? "application/octet-stream" });

  const { error: storageError } = await supabase.storage
    .from("sealed-kyc")
    .upload(storagePath, blob);

  if (storageError) {
    return Response.json({ error: "Storage failed" }, { status: 500 });
  }

  await supabase
    .from(table("users"))
    .update({
      kyc_status: "pending",
      kyc_document_url: storagePath,
      kyc_submitted_at: new Date().toISOString(),
    })
    .eq("wallet", wallet);

  return Response.json({ status: "pending" });
}

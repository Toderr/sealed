import { supabase, table } from "@/lib/supabase";
import { getWallet } from "@/lib/auth";
import { HttpError, json, withRoute } from "@/lib/api-error";
import { randomUUID } from "crypto";

const MAGIC_PDF = [0x25, 0x50, 0x44, 0x46];
const MAGIC_JPG = [0xff, 0xd8, 0xff];
const MAGIC_PNG = [0x89, 0x50, 0x4e, 0x47];

function isAllowedKycFile(buf: Buffer): boolean {
  const checks = [MAGIC_PDF, MAGIC_JPG, MAGIC_PNG];
  return checks.some((magic) => magic.every((b, i) => buf[i] === b));
}

export const POST = withRoute(async (request) => {
  const callerWallet = getWallet(request);
  const body = await request.json();
  const { wallet, documentBase64, mimeType } = body;

  if (!wallet || !documentBase64) {
    throw new HttpError(400, "Missing required fields");
  }

  if (!callerWallet || callerWallet !== wallet) {
    throw new HttpError(403, "Unauthorized");
  }

  const buf = Buffer.from(documentBase64, "base64");

  if (!isAllowedKycFile(buf)) {
    throw new HttpError(415, "Only PDF, JPG, or PNG documents accepted for KYC");
  }

  if (buf.length > 10 * 1024 * 1024) {
    throw new HttpError(413, "File exceeds 10 MB");
  }

  const uuid = randomUUID();
  const storagePath = `kyc/${wallet}/${uuid}`;
  const blob = new Blob([buf], { type: mimeType ?? "application/octet-stream" });

  const { error: storageError } = await supabase.storage
    .from("sealed-kyc")
    .upload(storagePath, blob);

  if (storageError) {
    throw new HttpError(500, "Storage failed");
  }

  await supabase
    .from(table("users"))
    .update({
      kyc_status: "pending",
      kyc_document_url: storagePath,
      kyc_submitted_at: new Date().toISOString(),
    })
    .eq("wallet", wallet);

  return json({ status: "pending" });
});

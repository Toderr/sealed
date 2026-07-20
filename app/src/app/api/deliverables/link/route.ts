import { supabase, table } from "@/lib/supabase";
import { requireWallet } from "@/lib/auth";
import { HttpError, json, requireString, withRoute } from "@/lib/api-error";

// Link/text milestone proof. The counterpart to /api/upload for the case where
// the deliverable is a URL (a repo, a Figma link, a live site) or a short block
// of text rather than a file. No bytes are stored in Supabase Storage.
//
// sealed_deliverables has no dedicated URL column, so the link/text value is
// carried in existing columns that the read route (GET /api/deliverables) and
// the deal page already select + render:
//   - content_type: "text/uri-list" (URL) or "text/plain" (text) — the client
//     keys off this to render a link/snippet instead of a file-open button.
//   - filename:    the display label (the URL, or a snippet of the text).
//   - storage_key: the full URL/text value. NOT NULL in the schema and already
//     round-tripped by the read route, so it's the natural home for the body.
// A dedicated `link_url` / `body_text` column would be cleaner (see report), but
// this keeps proofs working without a migration.
export const runtime = "nodejs";

const MAX_TEXT = 4000; // sanity cap on inline text proof
const SNIPPET_LEN = 120; // filename label length for text proof

export const POST = withRoute(async (request) => {
  const wallet = requireWallet(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }

  const { deal_id, milestone_index, url, text } = (body ?? {}) as {
    deal_id?: unknown;
    milestone_index?: unknown;
    url?: unknown;
    text?: unknown;
  };

  const dealId = requireString(deal_id, "deal_id");
  const milestoneIndex =
    typeof milestone_index === "number"
      ? milestone_index
      : parseInt(String(milestone_index ?? ""), 10);
  if (!Number.isInteger(milestoneIndex) || milestoneIndex < 0) {
    throw new HttpError(400, "Missing or invalid milestone_index");
  }

  // Authorize: only a party to the deal may submit proof — this route DELETES
  // prior proof for the milestone before inserting, so an unauthorized caller
  // could otherwise wipe the counterparty's proof. (The x-wallet header is still
  // unsigned/spoofable — the platform-wide SIWS cutover is the real fix — but at
  // least gate on deal membership here.)
  const { data: dealRow } = await supabase
    .from(table("deals"))
    .select("buyer_wallet, seller_wallet")
    .eq("deal_id", dealId)
    .maybeSingle();
  if (!dealRow) throw new HttpError(404, "Deal not found");
  if (dealRow.buyer_wallet !== wallet && dealRow.seller_wallet !== wallet) {
    throw new HttpError(403, "Only a party to this deal can submit proof");
  }

  const rawUrl = typeof url === "string" ? url.trim() : "";
  const rawText = typeof text === "string" ? text.trim() : "";
  if (!rawUrl && !rawText) {
    throw new HttpError(400, "Provide a url or text");
  }

  let contentType: string;
  let filename: string;
  let value: string;

  if (rawUrl) {
    // Only allow http/https links.
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new HttpError(400, "Invalid URL");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new HttpError(400, "URL must be http or https");
    }
    contentType = "text/uri-list";
    value = parsed.toString();
    filename = value;
  } else {
    if (rawText.length > MAX_TEXT) {
      throw new HttpError(413, `Text proof exceeds ${MAX_TEXT} characters`);
    }
    contentType = "text/plain";
    value = rawText;
    filename =
      rawText.length > SNIPPET_LEN ? `${rawText.slice(0, SNIPPET_LEN)}…` : rawText;
  }

  // Replace any prior proof for this deal + milestone (mirrors the upload route)
  // so a new submission supersedes the old one. Remove file-backed storage
  // objects first (link rows have no real storage object, so those keys are
  // skipped by Supabase), then delete the rows. Best-effort — non-fatal.
  const { data: prior } = await supabase
    .from(table("deliverables"))
    .select("id, storage_key, content_type")
    .eq("deal_id", dealId)
    .eq("milestone_index", milestoneIndex);
  if (prior && prior.length > 0) {
    const fileKeys = prior
      .filter(
        (d) =>
          d.content_type !== "text/uri-list" && d.content_type !== "text/plain"
      )
      .map((d) => d.storage_key)
      .filter(Boolean);
    if (fileKeys.length > 0) {
      await supabase.storage.from("sealed-docs").remove(fileKeys);
    }
    await supabase
      .from(table("deliverables"))
      .delete()
      .eq("deal_id", dealId)
      .eq("milestone_index", milestoneIndex);
  }

  const { data: record, error: dbError } = await supabase
    .from(table("deliverables"))
    .insert({
      deal_id: dealId,
      milestone_index: milestoneIndex,
      submitter_wallet: wallet,
      storage_key: value,
      filename,
      content_type: contentType,
      size_bytes: value.length,
      scan_status: "clean",
    })
    .select()
    .single();

  if (dbError) {
    console.error("[deliverables/link] db error", dbError);
    throw new HttpError(500, "Failed to record link proof");
  }

  return json({
    id: (record as { id: string }).id,
    kind: rawUrl ? "url" : "text",
    filename,
    content_type: contentType,
    value,
  });
});

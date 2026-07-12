import { NextRequest } from "next/server";
import { runNegotiation } from "@/negotiation/engine";
import { friendlyLlmError } from "@/lib/llm-dispatch";
import { HttpError, json, withRoute } from "@/lib/api-error";
import {
  type NegotiateRequest,
  prepareNegotiation,
  persistNegotiationTurns,
  validateNegotiateBody,
} from "./_shared";

// Non-streaming negotiation: runs the whole multi-round negotiation server-side
// and returns the final proposal. Kept for callers that want a single response;
// the negotiation room uses /api/negotiate/stream for live per-round updates.
export const POST = withRoute(async (request: NextRequest) => {
  try {
    const body = validateNegotiateBody((await request.json()) as NegotiateRequest);
    const { params, buyerCallLlm, sellerCallLlm } = await prepareNegotiation(request, body);

    const proposal = await runNegotiation(params, buyerCallLlm, sellerCallLlm);

    // Persist each agent turn to the chat so users can SEE the exchange (bug #11).
    await persistNegotiationTurns(body.proposalId, body.buyerWallet, proposal);

    return json({ proposal });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    // Log the real error server-side; return a clean user-facing message so the
    // client shows its "Negotiation failed — Try again" state (bugs #11/#12).
    console.error("[negotiate] negotiation failed:", err);
    throw new HttpError(502, friendlyLlmError(err));
  }
});

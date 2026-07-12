import { NextRequest } from "next/server";
import { runNegotiation } from "@/negotiation/engine";
import { friendlyLlmError } from "@/lib/llm-dispatch";
import { HttpError } from "@/lib/api-error";
import type { Revision } from "@/negotiation/types";
import {
  type NegotiateRequest,
  prepareNegotiation,
  persistNegotiationTurns,
  validateNegotiateBody,
} from "../_shared";

// Streaming negotiation (T-2). Runs the same multi-round negotiation but emits
// each revision as a Server-Sent Event the instant it's produced, so the room
// shows the back-and-forth appearing turn by turn instead of one long spinner.
//
// Events (each a JSON line):
//   { type: "revision", revision }   — one per round (incl. the round-0 seed)
//   { type: "done", proposal }       — final proposal, terminal
//   { type: "error", message }       — clean user-facing failure, terminal
//
// This route returns a raw Response (not withRoute's JSON envelope) because the
// body is a stream. Validation/setup errors before the stream opens are sent as
// a single error event so the client's one code path handles everything.
export async function POST(request: NextRequest): Promise<Response> {
  const encoder = new TextEncoder();

  let body: NegotiateRequest;
  try {
    body = validateNegotiateBody((await request.json()) as NegotiateRequest);
  } catch (err) {
    return errorStream(encoder, err);
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        const { params, buyerCallLlm, sellerCallLlm } = await prepareNegotiation(request, body);

        const proposal = await runNegotiation(
          params,
          buyerCallLlm,
          sellerCallLlm,
          (revision: Revision) => send({ type: "revision", revision }),
        );

        await persistNegotiationTurns(body.proposalId, body.buyerWallet, proposal);
        send({ type: "done", proposal });
      } catch (err) {
        if (err instanceof HttpError) {
          send({ type: "error", message: err.message });
        } else {
          console.error("[negotiate/stream] negotiation failed:", err);
          send({ type: "error", message: friendlyLlmError(err) });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable proxy buffering so events flush live
    },
  });
}

// A one-shot SSE stream that emits a single error event, for failures before the
// main stream opens (e.g. a bad request body).
function errorStream(encoder: TextEncoder, err: unknown): Response {
  const message = err instanceof HttpError ? err.message : "Invalid request";
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "error", message })}\n\n`),
      );
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" },
  });
}

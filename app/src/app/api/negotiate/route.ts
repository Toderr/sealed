import { NextRequest } from "next/server";
import { runNegotiation } from "@/negotiation/engine";
import { defaultSellerBoundaries } from "@/negotiation/types";
import type { Proposal } from "@/negotiation/types";
import type { DealParams } from "@/lib/types";
import type { NegotiationBoundaries, NegotiationStyle } from "@/memory/types";
import { dispatchLlm, getLlmOptsFromEnv, getLlmOptsFromRequest, friendlyLlmError } from "@/lib/llm-dispatch";
import { supabase, table } from "@/lib/supabase";
import { HttpError, json, withRoute } from "@/lib/api-error";

interface NegotiateRequest {
  proposalId: string;
  buyerWallet: string;
  initialTerms: DealParams;
  buyerBoundaries: NegotiationBoundaries;
  sellerBoundaries?: NegotiationBoundaries;
  renegotiationRequest?: string;
  overrideInstructions?: string;
}

type LlmOpts = { provider: string; model: string; apiKey: string };

function llmLabel(opts: LlmOpts) {
  return `${opts.provider}:${opts.model}`;
}

function sameLlm(a: LlmOpts, b: LlmOpts) {
  return a.provider === b.provider && a.model === b.model && a.apiKey === b.apiKey;
}

function isOpenRouterFreeModel(opts: LlmOpts | null) {
  return opts?.provider === "openrouter" && /:free$/i.test(opts.model);
}

function selectSellerLlm(
  buyerLlm: LlmOpts,
  serverLlm: LlmOpts | null
): { opts: LlmOpts; source: "buyer" | "server" } {
  if (!serverLlm) return { opts: buyerLlm, source: "buyer" };

  // Free OpenRouter models are useful for demos but unstable for production
  // negotiation. If the buyer supplied a real provider such as OpenAI, use it
  // for the simulated seller too instead of failing the seller turn.
  if (isOpenRouterFreeModel(serverLlm) && !isOpenRouterFreeModel(buyerLlm)) {
    return { opts: buyerLlm, source: "buyer" };
  }

  return { opts: serverLlm, source: "server" };
}

function isRateLimitedNegotiationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /429|rate.?limit|temporarily rate-limited|quota/i.test(message);
}

// Persist the agent-to-agent negotiation turns into the deal chat (bug #11) so
// the exchange is visible in the conversation box, not hidden behind a spinner.
// Idempotent-ish: tagged with the proposalId so re-runs don't double up the same
// round. Best-effort — a logging failure must not break the negotiation.
async function persistNegotiationTurns(
  proposalId: string,
  buyerWallet: string,
  proposal: Proposal
) {
  try {
    const dealId = proposal.initialTerms.dealId;
    if (!dealId) return;

    // Skip if we've already logged this proposal's turns (avoid duplicates on
    // client retry / double POST).
    const { data: already } = await supabase
      .from(table("messages"))
      .select("id")
      .eq("deal_id", dealId)
      .contains("metadata", { proposalId })
      .limit(1);
    if (already && already.length > 0) return;

    const rows = proposal.revisions
      // The round-0 seed isn't an agent turn; skip it.
      .filter((r) => r.action !== "open")
      .map((r) => {
        const who = r.onBehalfOf === "buyer" ? "Buyer's agent" : "Seller's agent";
        const verb =
          r.action === "accept" ? "accepted" : r.action === "reject" ? "declined" : "proposed";
        return {
          deal_id: dealId,
          role: "assistant",
          content: `**${who}** ${verb}: ${r.reasoning}`,
          wallet: buyerWallet,
          metadata: { proposalId, agentTurn: true, onBehalfOf: r.onBehalfOf, round: r.round },
        };
      });

    if (rows.length > 0) {
      await supabase.from(table("messages")).insert(rows);
    }
  } catch (err) {
    console.error("[negotiate] failed to persist agent turns:", err);
  }
}

export const POST = withRoute(async (request: NextRequest) => {
  let body: NegotiateRequest | null = null;

  try {
    body = (await request.json()) as NegotiateRequest;
    if (
      !body?.proposalId ||
      !body?.buyerWallet ||
      !body?.initialTerms ||
      !body?.buyerBoundaries
    ) {
      throw new HttpError(400, "Missing required fields");
    }

    // Apply buyer's saved persona to their negotiation boundaries
    const { data: templates } = await supabase
      .from(table("agent_templates"))
      .select("style_index, price_floor, escalate_after")
      .eq("wallet", body.buyerWallet)
      .limit(1);
    if (templates && templates.length > 0) {
      const p = templates[0];
      const styleMap: NegotiationStyle[] = ["conservative", "balanced", "balanced"];
      body.buyerBoundaries = {
        ...body.buyerBoundaries,
        negotiationStyle: styleMap[p.style_index ?? 1],
        maxPriceDecrease: 100 - (p.price_floor ?? 80),
        maxNegotiationRounds: p.escalate_after ?? body.buyerBoundaries.maxNegotiationRounds,
      };
    }

    // Buyer's agent uses their own LLM config (from client headers)
    const buyerLlm = getLlmOptsFromRequest(request);
    if (!buyerLlm) {
      throw new HttpError(500, "No LLM provider configured");
    }

    const serverLlm = getLlmOptsFromEnv();
    const sellerLlm = selectSellerLlm(buyerLlm, serverLlm);
    console.info("[negotiate] LLM routing", {
      buyer: llmLabel(buyerLlm),
      seller: llmLabel(sellerLlm.opts),
      sellerSource: sellerLlm.source,
    });

    const renegotiationRequest =
      typeof body.renegotiationRequest === "string"
        ? body.renegotiationRequest.trim()
        : typeof body.overrideInstructions === "string"
        ? body.overrideInstructions.trim()
        : "";

    // 1600 (up from 1024) so the summarizer's JSON isn't truncated — a truncated
    // summary fails to parse and forces the engine's "renegotiate" fallback even
    // when the agents actually agreed (bug #11).
    const buyerCallLlm = (system: string, user: string) =>
      dispatchLlm({ ...buyerLlm, system, messages: [{ role: "user", content: user }], maxTokens: 1600 });

    const sellerCallLlm = async (system: string, user: string) => {
      try {
        return await dispatchLlm({
          ...sellerLlm.opts,
          system,
          messages: [{ role: "user", content: user }],
          maxTokens: 1024,
        });
      } catch (error) {
        if (isRateLimitedNegotiationError(error) && !sameLlm(sellerLlm.opts, buyerLlm)) {
          console.warn("[negotiate] Seller LLM rate-limited; retrying seller turn with buyer LLM", {
            failedSeller: llmLabel(sellerLlm.opts),
            fallback: llmLabel(buyerLlm),
          });
          return dispatchLlm({
            ...buyerLlm,
            system,
            messages: [{ role: "user", content: user }],
            maxTokens: 1024,
          });
        }
        throw error;
      }
    };

    const proposal = await runNegotiation(
      {
        proposalId: body.proposalId,
        buyerWallet: body.buyerWallet,
        sellerWallet: body.initialTerms.sellerWallet,
        initialTerms: body.initialTerms,
        buyerBoundaries: body.buyerBoundaries,
        sellerBoundaries: body.sellerBoundaries ?? defaultSellerBoundaries(),
        renegotiationRequest: renegotiationRequest || undefined,
      },
      buyerCallLlm,
      sellerCallLlm
    );

    // Persist each agent turn to the chat so users can actually SEE the
    // agent-to-agent negotiation in the conversation box, instead of a silent
    // jump straight to the result (bug #11). Best-effort — never fail the
    // negotiation on a logging write.
    await persistNegotiationTurns(body.proposalId, body.buyerWallet, proposal);

    return json({ proposal });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    // Log the real error (may contain raw provider JSON) server-side only. Return
    // a clean, user-facing message so the client shows its "Negotiation failed —
    // Try again" state (bug #12), rather than leaking raw provider errors or —
    // for a failed run — presenting a fake "renegotiate" recommendation that
    // reads as a dispute (bug #11).
    console.error("[negotiate] negotiation failed:", err);
    throw new HttpError(502, friendlyLlmError(err));
  }
});

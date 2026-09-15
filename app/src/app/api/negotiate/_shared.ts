// Shared negotiation setup used by the JSON route (route.ts) and the streaming
// route (stream/route.ts): apply the buyer's saved persona, resolve the buyer +
// seller LLM callers (own-key from headers, server env for the simulated
// seller, with rate-limit fallback), and persist the agent turns to chat.
import { NextRequest } from "next/server";
import { dispatchLlm, getLlmOptsFromEnv, getLlmOptsFromRequest } from "@/lib/llm-dispatch";
import { supabase, table } from "@/lib/supabase";
import { HttpError } from "@/lib/api-error";
import type { DealParams } from "@/lib/types";
import type { NegotiationBoundaries, NegotiationStyle } from "@/memory/types";
import type { Proposal } from "@/negotiation/types";
import { defaultSellerBoundaries } from "@/negotiation/types";
import type { LlmCaller } from "@/negotiation/engine";

export interface NegotiateRequest {
  proposalId: string;
  buyerWallet: string;
  initialTerms: DealParams;
  buyerBoundaries: NegotiationBoundaries;
  sellerBoundaries?: NegotiationBoundaries;
  renegotiationRequest?: string;
  overrideInstructions?: string;
}

type LlmOpts = { provider: string; model: string; apiKey: string };

const llmLabel = (o: LlmOpts) => `${o.provider}:${o.model}`;
const sameLlm = (a: LlmOpts, b: LlmOpts) =>
  a.provider === b.provider && a.model === b.model && a.apiKey === b.apiKey;
const isOpenRouterFreeModel = (o: LlmOpts | null) =>
  o?.provider === "openrouter" && /:free$/i.test(o.model);

function selectSellerLlm(
  buyerLlm: LlmOpts,
  serverLlm: LlmOpts | null
): { opts: LlmOpts; source: "buyer" | "server" } {
  if (!serverLlm) return { opts: buyerLlm, source: "buyer" };
  // Free OpenRouter models are demo-only; if the buyer supplied a real provider,
  // reuse it for the simulated seller rather than failing the seller turn.
  if (isOpenRouterFreeModel(serverLlm) && !isOpenRouterFreeModel(buyerLlm)) {
    return { opts: buyerLlm, source: "buyer" };
  }
  return { opts: serverLlm, source: "server" };
}

function isRateLimitedNegotiationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /429|rate.?limit|temporarily rate-limited|quota/i.test(message);
}

export interface PreparedNegotiation {
  params: {
    proposalId: string;
    buyerWallet: string;
    sellerWallet: string;
    initialTerms: DealParams;
    buyerBoundaries: NegotiationBoundaries;
    sellerBoundaries: NegotiationBoundaries;
    renegotiationRequest?: string;
  };
  buyerCallLlm: LlmCaller;
  sellerCallLlm: LlmCaller;
}

const PAYMENT_TERMS = new Set(["upfront_100", "upfront_50", "milestone_based", "net_7", "net_30"]);
const NEGOTIATION_STYLES = new Set(["conservative", "balanced", "aggressive"]);

function finiteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// Field-level check: an absent or non-finite maxNegotiationRounds previously
// passed the truthiness gate, making Math.min(..., NaN) run zero rounds.
function validateBoundaries(b: unknown, name: string): asserts b is NegotiationBoundaries {
  if (!b || typeof b !== "object") throw new HttpError(400, `Missing ${name}`);
  const o = b as Record<string, unknown>;
  for (const f of [
    "maxPriceIncrease", "maxPriceDecrease", "maxTimelineExtensionDays",
    "minMilestones", "maxMilestones", "maxFrontLoadPercent",
    "autoApproveBelowUsdc", "requireApprovalAboveUsdc", "maxNegotiationRounds",
  ]) {
    if (!finiteNumber(o[f])) throw new HttpError(400, `Invalid ${name}.${f}`);
  }
  if (!Array.isArray(o.acceptedPaymentTerms) || !o.acceptedPaymentTerms.every((t) => typeof t === "string" && PAYMENT_TERMS.has(t))) {
    throw new HttpError(400, `Invalid ${name}.acceptedPaymentTerms`);
  }
  if (!Array.isArray(o.redLines) || !o.redLines.every((t) => typeof t === "string")) {
    throw new HttpError(400, `Invalid ${name}.redLines`);
  }
  if (typeof o.negotiationStyle !== "string" || !NEGOTIATION_STYLES.has(o.negotiationStyle)) {
    throw new HttpError(400, `Invalid ${name}.negotiationStyle`);
  }
  const n = o as unknown as NegotiationBoundaries;
  if (n.minMilestones < 1 || n.maxMilestones < n.minMilestones || n.maxNegotiationRounds < 1) {
    throw new HttpError(400, `Impossible ${name}: check milestone/round bounds`);
  }
}

function validateDealParams(t: unknown): asserts t is DealParams {
  if (!t || typeof t !== "object") throw new HttpError(400, "Missing initialTerms");
  const o = t as Record<string, unknown>;
  if (typeof o.dealId !== "string" || !o.dealId) throw new HttpError(400, "Invalid initialTerms.dealId");
  if (typeof o.sellerWallet !== "string") throw new HttpError(400, "Invalid initialTerms.sellerWallet");
  if (!finiteNumber(o.totalAmount) || o.totalAmount <= 0) throw new HttpError(400, "Invalid initialTerms.totalAmount");
  if (!Array.isArray(o.milestones) || o.milestones.length === 0) {
    throw new HttpError(400, "initialTerms.milestones must be a non-empty array");
  }
  for (const m of o.milestones) {
    const ms = m as Record<string, unknown>;
    if (!ms || typeof ms !== "object" || typeof ms.description !== "string" || !finiteNumber(ms.amount) || ms.amount <= 0) {
      throw new HttpError(400, "Invalid initialTerms.milestones entry");
    }
  }
}

// Field-level validation — presence-only checks let `{}` boundaries through,
// which turned maxNegotiationRounds NaN and ran zero negotiation rounds.
export function validateNegotiateBody(body: unknown): NegotiateRequest {
  if (!body || typeof body !== "object") throw new HttpError(400, "Missing request body");
  const o = body as Record<string, unknown>;
  if (typeof o.proposalId !== "string" || !o.proposalId) throw new HttpError(400, "Invalid proposalId");
  if (typeof o.buyerWallet !== "string" || !o.buyerWallet) throw new HttpError(400, "Invalid buyerWallet");
  validateDealParams(o.initialTerms);
  validateBoundaries(o.buyerBoundaries, "buyerBoundaries");
  if (o.sellerBoundaries !== undefined) validateBoundaries(o.sellerBoundaries, "sellerBoundaries");
  for (const f of ["renegotiationRequest", "overrideInstructions"]) {
    if (o[f] !== undefined && typeof o[f] !== "string") throw new HttpError(400, `Invalid ${f}`);
  }
  return o as unknown as NegotiateRequest;
}

// Apply the buyer's saved persona + resolve the LLM callers. Mutates a copy of
// buyerBoundaries; never the caller's object.
export async function prepareNegotiation(
  request: NextRequest,
  body: NegotiateRequest,
): Promise<PreparedNegotiation> {
  let buyerBoundaries = body.buyerBoundaries;

  const { data: templates } = await supabase
    .from(table("agent_templates"))
    .select("negotiation_style, price_floor_pct, escalate_after_rounds")
    .eq("wallet", body.buyerWallet)
    .eq("active", true)
    .limit(1);
  if (templates && templates.length > 0) {
    const p = templates[0];
    // Schema styles: firm/flexible/collaborative → engine NegotiationStyle.
    const styleMap: Record<string, NegotiationStyle> = {
      firm: "conservative",
      flexible: "balanced",
      collaborative: "aggressive",
    };
    buyerBoundaries = {
      ...buyerBoundaries,
      negotiationStyle: styleMap[p.negotiation_style ?? ""] ?? buyerBoundaries.negotiationStyle,
      maxPriceDecrease: 100 - (p.price_floor_pct ?? 80),
      maxNegotiationRounds: p.escalate_after_rounds ?? buyerBoundaries.maxNegotiationRounds,
    };
  }

  const buyerLlm = getLlmOptsFromRequest(request);
  if (!buyerLlm) throw new HttpError(500, "No LLM provider configured");

  const serverLlm = getLlmOptsFromEnv();
  const sellerLlm = selectSellerLlm(buyerLlm, serverLlm);
  console.info("[negotiate] LLM routing", {
    buyer: llmLabel(buyerLlm),
    seller: llmLabel(sellerLlm.opts),
    sellerSource: sellerLlm.source,
  });

  // 1600 tokens so the summarizer's JSON isn't truncated (bug #11).
  const buyerCallLlm: LlmCaller = (system, user) =>
    dispatchLlm({ ...buyerLlm, system, messages: [{ role: "user", content: user }], maxTokens: 1600 });

  const sellerCallLlm: LlmCaller = async (system, user) => {
    try {
      return await dispatchLlm({
        ...sellerLlm.opts,
        system,
        messages: [{ role: "user", content: user }],
        maxTokens: 1024,
      });
    } catch (error) {
      if (isRateLimitedNegotiationError(error) && !sameLlm(sellerLlm.opts, buyerLlm)) {
        console.warn("[negotiate] Seller LLM rate-limited; retrying with buyer LLM", {
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

  return {
    params: {
      proposalId: body.proposalId,
      buyerWallet: body.buyerWallet,
      sellerWallet: body.initialTerms.sellerWallet,
      initialTerms: body.initialTerms,
      buyerBoundaries,
      sellerBoundaries: body.sellerBoundaries ?? defaultSellerBoundaries(),
      renegotiationRequest:
        (typeof body.renegotiationRequest === "string" ? body.renegotiationRequest.trim() : "") ||
        (typeof body.overrideInstructions === "string" ? body.overrideInstructions.trim() : "") ||
        undefined,
    },
    buyerCallLlm,
    sellerCallLlm,
  };
}

// Persist the agent-to-agent negotiation turns into the deal chat (bug #11).
// Idempotent-ish via the proposalId tag. Best-effort — never throws.
export async function persistNegotiationTurns(
  proposalId: string,
  buyerWallet: string,
  proposal: Proposal,
): Promise<void> {
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

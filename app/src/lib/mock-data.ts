"use client";

// Fully-offline data layer for MOCK_DATA mode.
//
// Installs a fetch() interceptor that serves the core /api/* deal-flow endpoints
// from localStorage instead of hitting Next API routes / Supabase. Only the
// endpoints needed for the manual deal lifecycle are mocked; everything else
// falls through to the real fetch (and harmlessly fails offline / is unused).
//
// Stores (all localStorage):
//   mock:data:deals       Record<deal_id, MirrorDeal>
//   mock:data:messages    Record<deal_id, Message[]>
//   mock:data:ratings     Record<`${deal_id}:${rater}`, Rating>
//   mock:data:profiles    Record<wallet, PublicProfile-ish>

import { MOCK_DATA } from "./env";

type MirrorMilestone = { description: string; amount: number; status?: string };
type MirrorDeal = {
  deal_id: string;
  buyer_wallet: string;
  seller_wallet: string | null;
  title: string;
  description: string | null;
  total_amount_usdc: number;
  milestones: MirrorMilestone[];
  status: string;
  created_at: string;
  updated_at?: string;
};
type Message = {
  id: string;
  deal_id: string;
  role: string;
  content: string;
  wallet: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};
type Rating = {
  id: string;
  deal_id: string;
  rater_wallet: string;
  ratee_wallet: string;
  stars: number;
  review_text: string;
  revealed: boolean;
  submitted_at: string;
};

const K = {
  deals: "mock:data:deals",
  messages: "mock:data:messages",
  ratings: "mock:data:ratings",
  profiles: "mock:data:profiles",
};

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* best-effort */
  }
}
function uuid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}
function nowIso(): string {
  return new Date().toISOString();
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Store accessors (also used directly by the manual deal form) ──────────────

export const mockData = {
  allDeals(): MirrorDeal[] {
    return Object.values(read<Record<string, MirrorDeal>>(K.deals, {}));
  },
  getDeal(dealId: string): MirrorDeal | undefined {
    return read<Record<string, MirrorDeal>>(K.deals, {})[dealId];
  },
  putDeal(deal: MirrorDeal): void {
    const all = read<Record<string, MirrorDeal>>(K.deals, {});
    all[deal.deal_id] = deal;
    write(K.deals, all);
  },
  dealsFor(wallet: string): MirrorDeal[] {
    return this.allDeals().filter(
      (d) => d.buyer_wallet === wallet || d.seller_wallet === wallet
    );
  },
  messagesFor(dealId: string): Message[] {
    return read<Record<string, Message[]>>(K.messages, {})[dealId] ?? [];
  },
  addMessage(m: Omit<Message, "id" | "created_at">): Message {
    const all = read<Record<string, Message[]>>(K.messages, {});
    const msg: Message = { ...m, id: uuid(), created_at: nowIso() };
    all[m.deal_id] = [...(all[m.deal_id] ?? []), msg];
    write(K.messages, all);
    return msg;
  },
  ratingFor(dealId: string, rater: string): Rating | null {
    return read<Record<string, Rating>>(K.ratings, {})[`${dealId}:${rater}`] ?? null;
  },
  addRating(r: Omit<Rating, "id" | "submitted_at" | "revealed">): Rating {
    const all = read<Record<string, Rating>>(K.ratings, {});
    const rating: Rating = { ...r, id: uuid(), revealed: true, submitted_at: nowIso() };
    all[`${r.deal_id}:${r.rater_wallet}`] = rating;
    write(K.ratings, all);
    return rating;
  },
};

// ── Helpers mirroring the real route logic ────────────────────────────────────

function isCompleted(deal: MirrorDeal): boolean {
  if (deal.status?.toLowerCase() === "completed") return true;
  return (
    deal.milestones.length > 0 &&
    deal.milestones.every((m) => m.status === "Released" || m.status === "Completed")
  );
}
function counterparty(deal: MirrorDeal, wallet: string): string | null {
  if (!deal.seller_wallet) return null;
  if (deal.buyer_wallet === wallet) return deal.seller_wallet;
  if (deal.seller_wallet === wallet) return deal.buyer_wallet;
  return null;
}

// ── The interceptor ───────────────────────────────────────────────────────────

async function handle(
  url: URL,
  method: string,
  headers: Headers,
  body: unknown
): Promise<Response | null> {
  const path = url.pathname;
  const wallet = headers.get("x-wallet");
  const params = url.searchParams;

  // GET/POST /api/deals/mirror
  if (path === "/api/deals/mirror") {
    if (method === "GET") {
      if (!wallet) return json({ error: "Missing x-wallet header" }, 401);
      return json({ deals: mockData.dealsFor(wallet) });
    }
    if (method === "POST") {
      const b = (body ?? {}) as Partial<MirrorDeal> & { tx_signature?: string };
      if (!b.deal_id || !b.title) return json({ error: "deal_id, title required" }, 400);
      const existing = mockData.getDeal(b.deal_id);
      const deal: MirrorDeal = {
        deal_id: b.deal_id,
        buyer_wallet: existing?.buyer_wallet ?? wallet ?? "",
        seller_wallet: b.seller_wallet ?? existing?.seller_wallet ?? null,
        title: b.title,
        description: b.description ?? null,
        total_amount_usdc: b.total_amount_usdc ?? existing?.total_amount_usdc ?? 0,
        milestones: b.milestones ?? existing?.milestones ?? [],
        status: b.status ?? existing?.status ?? "draft",
        created_at: existing?.created_at ?? nowIso(),
        updated_at: nowIso(),
      };
      mockData.putDeal(deal);
      return json({ ok: true, deal });
    }
  }

  // GET/PATCH /api/deals/:dealId
  const dealMatch = path.match(/^\/api\/deals\/([^/]+)$/);
  if (dealMatch && dealMatch[1] !== "mirror") {
    const dealId = decodeURIComponent(dealMatch[1]);
    const deal = mockData.getDeal(dealId);
    if (method === "GET") {
      if (!deal) return json({ error: "Deal not found" }, 404);
      return json({ deal });
    }
    if (method === "PATCH") {
      if (!deal) return json({ error: "Deal not found" }, 404);
      const b = (body ?? {}) as Partial<MirrorDeal>;
      const next: MirrorDeal = {
        ...deal,
        ...(b.seller_wallet !== undefined ? { seller_wallet: b.seller_wallet } : {}),
        ...(b.status !== undefined ? { status: b.status } : {}),
        ...(b.title !== undefined ? { title: b.title } : {}),
        ...(b.description !== undefined ? { description: b.description } : {}),
        ...(b.total_amount_usdc !== undefined
          ? { total_amount_usdc: b.total_amount_usdc }
          : {}),
        ...(b.milestones !== undefined ? { milestones: b.milestones } : {}),
        updated_at: nowIso(),
      };
      if (isCompleted(next)) next.status = "completed";
      mockData.putDeal(next);
      return json({ deal: next });
    }
  }

  // GET/POST /api/messages
  if (path === "/api/messages") {
    if (method === "GET") {
      const dealId = params.get("deal_id");
      if (!dealId) return json({ error: "Missing deal_id" }, 400);
      return json({ messages: mockData.messagesFor(dealId) });
    }
    if (method === "POST") {
      const b = (body ?? {}) as Partial<Message>;
      if (!b.deal_id) return json({ error: "Missing deal_id" }, 400);
      const msg = mockData.addMessage({
        deal_id: b.deal_id,
        role: b.role ?? "system",
        content: b.content ?? "",
        wallet: b.wallet ?? wallet ?? null,
        metadata: b.metadata ?? null,
      });
      return json({ message: msg });
    }
  }

  // GET/POST /api/ratings
  if (path === "/api/ratings") {
    if (method === "GET") {
      if (!wallet) return json({ error: "Missing x-wallet header" }, 401);
      const dealId = params.get("deal_id");
      if (!dealId) return json({ error: "Missing deal_id" }, 400);
      const deal = mockData.getDeal(dealId);
      if (!deal) return json({ error: "Deal not found" }, 404);
      const ratee = counterparty(deal, wallet);
      const existing = mockData.ratingFor(dealId, wallet);
      return json({
        rating: existing,
        canRate: isCompleted(deal) && !existing,
        ratee_wallet: ratee,
      });
    }
    if (method === "POST") {
      if (!wallet) return json({ error: "Missing x-wallet header" }, 401);
      const b = (body ?? {}) as {
        deal_id?: string;
        ratee_wallet?: string;
        stars?: number;
        review_text?: string;
      };
      if (!b.deal_id || !b.ratee_wallet || !b.stars) {
        return json({ error: "Missing required fields" }, 400);
      }
      const rating = mockData.addRating({
        deal_id: b.deal_id,
        rater_wallet: wallet,
        ratee_wallet: b.ratee_wallet,
        stars: b.stars,
        review_text: (b.review_text ?? "").slice(0, 500),
      });
      return json({ ok: true, id: rating.id, revealed: true });
    }
  }

  // GET /api/notifications — synthesized as empty offline
  if (path === "/api/notifications" && method === "GET") {
    return json({ notifications: [] });
  }

  // GET /api/deliverables — empty offline (uploads are mocked separately)
  if (path === "/api/deliverables" && method === "GET") {
    return json({ deliverables: [] });
  }

  // POST /api/upload — pretend the file was stored
  if (path === "/api/upload" && method === "POST") {
    return json({
      id: uuid(),
      original_name: "offline-proof",
      file_type: "application/octet-stream",
      size_bytes: 0,
      storage_key: `offline/${uuid()}`,
    });
  }
  // GET /api/upload/signed — no real file; return a placeholder
  if (path === "/api/upload/signed" && method === "GET") {
    return json({ url: "" });
  }

  // POST /api/notify/process — no-op offline
  if (path === "/api/notify/process" && method === "POST") {
    return json({ ok: true });
  }

  // GET /api/users/:wallet/public — synthesize a minimal profile from storage
  const pubMatch = path.match(/^\/api\/users\/([^/]+)\/public$/);
  if (pubMatch && method === "GET") {
    const w = decodeURIComponent(pubMatch[1]);
    const profiles = read<Record<string, Record<string, unknown>>>(K.profiles, {});
    const p = profiles[w] ?? {};
    const deals = mockData.dealsFor(w);
    return json({
      handle: p.handle ?? null,
      display_name: p.display_name ?? null,
      avatar_url: p.avatar_url ?? null,
      bio: p.bio ?? null,
      is_verified: false,
      deals_total: deals.length,
      deals_successful: deals.filter(isCompleted).length,
      avg_rating: 0,
      member_since: (p.member_since as string) ?? nowIso(),
      socials: {},
    });
  }

  // POST /api/negotiate/manual — offline manual chat with the buyer's "agent".
  // No LLM: greet on open; on any seller message, agree to the deal's current
  // terms so the flow can proceed (mirrors the offline "treat as agreed" model).
  if (path === "/api/negotiate/manual" && method === "POST") {
    const b = (body ?? {}) as {
      dealId?: string;
      isOpening?: boolean;
      messages?: Array<{ role: string; content: string }>;
    };
    const deal = b.dealId ? mockData.getDeal(b.dealId) : undefined;
    if (b.isOpening) {
      return json({
        response:
          "Hi — I'm representing the buyer (offline mode). The proposed terms are on the left. Reply to accept them or propose changes.",
        agreed: false,
        agreedTerms: null,
      });
    }
    // Any seller reply → accept the current terms.
    const agreedTerms = deal
      ? {
          totalAmount: deal.total_amount_usdc,
          milestones: (deal.milestones ?? []).map((m) => ({
            description: m.description,
            amount: m.amount,
          })),
        }
      : null;
    return json({
      response: "Sounds good — we're agreed on these terms. (offline)",
      agreed: true,
      agreedTerms,
    });
  }

  // POST /api/negotiate — offline AI negotiation: return an immediately-agreed
  // proposal using the requested terms (no LLM rounds offline).
  if (path === "/api/negotiate" && method === "POST") {
    const b = (body ?? {}) as {
      proposalId?: string;
      buyerWallet?: string;
      initialTerms?: unknown;
    };
    const terms = b.initialTerms ?? {};
    const now = Date.now();
    return json({
      proposal: {
        id: `${b.proposalId ?? "offline"}-agreed`,
        origin: "agent",
        buyerWallet: b.buyerWallet ?? "",
        initialTerms: terms,
        revisions: [],
        status: "agreed",
        finalTerms: terms,
        summary: {
          pros: ["Offline mode — terms accepted as proposed."],
          cons: [],
          keyConcessions: [],
          riskFlags: [],
          confidenceScore: 1,
          recommendation: "accept",
          recommendationReasoning: "Offline negotiation; accept to fund the escrow.",
        },
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  // POST /api/agent + GET /api/agent/context — offline no-op (the manual deal
  // form replaces the structuring agent; context is unused).
  if (path === "/api/agent" && method === "POST") {
    return json({ response: "Offline mode — use the manual deal form above." });
  }
  if (path === "/api/agent/context" && method === "GET") {
    return json({ systemPrompt: "" });
  }

  // POST /api/verify-milestone — offline auto-approve (no LLM proof review).
  if (path === "/api/verify-milestone" && method === "POST") {
    return json({ review: { verdict: "approved", confidence: 1, reasoning: "Offline mode — auto-approved." } });
  }

  // GET/PUT /api/users/:wallet/profile — read/write the localStorage profile
  // store (same store the /public route synthesizes from). Without this, the
  // invite-accept "create profile" PUT and onboarding's profile save would fall
  // through to the real backend and 500 in pure offline mode.
  const profMatch = path.match(/^\/api\/users\/([^/]+)\/profile$/);
  if (profMatch) {
    const w = decodeURIComponent(profMatch[1]);
    const profiles = read<Record<string, Record<string, unknown>>>(K.profiles, {});
    if (method === "PUT") {
      const b = (body ?? {}) as Record<string, unknown>;
      profiles[w] = {
        ...(profiles[w] ?? {}),
        ...b,
        member_since: profiles[w]?.member_since ?? nowIso(),
      };
      write(K.profiles, profiles);
      return json({ ok: true, profile: profiles[w] });
    }
    if (method === "GET") {
      return json({ profile: profiles[w] ?? null });
    }
  }

  // Profile side-channels — offline no-ops so they don't 500.
  if (path === "/api/users/email" && method === "POST") return json({ ok: true });
  if (path === "/api/users/email/verify" && method === "POST") return json({ ok: true });
  if (path === "/api/users/notifications" && method === "POST") return json({ ok: true });
  if (path === "/api/profile/avatar" && method === "POST") return json({ avatarUrl: null });
  if (path === "/api/kyc/submit" && method === "POST") return json({ status: "pending" });

  // GET /api/friends — empty offline
  if (path === "/api/friends" && method === "GET") {
    return json({ friends: [] });
  }
  if (path === "/api/friends/status" && method === "GET") {
    return json({ status: "none" });
  }
  // POST /api/friends + /api/friends/:wallet — offline no-op
  if (path === "/api/friends" && method === "POST") {
    return json({ ok: true, status: "pending" });
  }
  if (/^\/api\/friends\/[^/]+$/.test(path) && (method === "POST" || method === "DELETE")) {
    return json({ ok: true, status: method === "DELETE" ? "removed" : "accepted" });
  }

  // GET /api/agent-templates — empty offline
  if (path === "/api/agent-templates" && method === "GET") {
    return json({ templates: [], limit: 3 });
  }

  // Not a mocked endpoint → let the caller fall through to real fetch.
  return null;
}

let installed = false;

export function installMockDataInterceptor(): void {
  if (!MOCK_DATA || installed || typeof window === "undefined") return;
  installed = true;

  const realFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const rawUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.toString()
          : input.url;

      // Only intercept same-origin /api/* calls.
      if (rawUrl.includes("/api/")) {
        const url = new URL(rawUrl, window.location.origin);
        if (url.pathname.startsWith("/api/")) {
          const method = (init?.method ?? "GET").toUpperCase();
          const headers = new Headers(init?.headers ?? {});
          let body: unknown = undefined;
          if (init?.body && typeof init.body === "string") {
            try {
              body = JSON.parse(init.body);
            } catch {
              body = init.body;
            }
          }
          const res = await handle(url, method, headers, body);
          if (res) return res;
        }
      }
    } catch (err) {
      console.warn("[mock-data] interceptor error, falling back to real fetch:", err);
    }
    return realFetch(input, init);
  };

  console.info("[mock-data] offline interceptor installed (localStorage-backed /api/*)");
}

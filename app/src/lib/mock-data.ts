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

type MirrorMilestone = { description: string; amount: number; status?: string; release_tx?: string };
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
  deliverables: "mock:data:deliverables",
  refundReqs: "mock:data:refund-requests",
  complaints: "mock:data:complaints",
};

type Deliverable = {
  id: string;
  deal_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  storage_key: string;
  milestone_index: number;
  uploaded_by: string | null;
  created_at: string;
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
  deleteDeal(dealId: string): void {
    const all = read<Record<string, MirrorDeal>>(K.deals, {});
    delete all[dealId];
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
  deliverablesFor(dealId: string): Deliverable[] {
    return read<Deliverable[]>(K.deliverables, []).filter((d) => d.deal_id === dealId);
  },
  addDeliverable(d: Omit<Deliverable, "id" | "created_at">): Deliverable {
    // Replace any prior proof for the same deal + milestone so a re-upload
    // supersedes the old file instead of stacking (mirrors the real route).
    const all = read<Deliverable[]>(K.deliverables, []).filter(
      (x) => !(x.deal_id === d.deal_id && x.milestone_index === d.milestone_index)
    );
    const deliverable: Deliverable = { ...d, id: uuid(), created_at: nowIso() };
    all.push(deliverable);
    write(K.deliverables, all);
    return deliverable;
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
      const b = (body ?? {}) as Partial<MirrorDeal> & {
        tx_signature?: string;
        creator_role?: "buyer" | "seller";
      };
      if (!b.deal_id || !b.title) return json({ error: "deal_id, title required" }, 400);
      const existing = mockData.getDeal(b.deal_id);
      // Honor explicit slots from the body (role-aware creation); fall back to
      // the caller as buyer for legacy callers. Mirrors the real mirror route.
      const buyer_wallet =
        b.creator_role === "seller"
          ? (b.buyer_wallet ?? existing?.buyer_wallet ?? null)
          : (b.buyer_wallet ?? existing?.buyer_wallet ?? wallet ?? "");
      const seller_wallet =
        b.creator_role === "seller"
          ? (wallet ?? existing?.seller_wallet ?? null)
          : (b.seller_wallet ?? existing?.seller_wallet ?? null);
      // The two parties must be distinct — mirrors the real mirror route.
      if (buyer_wallet && seller_wallet && buyer_wallet === seller_wallet) {
        return json({ error: "Buyer and seller must be different wallets" }, 400);
      }
      const deal: MirrorDeal = {
        deal_id: b.deal_id,
        buyer_wallet: buyer_wallet ?? "",
        seller_wallet,
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

  // /api/complaints — POST is public (any wallet); GET/PATCH are admin-only.
  if (path === "/api/complaints") {
    const all = read<Array<Record<string, unknown>>>(K.complaints, []);
    if (method === "POST") {
      const b = (body ?? {}) as { deal_id?: string; category?: string; message?: string };
      if (!b.message?.trim()) return json({ error: "message required" }, 400);
      const c = { id: uuid(), deal_id: b.deal_id ?? null, reporter_wallet: wallet, category: b.category ?? "other", message: b.message.trim(), status: "open", created_at: nowIso() };
      all.unshift(c);
      write(K.complaints, all);
      return json({ complaint: c });
    }
    // GET / PATCH require admin (mirror the real route's requireAdmin).
    const MOCK_ADMIN_WALLET = "8NY8GM9JbDcNo9RxmbYd7SKj5EWEVs8syKfzE1MzB6VR";
    const passcode = headers.get("x-admin-passcode");
    if (!(wallet === MOCK_ADMIN_WALLET || passcode === "sealed-admin-2026")) return json({ error: "Forbidden" }, 403);
    if (method === "GET") {
      const statuses = params.getAll("status").flatMap((s) => s.split(",")).map((s) => s.trim()).filter(Boolean);
      const rows = statuses.length ? all.filter((c) => statuses.includes(c.status as string)) : all;
      return json({ complaints: rows, count: rows.length, limit: 100, offset: 0 });
    }
    if (method === "PATCH") {
      const b = (body ?? {}) as { id?: string; status?: string };
      const c = all.find((x) => x.id === b.id);
      if (c && b.status) { c.status = b.status; write(K.complaints, all); }
      return json({ ok: true });
    }
  }

  // Admin gate (offline mirror of lib/admin.ts). Real env isn't readable in the
  // browser interceptor, so we use fixed dev values: the buyer mock identity is
  // "allowlisted", and a dev passcode unlocks the passcode path. Lets both the
  // allowlisted-wallet flow and the passcode-gate UI be tested offline.
  if (path.startsWith("/api/admin/")) {
    const MOCK_ADMIN_WALLET = "8NY8GM9JbDcNo9RxmbYd7SKj5EWEVs8syKfzE1MzB6VR"; // mock buyer
    const MOCK_ADMIN_PASSCODE = "sealed-admin-2026";
    const passcode = headers.get("x-admin-passcode");
    const ok = wallet === MOCK_ADMIN_WALLET || passcode === MOCK_ADMIN_PASSCODE;
    if (!ok) return json({ error: "Forbidden" }, 403);
  }

  // GET /api/admin/deals — offline admin dashboard (read-only). Gated above by
  // the offline admin check. Mirrors the real route's shape: status filter, q
  // search, offset paging, milestone summary.
  if (path === "/api/admin/deals" && method === "GET") {
    const statuses = params
      .getAll("status")
      .flatMap((s) => s.split(","))
      .map((s) => s.trim())
      .filter(Boolean);
    const q = (params.get("q")?.trim() || "").toLowerCase();
    const min = params.get("min") ? Number(params.get("min")) : null;
    const max = params.get("max") ? Number(params.get("max")) : null;
    const from = params.get("from")?.trim() || null;
    const to = params.get("to")?.trim() || null;
    const pairing = params.get("pairing")?.trim() || null;
    const limit = Math.min(Number(params.get("limit")) || 50, 100);
    const offset = Math.max(Number(params.get("offset")) || 0, 0);
    let all = mockData
      .allDeals()
      .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
    if (statuses.length > 0) all = all.filter((d) => statuses.includes(d.status));
    if (min != null && Number.isFinite(min)) all = all.filter((d) => d.total_amount_usdc >= min);
    if (max != null && Number.isFinite(max)) all = all.filter((d) => d.total_amount_usdc <= max);
    if (from) all = all.filter((d) => (d.updated_at ?? "") >= from);
    if (to) all = all.filter((d) => (d.updated_at ?? "") <= to);
    if (pairing === "open") all = all.filter((d) => !d.seller_wallet);
    else if (pairing === "paired") all = all.filter((d) => !!d.seller_wallet);
    if (q) {
      all = all.filter((d) =>
        [d.deal_id, d.title, d.buyer_wallet, d.seller_wallet ?? ""]
          .some((s) => (s ?? "").toLowerCase().includes(q))
      );
    }
    const count = all.length;
    const page = all.slice(offset, offset + limit).map((d) => {
      const ms = Array.isArray(d.milestones) ? d.milestones : [];
      const done = ms.filter((m) => m?.status === "Released" || m?.status === "Completed").length;
      return {
        deal_id: d.deal_id,
        buyer_wallet: d.buyer_wallet,
        seller_wallet: d.seller_wallet,
        title: d.title,
        total_amount_usdc: d.total_amount_usdc,
        status: d.status,
        milestones_total: ms.length,
        milestones_done: done,
        created_at: d.created_at,
        updated_at: d.updated_at,
      };
    });
    return json({ deals: page, count, limit, offset });
  }

  // GET /api/admin/deals/:dealId — offline deal detail for the admin dashboard.
  // Returns the full mirror row; on-chain PDAs are placeholders offline (no real
  // program/derivation in mock mode).
  const adminDealMatch = path.match(/^\/api\/admin\/deals\/([^/]+)$/);
  if (adminDealMatch && method === "GET") {
    const dealId = decodeURIComponent(adminDealMatch[1]);
    const deal = mockData.getDeal(dealId);
    if (!deal) return json({ error: "Deal not found" }, 404);
    return json({
      deal,
      onchain: {
        program_id: "MockProgram1111111111111111111111111111111",
        deal_pda: `mock-deal-pda:${dealId}`,
        escrow_vault_pda: `mock-vault-pda:${dealId}`,
      },
    });
  }

  // GET /api/admin/users — offline admin dashboard (read-only). Synthesizes the
  // user list from the stored profiles, with reputation derived from each
  // wallet's deals (mirrors how /api/users/:wallet/public is faked).
  if (path === "/api/admin/users" && method === "GET") {
    const kycStatuses = params
      .getAll("kyc")
      .flatMap((s) => s.split(","))
      .map((s) => s.trim())
      .filter(Boolean);
    const emailVerified = params.get("emailVerified")?.trim() || null;
    const q = (params.get("q")?.trim() || "").toLowerCase();
    const limit = Math.min(Number(params.get("limit")) || 50, 100);
    const offset = Math.max(Number(params.get("offset")) || 0, 0);
    const profiles = read<Record<string, Record<string, unknown>>>(K.profiles, {});
    let rows = Object.entries(profiles).map(([w, p]) => {
      const deals = mockData.dealsFor(w);
      return {
        wallet: w,
        handle: (p.handle as string) ?? "",
        display_name: (p.display_name as string) ?? null,
        email: (p.email as string) ?? null,
        email_verified: Boolean(p.email_verified),
        kyc_status: ((p.kyc_status as string) ?? "none") as
          | "none"
          | "pending"
          | "approved"
          | "rejected",
        member_since: (p.member_since as string) ?? nowIso(),
        reputation: {
          deals_total: deals.length,
          deals_successful: deals.filter(isCompleted).length,
          avg_rating: 0,
        },
      };
    });
    if (kycStatuses.length > 0) rows = rows.filter((u) => kycStatuses.includes(u.kyc_status));
    if (emailVerified === "true") rows = rows.filter((u) => u.email_verified === true);
    else if (emailVerified === "false") rows = rows.filter((u) => u.email_verified === false);
    if (q) {
      rows = rows.filter((u) =>
        [u.wallet, u.handle, u.display_name ?? "", u.email ?? ""]
          .some((s) => (s ?? "").toLowerCase().includes(q))
      );
    }
    const count = rows.length;
    const page = rows.slice(offset, offset + limit);
    return json({ users: page, count, limit, offset });
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
        ...(b.buyer_wallet !== undefined ? { buyer_wallet: b.buyer_wallet } : {}),
        ...(b.status !== undefined ? { status: b.status } : {}),
        ...(b.title !== undefined ? { title: b.title } : {}),
        ...(b.description !== undefined ? { description: b.description } : {}),
        ...(b.total_amount_usdc !== undefined
          ? { total_amount_usdc: b.total_amount_usdc }
          : {}),
        ...(b.milestones !== undefined ? { milestones: b.milestones } : {}),
        updated_at: nowIso(),
      };
      // The two parties must stay distinct after the patch — mirrors the real route.
      if (next.buyer_wallet && next.seller_wallet && next.buyer_wallet === next.seller_wallet) {
        return json({ error: "Buyer and seller must be different wallets" }, 400);
      }
      if (isCompleted(next)) next.status = "completed";
      mockData.putDeal(next);
      return json({ deal: next });
    }
    if (method === "DELETE") {
      if (!deal) return json({ error: "Deal not found" }, 404);
      if (deal.buyer_wallet !== wallet && deal.seller_wallet !== wallet) {
        return json({ error: "Forbidden" }, 403);
      }
      // Pre-escrow only — mirrors the real route's guard (bug #15).
      const preEscrow = ["draft", "seller-ready", "seller-agreed", "proposed", "escalated"];
      if (!preEscrow.includes(deal.status)) {
        return json({ error: "This deal has funds in escrow and can't be deleted" }, 409);
      }
      mockData.deleteDeal(dealId);
      return json({ ok: true, deleted: dealId });
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

  // GET /api/deliverables — proof uploaded by either party, persisted on upload
  if (path === "/api/deliverables" && method === "GET") {
    const dealId = params.get("deal_id");
    if (!dealId) return json({ deliverables: [] });
    return json({ deliverables: mockData.deliverablesFor(dealId) });
  }

  // POST /api/upload — persist a proof deliverable so both parties can see it.
  // Either side may upload (release stays buyer-only). The deal id, milestone,
  // and uploader come from headers set by handleUploadProof.
  if (path === "/api/upload" && method === "POST") {
    const dealId = headers.get("x-deal-id");
    const milestoneIndex = Number(headers.get("x-milestone-index") ?? "0");
    const isChatAttachment = headers.get("x-chat-attachment") === "1";
    const storage_key = `offline/${uuid()}`;
    // Chat attachments (#3) are images shared in chat, not milestone proof — don't
    // record a deliverable (mirrors the real route).
    if (dealId && !isChatAttachment) {
      mockData.addDeliverable({
        deal_id: dealId,
        filename: "offline-proof",
        content_type: "application/octet-stream",
        size_bytes: 0,
        storage_key,
        milestone_index: Number.isFinite(milestoneIndex) ? milestoneIndex : 0,
        uploaded_by: wallet,
      });
    }
    return json({
      id: uuid(),
      original_name: isChatAttachment ? "offline-image" : "offline-proof",
      file_type: isChatAttachment ? "image/png" : "application/octet-stream",
      size_bytes: 0,
      storage_key,
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
    // Only report an identity (member_since) if a real profile exists — otherwise
    // a brand-new wallet would look "onboarded" to the DB-hydration path (N9).
    const hasProfile = Boolean(p.handle || p.display_name);
    const deals = mockData.dealsFor(w);
    return json({
      handle: p.handle ?? null,
      display_name: p.display_name ?? null,
      avatar_url: p.avatar_url ?? null,
      bio: p.bio ?? null,
      is_verified: (p.kyc_status as string) === "approved",
      kyc_status: (p.kyc_status as string) ?? "none",
      deals_total: deals.length,
      deals_successful: deals.filter(isCompleted).length,
      avg_rating: 0,
      member_since: hasProfile ? ((p.member_since as string) ?? nowIso()) : null,
      website: (p.website as string) ?? null,
      twitter_handle: (p.twitter as string) ?? null,
      telegram_handle: (p.telegram as string) ?? null,
      instagram_handle: (p.instagram as string) ?? null,
      linkedin_url: (p.linkedin as string) ?? null,
    });
  }

  // GET /api/users/:wallet/reviews — the individual revealed reviews received by
  // a wallet (bug #6), synthesized from the ratings store.
  const reviewsMatch = path.match(/^\/api\/users\/([^/]+)\/reviews$/);
  if (reviewsMatch && method === "GET") {
    const w = decodeURIComponent(reviewsMatch[1]);
    const allRatings = Object.values(read<Record<string, Rating>>(K.ratings, {}));
    const profiles = read<Record<string, Record<string, unknown>>>(K.profiles, {});
    const mine = allRatings
      .filter((r) => r.ratee_wallet === w && r.revealed)
      .sort((a, b) => (b.submitted_at ?? "").localeCompare(a.submitted_at ?? ""));
    const reviews = mine.map((r) => {
      const p = profiles[r.rater_wallet] ?? {};
      const deal = mockData.getDeal(r.deal_id);
      return {
        id: r.id,
        stars: r.stars,
        review_text: r.review_text ?? "",
        submitted_at: r.submitted_at,
        deal_id: r.deal_id,
        deal_title: deal?.title ?? r.deal_id,
        reviewer: {
          wallet: r.rater_wallet,
          handle: (p.handle as string) ?? null,
          display_name: (p.display_name as string) ?? null,
        },
      };
    });
    const average = reviews.length
      ? Math.round((reviews.reduce((s, r) => s + r.stars, 0) / reviews.length) * 10) / 10
      : 0;
    return json({ reviews, count: reviews.length, average });
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
  // proposal using the requested terms (no real LLM rounds offline).
  if (path === "/api/negotiate" && method === "POST") {
    const b = (body ?? {}) as {
      proposalId?: string;
      buyerWallet?: string;
      initialTerms?: { dealId?: string } & Record<string, unknown>;
    };
    const terms = b.initialTerms ?? {};
    const now = Date.now();
    const proposalId = b.proposalId ?? "offline";
    // Synthesize a short two-turn exchange so the offline demo also shows the
    // agent-to-agent conversation in the chat box (bug #11).
    const revisions = [
      { round: 1, by: "negotiator", onBehalfOf: "seller", action: "counter", proposedTerms: terms, reasoning: "Reviewed the terms and they look fair — happy to proceed.", concessions: [], asks: [], timestamp: Math.floor(now / 1000) },
      { round: 2, by: "negotiator", onBehalfOf: "buyer", action: "accept", proposedTerms: terms, reasoning: "Great — accepting the terms as proposed.", concessions: [], asks: [], timestamp: Math.floor(now / 1000) },
    ];
    // Persist the turns to the chat, mirroring the real route (#11).
    const dealId = b.initialTerms?.dealId;
    if (dealId && !mockData.messagesFor(dealId).some((m) => (m.metadata as { proposalId?: string } | null)?.proposalId === proposalId)) {
      for (const r of revisions) {
        const who = r.onBehalfOf === "buyer" ? "Buyer's agent" : "Seller's agent";
        const verb = r.action === "accept" ? "accepted" : r.action === "reject" ? "declined" : "proposed";
        mockData.addMessage({
          deal_id: dealId,
          role: "assistant",
          content: `**${who}** ${verb}: ${r.reasoning}`,
          wallet: b.buyerWallet ?? null,
          metadata: { proposalId, agentTurn: true, onBehalfOf: r.onBehalfOf, round: r.round },
        });
      }
    }
    return json({
      proposal: {
        id: `${proposalId}-agreed`,
        origin: "agent",
        buyerWallet: b.buyerWallet ?? "",
        initialTerms: terms,
        revisions,
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
  if (path === "/api/kyc/submit" && method === "POST") {
    // Persist pending status to the profile store so the verify page reflects it.
    const b = (body ?? {}) as { wallet?: string };
    const w = b.wallet ?? wallet;
    if (w) {
      const profiles = read<Record<string, Record<string, unknown>>>(K.profiles, {});
      profiles[w] = { ...(profiles[w] ?? {}), kyc_status: "pending" };
      write(K.profiles, profiles);
    }
    return json({ status: "pending" });
  }

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

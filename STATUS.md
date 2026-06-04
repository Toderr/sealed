# Sealed — Program Status

_Last updated: 2026-06-04_

---

## What's Live (Devnet)

**Program ID:** `3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ`

### On-Chain Instructions (7 total)
| Instruction | Status | Notes |
|---|---|---|
| `create_deal` | ✅ Live | buyer + seller, USDC milestones |
| `fund_escrow` | ✅ Live | partial funding allowed |
| `release_milestone` | ✅ Live | buyer-only, unilateral |
| `refund` | ✅ Live | requires both buyer + seller signatures |
| `cancel_deal` | ✅ Live (just deployed) | buyer-only, pre-funded cancel |
| `buyer_timeout_refund` | ✅ Live (just deployed) | unilateral after 30 days, no seller sig needed |
| `close_deal` | ✅ Live (just deployed) | reclaims rent after Completed/Refunded |

### Frontend
- AI chat → deal structuring → negotiation room → on-chain escrow → milestone release
- Dual-agent negotiation (buyer bot ↔ seller bot), role-based engine
- Verifier agent: reviews proof (image/url/text) via multimodal LLM
- 6 LLM providers: Anthropic, OpenAI, OpenRouter, Groq, DeepSeek, Gemini
- LLM model: own-key (user provides API key) — no server-side LLM key
- LiveDealSheet: slides in on first message, shows deal draft live
- Profile: avatar upload, company bio, visible on invite page
- Reputation: tracked in Supabase (on-chain PDA defined but not yet wired)
- Mutual refund: 2-sig flow with localStorage handoff (same-browser only)

### Auth
- All API routes: `x-wallet` header (wallet address only — no signature proof)
- Own-key LLM: dispatched client-side directly to provider

---

## What Was Fixed (2026-06-04, commit `45438e5`)
- `/api/kyc/submit` — added auth check: `x-wallet` must match `wallet` in body
- `getLlmOptsFromEnv()` — OpenRouter now takes priority over Anthropic (matches docs)
- Default Anthropic model: `claude-haiku-4-5-20251001` → `claude-haiku-4-5`
- `allMilestonesReleased()` — removed dead `"Completed"` check (on-chain only uses `Released`)
- `DealDetail.tsx` — removed unreachable `MilestoneStatus.Completed` branch

---

## What Still Needs To Be Done

### P0 — Blocks Mainnet
- [ ] **Signed-message auth** — replace `x-wallet` header with `wallet.signMessage` verification server-side. Required before real funds. Any caller knowing a wallet address can currently impersonate any user.

### P1 — High Priority
- [ ] **Wire Reputation PDA on-chain** — `Reputation` account is defined in `state.rs` but no instruction reads or writes it. Core differentiator of Sealed. Needs `update_reputation` CPI inside `release_milestone` (increment both parties' deal count + volume).
- [ ] **Rate limiting on LLM routes** — needed when Sealed token system is added (server-side LLM key). Not urgent while all LLM is own-key.

### P2 — Before Launch
- [ ] **Seller ≠ buyer guard in `create_deal`** — add Anchor constraint `seller.key() != buyer.key()`. Prevents self-deal fund lock. Requires Rust rebuild + redeploy.
- [ ] **Refund handoff via Supabase** — current `localStorage` handoff only works same-browser. Store partial tx blob in `sealed_deals.refund_tx_blob`. Seller fetches on deal page, sees "Sign mutual refund" CTA.
- [ ] **`DealStatus::Disputed` dead** — enum variant defined, no instruction sets it. Either implement `raise_dispute` instruction or remove to avoid confusion.
- [ ] **`DeepSeek` missing from `getLlmOptsFromEnv()`** — can dispatch but can't configure as server provider via env var.

### P3 — Polish
- [ ] **`sendTx` feePayer** — currently derived from `instructions[0].keys[0].pubkey`. Pass explicitly as parameter.
- [ ] **`maxTokens` per route** — use 2048 for negotiate/verify-milestone, 1024 for agent chat. Complex negotiations may truncate.
- [ ] **Helius RPC** — upgrade from public devnet RPC before mainnet.
- [ ] **`MilestoneStatus.Completed` in `negotiate/[dealId]/page.tsx:769`** — still sets `Pending` on new milestones (correct), but check surrounding logic for stale `Completed` references.

---

## Stack
- **Smart contract:** Anchor 0.30.1, Rust, deployed on Solana devnet
- **Frontend:** Next.js 16 (App Router, Turbopack), TypeScript, Tailwind CSS v4
- **LLM:** own-key, 6 providers, client-side dispatch
- **Off-chain DB:** Supabase (deals, messages, users, reputation aggregates, ratings)
- **Wallet:** Wallet Standard (Phantom, Solflare, Backpack)
- **Storage:** Supabase `sealed-docs` (deliverables) + `sealed-kyc` (KYC documents)

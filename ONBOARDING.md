---
name: Sealed — AI-Powered Autonomous Escrow on Solana
description: Repo context for Claude Code sessions on the Sealed hackathon project
type: project
---

# Sealed — Repo Context

## What this repo is

Sealed is a hackathon project (4-week sprint, team of 2) building toward a real product. It is a **B2B deal execution platform**: an AI agent that represents business owners on an on-chain deal table — it negotiates terms, manages milestone-based escrow, verifies deliverables, and releases payment autonomously on Solana.

The repo contains **two separate products** in one monorepo:

```
sealed/
├── app/                  ← Next.js 16 frontend + API routes (the live product)
└── programs/escrow/      ← Anchor smart contract (Solana program, build in WSL)
```

The **pitch deck** (`Sealed Deck.html`, `Sealed Deck.pdf`) and slide PNGs (`slides-png/`) are also in the root — they are presentation assets, not code.

---

## The app (`app/`)

Next.js 16 (App Router, Turbopack). All active development happens here.

### Key routes
| Route | Purpose |
|---|---|
| `/` | Landing page |
| `/app` | Main dashboard — Chat tab (AI deal creation) + Deals tab |
| `/onboarding` | New user setup: name/bio + LLM config. Accepts `?returnUrl=` to redirect after completion |
| `/profile` | Own profile: overview, agent setup, friends, settings |
| `/profile/[wallet]` | Public profile of any user |
| `/negotiate/[dealId]` | Negotiation room — deal terms, invite counterparty, run agent negotiation |
| `/invite/[token]` | Invite landing page for counterparty. Redirects to `/onboarding?returnUrl=…` if no profile |
| `/deals/[id]/review` | Post-funding deal review page |

### Key components
| File | Purpose |
|---|---|
| `components/ChatInterface.tsx` | AI chat + deal creation. Auto-shows wizard if agent returns no deal JSON |
| `components/ContractWizard.tsx` | Structured 6-step deal wizard. All text in English. Counterparty step uses FriendPickerStep (friends list + manual wallet fallback) |
| `components/DealDashboard.tsx` | Lists user's deals |
| `components/Header.tsx` | Top nav with Chat/Deals tab toggle |
| `components/SettingsModal.tsx` | LLM provider config modal |

### Key lib files
| File | Purpose |
|---|---|
| `lib/profile-store.ts` | Zustand-style store (localStorage). Holds user profile, LLM config, `onboardingComplete` flag |
| `lib/deals-store.ts` | Deal list state (localStorage) |
| `lib/types.ts` | Shared TypeScript types: `Deal`, `DealParams`, `DealStatus`, `MilestoneStatus`, `PublicProfile` |
| `lib/llm-dispatch.ts` | Multi-provider LLM caller: OpenRouter → Anthropic fallback, Gemini support |
| `lib/llm-headers.ts` | Builds `x-llm-provider/model/key` headers from localStorage profile |
| `lib/escrow-client.ts` | Builds Solana instructions for on-chain escrow operations |
| `lib/supabase.ts` | Supabase client with `table(name)` helper (prefixes `sealed_`) |

### API routes (all under `app/api/`)
| Route | Purpose |
|---|---|
| `POST /api/agent` | AI deal structuring — parses natural language → structured DealParams JSON |
| `POST /api/negotiate` | AI negotiation engine — runs up to 5 rounds between buyer/seller agents |
| `POST /api/deals/mirror` | Upserts deal to Supabase (required before navigating to negotiate room) |
| `GET /api/deals/[dealId]` | Fetch single deal by ID |
| `GET/POST /api/friends` | List friends / send friend request |
| `PATCH /api/friends/[wallet]` | Accept / decline / remove friend |
| `GET /api/users/[wallet]/public` | Public profile lookup |

### Authentication model
- **No passwords, no email login.** Identity = Solana wallet (Phantom, Solflare, Backpack via wallet-standard).
- `x-wallet` header on API requests carries the connected wallet address.
- Profile data lives in **localStorage** (client) + **Supabase** `sealed_users` table (server, for public profiles and reputation).

### LLM config
Users supply their own API key (stored in localStorage, sent as `x-llm-key` header). Supported providers: OpenRouter, Anthropic, Gemini. The agent routes dispatch via `llm-dispatch.ts`. x402 micropayment mode is also wired but secondary.

---

## The smart contract (`programs/escrow/`)

Anchor program on Solana. **Must be built in WSL on Windows** — `anchor build` / `anchor test` do not work in PowerShell.

### PDAs
- `Deal`: `seeds = [b"deal", deal_id.as_bytes()]`
- `Escrow Vault`: `seeds = [b"escrow-vault", deal_id.as_bytes()]`
- `Reputation`: `seeds = [b"reputation", wallet.as_bytes()]` (planned)

### USDC addresses
- Devnet: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- Mainnet: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`

---

## Off-chain storage: Supabase

Supabase is used for off-chain context only. **On-chain is the source of truth for funds.**

Tables (all prefixed `sealed_`):
- `sealed_deals` — deal mirror (on-chain `deal_id` is the join key)
- `sealed_messages` — AI chat transcripts
- `sealed_users` — profiles, handles, KYC status
- `sealed_friends` — friend relationships (`wallet`, `friend_wallet`, `status`)
- `sealed_agent_templates` — per-wallet agent config
- `sealed_reputation` — deal counts and ratings
- `sealed_ratings` — per-deal star ratings
- `sealed_notification_queue` — email/Telegram dispatch queue
- `sealed_deliverables` — file metadata (bytes in `sealed-docs` storage bucket)

Env vars needed in `app/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
ANTHROPIC_API_KEY=
NEXT_PUBLIC_SOLANA_NETWORK=devnet
```

---

## Deal flow (end to end)

1. User describes deal in chat → AI agent extracts `DealParams` JSON
2. If AI asks clarifying question (no JSON returned) → wizard auto-opens
3. `handleDealDrafted` → POST `/api/deals/mirror` (fatal — shows error if fails) → navigate to `/negotiate/[dealId]`
4. In negotiate room: buyer sees invite section — friend list with "Copy invite" buttons + direct link
5. Counterparty opens invite link → if no profile: redirect to `/onboarding?returnUrl=…` → after onboarding, back to invite page
6. Counterparty accepts → enters negotiate room as seller
7. Both parties start negotiation → agents run up to 5 rounds → propose final terms
8. Buyer accepts → `buildCreateDealIx` deploys on-chain escrow → funds locked
9. Milestones completed and confirmed → escrow releases payment

**Max 2 users per negotiation room** — enforced by `buyer_wallet` + `seller_wallet` in the deal record. Anyone else is an observer.

---

## Dev commands

```bash
# Frontend (Windows PowerShell)
cd app && npm run dev          # http://localhost:3000
cd app && npm run build
cd app && npm run lint

# Smart contract (WSL Ubuntu only)
anchor build
anchor test
anchor deploy
```

---

## Team & GTM context

- **Developer**: Built AI agent for DLMM (auto screening, position management, self-learning)
- **Co-Founder**: 18 years in trading, investing, crypto, DLMM, valuation
- **Target users**: Business owners who transact large deals via WhatsApp/bank transfer today. Team has direct access to this community.
- **Positioning**: "Trust infrastructure" — abstract all blockchain complexity. No "crypto" language in the UI.
- **Messaging rules**: No "auto-release" (dual-sign required), no "pengusaha" (use "business owner"), no "not crypto" (say "web2 wrapper").

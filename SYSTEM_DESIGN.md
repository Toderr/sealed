# Sealed — System Design Document

> **Sealed: an AI agent that negotiates, escrows, and releases payment on Solana, so you can seal the deal with ease.**

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Layer Breakdown](#3-layer-breakdown)
   - 3.1 [Frontend (Next.js)](#31-frontend-nextjs)
   - 3.2 [API Layer](#32-api-layer)
   - 3.3 [AI Agent System](#33-ai-agent-system)
   - 3.4 [Off-Chain Storage (Supabase)](#34-off-chain-storage-supabase)
   - 3.5 [On-Chain Program (Anchor/Solana)](#35-on-chain-program-anchorsolana)
4. [Data Flow](#4-data-flow)
   - 4.1 [Deal Creation Flow](#41-deal-creation-flow)
   - 4.2 [Milestone Release Flow](#42-milestone-release-flow)
   - 4.3 [Negotiation Flow](#43-negotiation-flow)
5. [Database Schema](#5-database-schema)
6. [Smart Contract Accounts & Instructions](#6-smart-contract-accounts--instructions)
7. [API Reference](#7-api-reference)
8. [AI Agent Design](#8-ai-agent-design)
9. [Security Model](#9-security-model)
10. [Environment Variables](#10-environment-variables)
11. [Key Design Decisions](#11-key-design-decisions)

---

## 1. Overview

Sealed is a B2B escrow platform built on Solana. It uses AI agents to help users structure deal terms, negotiate between parties, and verify milestone deliverables — but the final payment release always requires the buyer's on-chain signature.

**Core principle:** AI recommends, humans sign. No funds move without the buyer explicitly signing a Solana transaction.

**Target user:** Non-crypto business owners who want the trust guarantees of blockchain escrow without the technical complexity.

### What Sealed is NOT
- Not a custodial service — funds go directly into a PDA-owned escrow vault
- Not an auto-release system — buyer dual-signature is always required
- Not a crypto-native product — the web2 UX wraps Solana complexity

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USER (Browser)                              │
│                                                                       │
│   Wallet (Phantom/Solflare/Backpack)  ←→  Next.js Frontend          │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
  ┌──────────────┐   ┌─────────────────┐   ┌──────────────────┐
  │  Next.js API │   │  Supabase       │   │  Solana Devnet   │
  │  Routes      │   │  (off-chain)    │   │  (on-chain)      │
  │              │   │                 │   │                  │
  │  /api/agent  │   │  sealed_deals   │   │  Deal PDA        │
  │  /api/deals  │   │  sealed_msgs    │   │  Escrow Vault    │
  │  /api/neg..  │   │  sealed_users   │   │  Reputation PDA  │
  │  /api/verify │   │  sealed_ratings │   │                  │
  │  /api/upload │   │  sealed_notifs  │   │  USDC Token      │
  └──────┬───────┘   └─────────────────┘   └──────────────────┘
         │
         ▼
  ┌──────────────┐
  │  LLM Layer   │
  │  (multi-     │
  │  provider)   │
  │              │
  │  Anthropic   │
  │  OpenRouter  │
  │  OpenAI      │
  │  Groq        │
  │  Gemini      │
  └──────────────┘
```

---

## 3. Layer Breakdown

### 3.1 Frontend (Next.js)

**Framework:** Next.js App Router  
**Deployment:** Vercel  
**Wallet:** `@solana/wallet-adapter` (Phantom, Solflare, Backpack)

#### Page Routes

| Route | File | Purpose |
|---|---|---|
| `/` | `app/page.tsx` | Landing page — hero, value prop, team |
| `/app` | `app/app/page.tsx` | Main dashboard: chat tab + deals tab |
| `/deals/[id]` | `app/deals/[id]/page.tsx` | Active deal view — messages, milestones, approvals |
| `/deals/[id]/review` | `app/deals/[id]/review/page.tsx` | Deal summary + ratings |
| `/negotiate/[dealId]` | `app/negotiate/[dealId]/page.tsx` | Negotiation room (agent or manual) |
| `/profile` | `app/profile/page.tsx` | Redirect/self-profile entrypoint |
| `/profile/[wallet]` | `app/profile/[wallet]/page.tsx` | Public profile + deal history |
| `/onboarding` | `app/onboarding/page.tsx` | KYC + profile setup |
| `/admin/kyc` | `app/admin/kyc/page.tsx` | Admin KYC review (restricted) |

#### Key Components

| Component | Purpose |
|---|---|
| `ChatInterface.tsx` | AI deal structuring chat |
| `ContractWizard.tsx` | Form-based deal builder |
| `DealDashboard.tsx` | Deal list with status filters |
| `DealDetail.tsx` | Active deal management view |
| `NegotiationView.tsx` | Real-time negotiation interface |
| `NotificationMenu.tsx` | In-app notifications for both parties, backed by `/api/notifications` |
| `WalletProvider.tsx` | Wallet adapter context wrapper |
| `SelfProfilePage.tsx` | Profile dashboard, deals, friends, agent setup |
| `AiProviderPanel` | LLM provider + model config inside Agent Setup |

#### On-Chain Interactions (client-side)

All Solana transactions are signed by the user's connected wallet in-browser. The frontend uses `escrow-client.ts` to build and submit transactions:

- `create_deal` — buyer signs after finalizing terms
- `fund_escrow` — buyer signs to deposit USDC into escrow vault
- `release_milestone` — buyer signs to release a milestone payment
- `refund` — requires both buyer AND seller signatures

`sendTx` signs in-browser, submits the raw transaction, then confirms with `{ signature, blockhash, lastValidBlockHeight }` from the latest blockhash response. This keeps the post-sign UI from waiting on stale confirmation semantics.

Before `fund_escrow`, the client checks the buyer's USDC ATA balance and blocks the flow with a clear insufficient-USDC message when the wallet cannot cover the deal. If submission still fails, `sendTx` catches `SendTransactionError` and calls `getLogs(connection)` for full program logs.

---

### 3.2 API Layer

All API routes live in `app/src/app/api/`. They are Next.js Route Handlers (App Router).

**Auth pattern:** Most routes expect `x-wallet` header. The route validates that the caller is authorized to act on the resource (e.g., only buyer can patch a deal, only buyer can mirror a deal they created).

No session tokens or JWT auth — wallet address is the identity. This means routes currently trust the `x-wallet` header; hardening with wallet-signed challenges is a future improvement.

---

### 3.3 AI Agent System

Sealed has three distinct AI agents:

#### Structuring Agent (`/api/agent`)

**Role:** Helps the buyer define deal terms in natural language.

**Input:** Freeform conversation  
**Output:** Structured deal JSON (deal_id, title, description, amount, milestones[])

**Memory:** Loads per-wallet agent memory context from `sealed_agent_memory` before each call. Memory types: `preference`, `history`, `reputation`, `context`.

#### Negotiation Agent (`/api/negotiate`)

**Role:** Runs multi-turn negotiation between buyer and seller on behalf of both parties.

**Model split:**
- Buyer's agent calls the user-supplied LLM (from request headers)
- Seller's agent calls the server-side LLM (to avoid quota conflicts)

**Input:** Initial deal terms + buyer boundaries + (optional) seller boundaries  
**Output:** Final agreed proposal after N negotiation rounds

Seller boundaries are loaded from `sealed_agent_templates` if the seller has configured an agent.

When a user chooses `Renegotiate`, the UI collects a short natural-language instruction and sends it as `renegotiationRequest` to `/api/negotiate`. The request is prompt context for the next agent run; only the structured negotiated result can become final terms.

Choosing `Renegotiate` also updates the shared off-chain deal status to `escalated`, visible to both parties in the dashboard, profile, notification menu, and negotiation room. If the configured seller-side server model is an OpenRouter `:free` model, `/api/negotiate` uses the buyer-supplied provider for the simulated seller turn instead. If an LLM call still cannot complete, the API returns an escalated proposal with user-facing copy instead of surfacing raw provider errors.

The renegotiation instruction is persisted to `sealed_messages` as a `system` message with `metadata.type = "renegotiation_request"`. The counterparty's negotiation room reads this shared log, clears stale agreed/funding UI, and enters an actionable renegotiation path instead of showing only a passive escalated status.

#### Verifier Agent (`/api/verify-milestone`)

**Role:** Reviews milestone completion proof and recommends approval or rejection.

**Input:** Milestone description + proof (image, URL, or text)  
**Output:** `{ score: number, decision: "approve" | "reject", reasoning: string }`

The buyer sees the verifier's recommendation but is not bound by it — they always sign the release transaction themselves.

#### LLM Dispatch (`lib/llm-dispatch.ts`)

Unified multi-provider LLM routing. Priority order:

1. Client-supplied via request headers (`x-llm-provider`, `x-llm-model`, `x-llm-key`)
2. `OPENROUTER_API_KEY` → OpenRouter
3. `ANTHROPIC_API_KEY` → Anthropic Claude

Supported providers: `anthropic`, `openai`, `openrouter`, `groq`, `gemini`

Current server-env fallback ignores placeholder keys and resolves `OPENAI_API_KEY`, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. Negotiation avoids OpenRouter `:free` models for simulated seller turns when the buyer supplied a usable own-key provider.

---

### 3.4 Off-Chain Storage (Supabase)

**Purpose:** Human-readable context, chat logs, KYC, notifications, reputation aggregates.

**Client:** Service-role key, server-side only. Never exposed to the browser.  
**Table prefix:** All tables use `sealed_` prefix.

Supabase is **not** the source of truth for deal state or fund balances. On-chain data always wins. Supabase mirrors deal state for fast reads and stores data that has no on-chain equivalent (messages, files, reputation text).

**Storage Buckets:**
- `sealed-docs` — deliverable files uploaded by sellers
- `sealed-kyc` — KYC identity documents (private)

---

### 3.5 On-Chain Program (Anchor/Solana)

**Language:** Rust (Anchor framework)  
**Network:** Solana Devnet  
**Program ID:** `3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ`  
**Token:** USDC (devnet: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`)

The smart contract manages:
- Deal state machine
- USDC escrow vault (PDA-owned token account)
- Milestone-by-milestone release
- Mutual refund (both parties must sign)
- On-chain reputation PDA

---

## 4. Data Flow

### 4.1 Deal Creation Flow

```
1. Buyer opens /app
   │
2. Chat with Structuring Agent (/api/agent)
   │  Agent outputs deal JSON
   │
3. Frontend saves deal JSON to sessionStorage
   │
4. Frontend calls POST /api/deals/mirror
   │  Creates sealed_deals record (status: "draft")
   │
5. Frontend navigates to /negotiate/[dealId]
   │
6. Negotiation Room
   ├─ Agent mode: POST /api/negotiate → returns agreed terms
   └─ Manual mode: Buyer/seller edit terms directly
   │
7. On seller agreement:
   - Deal mirror status becomes "seller-agreed"
   - Dashboard places the deal in "Waiting on you" for the buyer
   |
8. Buyer accepts and deploys escrow:
   - Frontend prechecks buyer USDC balance
   - Frontend builds create_deal + fund_escrow in one wallet-signed transaction
   - User signs with wallet
   - Transaction submitted and confirmed on Solana
   |
9. POST /api/deals/mirror, with PATCH fallback
   - Updates status to "funded" and stores tx signature when possible
   |
10. UI routes buyer to /deals/[dealId]
    - Deal status: "Funded" on-chain; Supabase is only the off-chain mirror
```

### 4.2 Milestone Release Flow

```
1. Seller uploads proof at /deals/[id]
   │  POST /api/upload → stored in sealed-docs bucket
   │
2. POST /api/verify-milestone
   │  Verifier agent reviews proof
   │  Returns: { score, decision, reasoning }
   │
3. Buyer sees verifier result in /deals/[id]
   │
4. Buyer approves:
   ├─ Builds release_milestone transaction
   ├─ Signs with wallet
   └─ Transaction submitted to Solana
   │
5. USDC transferred: Escrow Vault → Seller Token Account
   │
6. PATCH /api/deals/[dealId]
   │  Syncs milestone status to sealed_deals
   │
7. If all milestones released:
   └─ Deal status → "Completed" (on-chain + Supabase)
```

### 4.3 Negotiation Flow

```
Buyer                  Sealed                 Seller
  │                      │                      │
  │── initial terms ──►  │                      │
  │                      │── buyer agent call ► LLM
  │                      │◄─ buyer position ────│
  │                      │                      │
  │                      │── seller agent call ► LLM
  │                      │◄─ seller counter ────│
  │                      │                      │
  │          (N rounds)  │                      │
  │                      │                      │
  │◄── final proposal ───│                      │
  │                      │                      │
  │─── sign create_deal ─► Solana               │
```

---

## 5. Database Schema

### `sealed_deals`

```sql
deal_id         TEXT PRIMARY KEY         -- matches on-chain deal_id
buyer_wallet    TEXT NOT NULL
seller_wallet   TEXT                     -- nullable until seller joins
title           TEXT NOT NULL
description     TEXT
total_amount_usdc NUMERIC NOT NULL
status          TEXT NOT NULL            -- see enum below
milestones      JSONB                    -- array of { description, amount, status }
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

**Status enum:** `draft` → `seller-ready` → `seller-agreed` → `escalated` → `proposed` → `funded` → `in_progress` → `completed` | `refunded` | `disputed`

Dashboard action ownership treats `seller-agreed` / "Ready to fund" as a buyer action, so it appears under "Waiting on you" for the buyer.
`escalated` is a shared off-chain coordination state for reopened terms; it does not imply any on-chain escrow state change.

### `sealed_messages`

```sql
id              UUID PRIMARY KEY
deal_id         TEXT NOT NULL
role            TEXT NOT NULL            -- user | assistant | system | tool
content         TEXT NOT NULL
wallet          TEXT                     -- which wallet sent (if user)
metadata        JSONB
created_at      TIMESTAMPTZ
```

Renegotiation requests use `role = 'system'` and `metadata.type = 'renegotiation_request'` so both parties and the manual negotiation agent can recover the request text across devices.

### `sealed_users`

```sql
wallet          TEXT PRIMARY KEY
handle          TEXT
display_name    TEXT
email           TEXT
email_verified  BOOLEAN DEFAULT FALSE
telegram_id     TEXT
telegram_handle TEXT
kyc_status      TEXT DEFAULT 'none'      -- none | pending | approved | rejected
kyc_document_url TEXT
member_since    TIMESTAMPTZ
notify_on       TEXT[]                   -- event types to notify
verified_at     TIMESTAMPTZ
```

Profiles display `display_name` and `handle` instead of wallet addresses wherever possible. Add-friend uses username/handle lookup; wallet addresses remain internal identifiers for authorization and Solana instructions.

### `sealed_agent_memory`

```sql
id              UUID PRIMARY KEY
wallet          TEXT NOT NULL
memory_type     TEXT NOT NULL            -- preference | history | reputation | context
content         TEXT NOT NULL
source_deal_id  TEXT
created_at      TIMESTAMPTZ
```

### `sealed_ratings` / `sealed_reputation`

Completed deals can be reviewed with 1-5 stars by the counterparty. Ratings are stored per deal in `sealed_ratings` and reflected immediately in the public aggregate on `sealed_reputation`, which powers profile and invite-page stats.

### `sealed_deliverables`

```sql
id              UUID PRIMARY KEY
deal_id         TEXT NOT NULL
milestone_index INTEGER NOT NULL
submitter_wallet TEXT NOT NULL
storage_key     TEXT NOT NULL            -- path in sealed-docs bucket
filename        TEXT
content_type    TEXT
size_bytes      INTEGER
scan_status     TEXT DEFAULT 'pending'   -- pending | clean | flagged
verified_at     TIMESTAMPTZ
```

### `sealed_agent_templates`

```sql
id              UUID PRIMARY KEY
wallet          TEXT NOT NULL
name            TEXT
deal_types      TEXT[]
negotiation_style TEXT
price_floor_pct NUMERIC                  -- won't accept below X% of asking
auto_approve_if TEXT[]
escalate_after_rounds INTEGER
agent_intro_message TEXT
active          BOOLEAN DEFAULT TRUE
```

### `sealed_reputation`

```sql
wallet          TEXT PRIMARY KEY
deals_as_buyer  INTEGER DEFAULT 0
deals_as_seller INTEGER DEFAULT 0
total_volume    NUMERIC DEFAULT 0
avg_rating      NUMERIC                  -- 1.0 – 5.0
```

### `sealed_ratings`

```sql
id              UUID PRIMARY KEY
deal_id         TEXT NOT NULL
rater_wallet    TEXT NOT NULL
ratee_wallet    TEXT NOT NULL
stars           INTEGER                  -- 1-5
review_text     TEXT
revealed        BOOLEAN DEFAULT FALSE    -- hidden until both parties rate
submitted_at    TIMESTAMPTZ
```

### `sealed_notification_queue`

```sql
id              UUID PRIMARY KEY
recipient_wallet TEXT NOT NULL
channel         TEXT NOT NULL            -- email | telegram
event_type      TEXT NOT NULL
payload         JSONB
status          TEXT DEFAULT 'pending'   -- pending | sent | failed
created_at      TIMESTAMPTZ
sent_at         TIMESTAMPTZ
```

The in-app notification menu does not depend only on this queue. `GET /api/notifications` also synthesizes current notifications from `sealed_deals` so counterparty joined, ready-to-fund, escalated, and review-needed states are visible even when no email or Telegram channel is configured.

### `sealed_friends`

```sql
wallet          TEXT NOT NULL
friend_wallet   TEXT NOT NULL
status          TEXT DEFAULT 'pending'   -- pending | accepted | blocked
created_at      TIMESTAMPTZ
PRIMARY KEY (wallet, friend_wallet)
```

---

## 6. Smart Contract Accounts & Instructions

### Accounts

#### Deal PDA
**Seeds:** `["deal", deal_id]`

```rust
pub struct Deal {
    pub deal_id: String,              // max 32 chars
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub mint: Pubkey,                 // USDC mint
    pub escrow_token_account: Pubkey, // PDA-owned vault
    pub total_amount: u64,            // in USDC lamports
    pub funded_amount: u64,
    pub released_amount: u64,
    pub status: DealStatus,           // Created|Funded|InProgress|Completed|Refunded|Disputed
    pub milestones: Vec<Milestone>,   // max 10
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
}
```

#### Milestone

```rust
pub struct Milestone {
    pub description: String,          // max 128 chars
    pub amount: u64,
    pub status: MilestoneStatus,      // Pending|Completed|Released
    pub confirmed_by: Option<Pubkey>,
    pub confirmed_at: Option<i64>,
}
```

#### Escrow Vault
**Seeds:** `["escrow-vault", deal_id]`  
PDA-owned SPL token account. Holds USDC for the duration of the deal.

#### Reputation PDA
**Seeds:** `["reputation", wallet]`

```rust
pub struct Reputation {
    pub wallet: Pubkey,
    pub deals_as_buyer: u32,
    pub deals_as_seller: u32,
    pub total_volume: u64,
    pub bump: u8,
}
```

### Instructions

#### `create_deal`

**Signer:** Buyer  
**Params:** `deal_id: String`, `milestones: Vec<MilestoneInput>`, `total_amount: u64`  
**Validation:**
- `milestones.sum() == total_amount`
- `milestones.len() <= 10`
- `deal_id.len() <= 32`

**Effect:** Initializes Deal PDA, sets status to `Created`, all milestones `Pending`.

---

#### `fund_escrow`

**Signer:** Buyer  
**Params:** `amount: u64`  
**Validation:**
- Deal status: `Created` or `Funded`
- `funded_amount + amount <= total_amount`

**Effect:** Transfers USDC from buyer's token account → escrow vault. Sets status to `Funded` when fully funded.

---

#### `release_milestone`

**Signer:** Buyer  
**Params:** `milestone_index: u8`  
**Validation:**
- Deal status: `Funded` or `InProgress`
- Milestone exists and is `Pending`

**Effect:** Transfers milestone amount from escrow vault → seller's token account (using Deal PDA as signer). Updates milestone to `Released`. Sets deal to `InProgress` or `Completed`.

---

#### `refund`

**Signers:** Buyer AND Seller (both required)  
**Params:** None  
**Validation:**
- Deal status: not `Completed` or `Refunded`
- Remaining balance > 0 (`funded_amount - released_amount`)

**Effect:** Transfers remaining escrow balance → buyer. Sets deal status to `Refunded`.

---

### Error Codes

| Code | Meaning |
|---|---|
| `DealIdTooLong` | deal_id exceeds 32 chars |
| `TooManyMilestones` | More than 10 milestones |
| `MilestoneAmountMismatch` | Milestone sum ≠ total_amount |
| `InvalidDealStatus` | Instruction called in wrong state |
| `InvalidMilestoneIndex` | Milestone index out of bounds |
| `InvalidMilestoneStatus` | Milestone already released |
| `InsufficientFunds` | Escrow balance too low |
| `UnauthorizedBuyer` | Caller is not the deal's buyer |
| `UnauthorizedSeller` | Caller is not the deal's seller |
| `OverFunding` | Would exceed total_amount |

---

## 7. API Reference

### Deal Routes

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/deals/mirror` | `x-wallet` | List all deals for wallet |
| POST | `/api/deals/mirror` | `x-wallet` (buyer) | Create or update deal mirror |
| GET | `/api/deals/[dealId]` | — | Fetch single deal |
| PATCH | `/api/deals/[dealId]` | `x-wallet` (buyer or seller) | Update deal fields |

### AI Agent Routes

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/agent` | `x-wallet` (optional) | Structuring agent chat |
| POST | `/api/negotiate` | `x-wallet` (optional) | Multi-turn negotiation |
| POST | `/api/verify-milestone` | — | Verify milestone proof |

### Messaging

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/messages?deal_id=X` | — | Fetch messages for deal |
| POST | `/api/messages` | — | Insert message |

### User & KYC

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/users/[wallet]/public` | — | Public profile + stats |
| POST | `/api/kyc/submit` | `x-wallet` | Submit KYC document |
| POST | `/api/users/email/verify` | `x-wallet` | Verify email OTP |
| GET | `/api/admin/kyc` | `ADMIN_WALLETS` | List pending KYC |

### Friends & Ratings

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/friends` | `x-wallet` | List friends |
| GET | `/api/friends/[wallet]` | `x-wallet` | Single friend relationship |
| POST | `/api/ratings` | `x-wallet` | Submit deal rating |

### Notifications & Files

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/notifications` | `x-wallet` | In-app notification menu from deal context + queue rows |
| POST | `/api/notify/process` | `CRON_SECRET` | Process notification queue |
| POST | `/api/upload` | `x-wallet` | Upload deliverable file |
| GET | `/api/upload/signed` | `x-wallet` | Get signed download URL |

### Request Headers (AI Routes)

| Header | Purpose |
|---|---|
| `x-wallet` | Caller's Solana wallet address |
| `x-llm-provider` | Override LLM provider (`anthropic`, `openai`, `groq`, `gemini`, `openrouter`) |
| `x-llm-model` | Override model name |
| `x-llm-key` | Override API key (user-supplied, not logged) |

---

## 8. AI Agent Design

### System Prompts

**Structuring Agent** (`agents/prompts/negotiator.ts` — structuring role)
- Persona: neutral deal assistant
- Goal: extract structured deal parameters from natural language
- Output format: JSON with `{ deal_id, title, description, total_amount_usdc, milestones[] }`
- Partial output allowed if user hasn't provided all fields

**Negotiation Agent** (`agents/prompts/negotiator.ts` — negotiation role)
- Represents either buyer or seller
- Receives: party's boundaries, current proposal, prior rounds
- May receive: human `renegotiationRequest` from the renegotiation dialog
- Output: counter-proposal or acceptance signal
- Terminates when: agreement reached, or max rounds exceeded

**Verifier Agent** (`agents/prompts/verifier.ts`)
- Receives: milestone description + proof (image/URL/text)
- Output: `{ score: 0-100, decision: "approve"|"reject", reasoning: string }`
- Can parse base64-encoded images (multimodal)

### Agent Memory

Stored per wallet in `sealed_agent_memory`. Loaded at the start of each `/api/agent` call.

```
wallet
  ├── preference: "prefers milestone-based deals"
  ├── history: "completed 3 deals in 2025"
  ├── reputation: "avg 4.8 stars as seller"
  └── context: "currently negotiating deal XYZ"
```

### Agent Templates (Seller-Side)

Sellers can configure an automated negotiating agent via `sealed_agent_templates`:
- `price_floor_pct` — won't accept below X% of their asking price
- `negotiation_style` — e.g., "firm", "collaborative", "quick-close"
- `auto_approve_if` — conditions under which to auto-agree
- `escalate_after_rounds` — hand off to human after N rounds

LLM provider/model configuration lives in Agent Setup next to these templates, because provider choice directly changes agent behavior.

---

## 9. Security Model

### On-Chain Security (Solana)

| Property | Mechanism |
|---|---|
| Funds custody | PDA-owned escrow vault — no private key, only program can sign |
| Buyer auth | `has_one = buyer` constraint on release_milestone and fund_escrow |
| Dual-sign refund | Both buyer and seller must sign `refund` |
| Overfunding prevention | `funded_amount + amount <= total_amount` check |
| Double-release prevention | Milestone status checked: must be `Pending` to release |
| No rug pull | `release_milestone` can only transfer to the deal's registered seller |
| Funding precheck | Frontend checks buyer USDC balance before building `fund_escrow`; on-chain program remains authoritative |

### API / Off-Chain Security

| Property | Status |
|---|---|
| Service-role key is server-only | Service role key never sent to browser |
| Wallet-based auth | Routes validate `x-wallet` against resource ownership |
| Seller join protection | `seller_wallet` cannot be overwritten once set |
| KYC admin auth | `/admin/*` routes check `ADMIN_WALLETS` env var |
| Cron auth | `/api/notify/process` requires `CRON_SECRET` bearer token |
| OTP generation | Uses `crypto.randomInt` (cryptographically secure) |
| File uploads | Magic byte validation, EXIF stripping, PDF parse check |
| Reputation updates | Atomic RPC (`increment_deal_count`) prevents race conditions |

### Profile Trust UI

The self-profile page surfaces public rating aggregates from `sealed_reputation` / `sealed_ratings` and shows a verified-account banner when `PublicProfile.is_verified` is false. Verification is a trust signal and template-limit unlock; it does not grant authority over escrow funds.

Generated invite handles may stay unique in `sealed_users.handle`, but UI surfaces normalize display handles by hiding the generated suffix. Username lookup still resolves the stored unique handle.

### Known Limitations (Future Hardening)

- `x-wallet` header is not cryptographically signed — future: require wallet-signed challenge
- Messages API has no authorization — any caller can read any deal's chat
- Verifier agent output is advisory only — buyer controls release

---

## 10. Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_RPC_URL` | Yes | Solana RPC endpoint |
| `NEXT_PUBLIC_USDC_MINT` | Yes | USDC token mint address |
| `NEXT_PUBLIC_PROGRAM_ID` | Yes | Anchor escrow program ID |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key (client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role (server only) |
| `OPENAI_API_KEY` | Either/or | OpenAI API key for server-side fallback |
| `OPENAI_MODEL` | No | Override OpenAI model |
| `ANTHROPIC_API_KEY` | Either/or | Claude API key |
| `ANTHROPIC_MODEL` | No | Override Anthropic model |
| `OPENROUTER_API_KEY` | Either/or | OpenRouter API key for server-side fallback |
| `OPENROUTER_MODEL` | No | Override OpenRouter model |
| `ADMIN_WALLETS` | Yes | CSV of admin wallet addresses |
| `CRON_SECRET` | Yes | Vercel cron job auth secret |

---

## 11. Key Design Decisions

### Why Solana?
Fast finality (~400ms), sub-cent transaction fees, and native USDC support via SPL tokens. Ideal for frequent milestone-based micropayments.

### Why Milestone-Based Escrow?
Reduces risk for both parties. Buyer doesn't lock up 100% of funds upfront. Seller gets incremental payment as work progresses.

### Why Not Auto-Release?
Trust requires human control. The AI verifier can be wrong. Final payment release always needs the buyer's explicit Solana transaction signature — this is a non-negotiable design constraint.

### Why Supabase for Off-Chain?
Real-time capabilities, easy storage buckets, and Postgres row-level security. Chat logs, KYC documents, and notifications have no reason to live on-chain and benefit from SQL queries.

### Why Multi-Provider LLM?
Operator flexibility. Different deployments can use different LLMs. Users can even bring their own API key for the negotiation agent, avoiding cost to the platform.

### Why Mirror Pattern?
The frontend calls `/api/deals/mirror` after every on-chain transaction to sync deal state to Supabase. This decouples the UI's read path (fast Supabase queries) from on-chain state without building a full indexer. The on-chain program remains the authoritative source of truth.

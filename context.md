# Sealed Agent — Project Context

A single-page orientation for anyone landing on this repo cold: collaborator, judge, or AI session. For the marketing-style intro see `README.md`. For agent-engineering details see `CLAUDE.md` and `ARCHITECTURE.md`.

---

## What it is

AI-powered escrow on Solana. Two business owners describe a deal in plain language; three agents (Structurer, Negotiator, Verifier) take it from chat to signed milestones. Funds lock in USDC on-chain. Release requires explicit buyer confirmation; refunds require both sides to sign.

Pitch line: **"Don't trust promises. Seal the deal."**

---

## Status

| | |
|---|---|
| **MVP** | Shipped — web3 mode live |
| **Live demo** | https://sealed-nine.vercel.app (Solana devnet) |
| **Smart contract** | Deployed to devnet — `3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ` |
| **Repo** | https://github.com/Toderr/sealed |
| **Hackathon** | Colosseum submission, 4-week build window |

Web2 wrapper (social wallet + fiat ramps so non-crypto business owners never see a seed phrase) is scoped for Q2 2026.

---

## Team

| | Role | Background |
|---|---|---|
| **Efunderf** (`@efunderf`) | Founder | 4+ years digital marketing, ex Marketing Agency CCO. Shipped a self-learning DLMM trading agent on Solana. |
| **Edkesuma** (`@edkesuma`) | Co-founder | AI Full Stack Engineer @ Covena. 3× hackathon winner in Singapore. |
| **Friday7th** (`@Friday_SOL`) | Advisor | 19-year track record across financial markets and marketplaces. Direct line to the target customer segment. |

---

## Architecture at a glance

**On-chain (Anchor program at `programs/escrow/`):**
- `Deal` PDA — `seeds = [b"deal", deal_id]`
- `EscrowVault` PDA — token account for USDC
- Instructions: `create_deal`, `fund_escrow`, `release_milestone`, `refund`
- Refund is mutual (2-sig partial-sign handoff). Release is buyer-only.

**Frontend (Next.js 16 in `app/`):**
- App Router, Turbopack, TypeScript, Tailwind v4
- Wallet adapter (Wallet Standard) — Phantom / Solflare / Backpack
- Linear-inspired dark design system in `globals.css`
- Dual LLM providers: `OPENROUTER_API_KEY` takes priority over `ANTHROPIC_API_KEY`

**Off-chain (shared workspace InsForge at `app/src/lib/insforge.ts`):**
- Tables: `sealed_deals`, `sealed_messages`, `sealed_agent_memory`, `sealed_deliverables`
- Plus newer tables for ratings, agent templates, KYC, notifications, deal cards
- On-chain stays the source of truth for deal state and fund movement.

**Agents:**
- Role-based (not class-based). New roles = prompt + tool allowlist.
- Structurer → Negotiator ↔ Negotiator → Verifier → release / refund.

---

## Directory map

```
sealed/
├── app/                      Next.js frontend
│   └── src/
│       ├── app/              App Router routes (incl. /onboarding, /profile, /deals/[id]/review, /invite/[token])
│       ├── components/       UI (Header, ChatInterface, DealDashboard, DealDetail, NegotiationView, …)
│       └── lib/              types.ts, escrow-client.ts, insforge.ts, sealed-users.ts, reputation.ts, agent-template-store.ts, …
├── programs/escrow/          Anchor program (Rust)
├── Sealed Deck.html          9-slide pitch deck (1920×1080)
├── Sealed Deck.pdf           Rendered deck export
├── PITCH_DECK.md             Markdown pitch doc + 3-min video script
├── DECK_BRIEF.md             Visual brief that drives Sealed Deck.html
├── README.md                 Public-facing intro
├── CLAUDE.md                 Project-level AI agent instructions
├── ARCHITECTURE.md           Agent + data model design
├── DEMO.md                   Hackathon demo script
└── .superstack/build-context.md   Live build state
```

---

## Run locally

```bash
# Frontend (works natively on Windows)
cd app
npm install
npm run dev      # http://localhost:3000

# Smart contract (requires WSL on Windows)
anchor build
anchor test
anchor deploy
```

Required env in `app/.env.local`:
- `ANTHROPIC_API_KEY` *or* `OPENROUTER_API_KEY` — agent LLM
- `INSFORGE_URL` + `INSFORGE_ACCESS_API_KEY` — off-chain context store

---

## Recent decisions

- Refund requires buyer **and** seller signatures — no unilateral fund movement.
- Milestone release stays buyer-only (buyer is the one who saw the work).
- Dual-mode product surface: Agent Template flow + Escrow-only fallback.
- Agent Template + Reputation + Deal Review + Document Upload + Notifications + Deal Share Card shipped together (commit `385d30e`).
- Friday7th repositioned from co-founder to advisor — operator support, not day-to-day execution.

---

## Pitch deck

`Sealed Deck.html` is the source. PDF is regenerated from screenshots (Playwright → JPEG → pdf-lib) to keep the file ~1 MB. Re-render workflow:

1. Edit `Sealed Deck.html`.
2. Run a Playwright script that visits each `#sN` slide at 1920×1080, JPEG-screenshots it, and assembles the pages with `pdf-lib`.
3. Output: `Sealed Deck.pdf` (~1 MB).

---

*Last updated: 2026-04-29.*

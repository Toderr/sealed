# Build Context — Live

## Stack
- **smart_contract**: Anchor 0.30.1, Rust, Solana CLI 2.2.7
- **frontend**: Next.js 16 (App Router, Turbopack), TypeScript, Tailwind CSS v4
- **ai_agent**: Claude API (@anthropic-ai/sdk) — Anthropic direct OR OpenRouter
- **wallet**: Wallet Standard (@solana/wallet-adapter-react)
- **rpc**: Solana devnet (upgrade to Helius for production)
- **stablecoin**: USDC (SPL Token)
- **skills_installed**: solana-dev, debug-program, review-and-iterate, ui-ux-pro-max
- **mcps_configured**: none yet (add helius-mcp when ready)

## Architecture
- **pattern**: Next.js + Anchor dApp (hybrid with AI agent)
- **program_accounts**: Deal (PDA), EscrowVault (PDA token account), Reputation (PDA, not yet wired)
- **instructions**: create_deal, fund_escrow, release_milestone, refund
- **agent_roles**: Structurer, Negotiator, Verifier (role-based; Scout roles future-stubbed per ARCHITECTURE.md)
- **agent_flow**: User chat → Structurer → structured deal → Negotiator ↔ Negotiator rounds → on-chain create_deal → fund → Verifier reviews proof → release_milestone (buyer) or refund (2-sig)

## Build Status
- **mvp_complete**: true
- **tests_passing**: true
- **devnet_deployed**: true

## Milestones Completed
1. [x] TypeScript types matching smart contract state (`app/src/lib/types.ts`)
2. [x] App shell with header, tab nav, wallet connect (`Header.tsx`, `layout.tsx`)
3. [x] AI chat interface with deal parsing (`ChatInterface.tsx`)
4. [x] Deal dashboard with status badges & progress bars (`DealDashboard.tsx`)
5. [x] Deal detail view with milestone timeline (`DealDetail.tsx`)
6. [x] Escrow client with PDA derivation & Borsh instruction builders (`escrow-client.ts`)
7. [x] Anchor program deployed to devnet (`3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ`)
8. [x] Business memory per wallet + Settings modal (`memory/`, `SettingsModal.tsx`)
9. [x] Dual-agent negotiation engine with pros/cons/risk summary (`negotiation/engine.ts`, `NegotiationView.tsx`)
10. [x] Milestone proof upload + AI Verifier review (`api/verify-milestone`, proof UI in `DealDetail.tsx`)
11. [x] Linear-inspired design system refresh across all surfaces (`globals.css`, all components)
12. [x] Mutual refund with 2-sig partial-sign handoff (`lib/refund-handoff.ts`, `RefundPanel` in `DealDetail.tsx`)
13. [x] Top-level `README.md` + `DEMO.md` demo script

## Decisions
- Refund requires both buyer AND seller signatures (mutual agreement)
- Milestone release is buyer-only (buyer confirms delivery)
- Max 10 milestones per deal
- Deal ID max 32 chars
- Reputation is per-wallet, counts completed deals (on-chain PDA stubbed; currently tracked in BusinessMemory)
- Windows dev: frontend native, smart contract via WSL
- On-chain transactions gated behind `ON_CHAIN_ENABLED` flag in `page.tsx`
- Using raw instruction builders instead of Anchor Program class (avoids TS deep instantiation errors)
- Linear design system codified in `globals.css` via `@theme inline` bridge — Inter Variable (cv01+ss03), weight 510 emphasis, luminance-stepped elevation via rgba, `--shadow-dialog` for modals
- 2-sig refund uses `Transaction.serialize({ requireAllSignatures: false })` + cross-wallet localStorage slot (`sealed:refund-handoffs`) for same-browser demo handoff; cross-browser uses paste-blob fallback
- Dual LLM providers supported — `OPENROUTER_API_KEY` takes priority over `ANTHROPIC_API_KEY` when both set
- Role-based agent engine (not class-based) so future Scout roles = prompt + tool allowlist, not engine rewrite (see `ARCHITECTURE.md`)

## Now
Source of truth for current state:
- **`DEMO.md`** — step-by-step hackathon demo walkthrough
- **`PITCH_DECK.md`** — Colosseum submission pitch (10 slides + 3-min video script)
- **`DECK_BRIEF.md`** — structured input for claude.ai/design to render the visual deck
- **`ARCHITECTURE.md`** — agent system + data model + forward-compat Scout design

Remaining before submission: team bios in Slide 9, contact email + Vercel URL in Slide 10, screenshot grid for Slide 4, video uploads, track selection.

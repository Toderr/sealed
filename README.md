# Sealed

**AI agent for autonomous B2B deal execution on Solana.**

Businesses describe a deal in plain language. An AI agent structures it into milestones, negotiates on behalf of both parties, locks USDC into an on-chain escrow, reviews the seller's proof of delivery, and releases payment — without banks, lawyers, or manual coordination.

Built for the Colosseum hackathon. Target users: Indonesian pengusaha who want crypto's settlement guarantees without the crypto UX.

---

## Why this exists

Cross-border B2B deals run on trust infrastructure — banks, lawyers, escrow agents — that is slow, expensive, and inaccessible for mid-market business owners in emerging markets. Stablecoin escrow solves the money rail. But raw on-chain tooling is unusable for the people who actually sign these deals.

Sealed closes that gap with an AI agent layer on top: the user talks to the agent, the agent handles the chain.

Message: **"Trust infrastructure, not crypto."**

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js 16 app (app/)                                       │
│                                                              │
│   ChatInterface ──► /api/agent (Structurer)                  │
│                     └─ parses NL → DealParams                │
│                                                              │
│   NegotiationView ► /api/negotiate (Negotiator ↔ Negotiator) │
│                     └─ multi-round counter-offers + summary  │
│                                                              │
│   DealDetail     ──► /api/verify-milestone (Verifier)        │
│                     └─ reviews proof, scores confidence      │
│                                                              │
│   DealDetail     ──► escrow-client.ts                        │
│                     ├─ create_deal, fund_escrow              │
│                     ├─ release_milestone                     │
│                     └─ refund (2-sig partial-sign handoff)   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼  Solana devnet
┌─────────────────────────────────────────────────────────────┐
│  Anchor program: escrow (programs/escrow/)                   │
│  Program ID: 3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ    │
│                                                              │
│   Deal PDA          [b"deal", deal_id]                       │
│   Escrow Vault PDA  [b"escrow-vault", deal_id]  (holds USDC) │
│                                                              │
│   create_deal ─► Created                                     │
│   fund_escrow ─► Funded                                      │
│   release_milestone (buyer sig) ─► Completed when last paid  │
│   refund (buyer + seller sigs)  ─► Refunded                  │
└─────────────────────────────────────────────────────────────┘
```

Agents are role-based (`Structurer`, `Negotiator`, `Verifier`) sharing one engine — prompt template + tool allowlist per role. Adding future roles (Scout agents that discover counter-parties) is a prompt + tool registration, not an engine rewrite. Full design in [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Repo layout

```
sealed/
├── app/                         Next.js 16 frontend + agent API routes
│   ├── src/
│   │   ├── app/                 Router pages + /api/{agent,negotiate,verify-milestone}
│   │   ├── components/          Chat, dashboard, deal detail, negotiation, settings
│   │   ├── agents/              Role types + prompt templates
│   │   ├── negotiation/         Multi-round engine + summarizer
│   │   ├── memory/              BusinessMemory store (localStorage → Supabase later)
│   │   └── lib/
│   │       ├── escrow-client.ts     Anchor tx builders (create, fund, release, refund)
│   │       ├── refund-handoff.ts    Cross-wallet partial-sign handoff store
│   │       ├── deals-store.ts       Per-wallet deal index (localStorage)
│   │       └── types.ts             Deal, DealStatus, USDC constants
│   └── .env.example
├── programs/escrow/             Anchor program — Rust
│   └── src/
│       ├── lib.rs               create_deal | fund_escrow | release_milestone | refund
│       ├── state.rs             Deal, Milestone, DealStatus, Reputation
│       ├── instructions/        Per-ix handlers + accounts contexts
│       └── error.rs
├── tests/                       Anchor integration tests
├── scripts/                     Deploy + devnet helpers
├── Anchor.toml                  Cluster = devnet
├── ARCHITECTURE.md              Forward-compat agent system + data model
├── PITCH_DECK.md                Colosseum submission pitch
└── DEMO.md                      Step-by-step demo script
```

---

## Tech stack

- **Frontend**: Next.js 16 (Turbopack), React 19, Tailwind v4, Linear-inspired design system
- **Wallet**: `@solana/wallet-adapter` — Phantom / Solflare / Backpack
- **Chain**: Solana devnet, Anchor 0.30, USDC SPL token
- **AI**: Claude (Anthropic direct or via OpenRouter)
- **State**: per-wallet localStorage for deals + BusinessMemory; no backend needed for MVP

---

## Setup

### 1. Clone + install

```bash
git clone https://github.com/Toderr/sealed.git
cd sealed/app
npm install
```

### 2. Environment

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_RPC_URL` | Solana devnet RPC. Free tier fine; Helius recommended for demos. |
| `NEXT_PUBLIC_PROGRAM_ID` | `3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ` (already deployed on devnet). |
| `NEXT_PUBLIC_USDC_MINT` | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (devnet USDC). |
| `ANTHROPIC_API_KEY` | Claude API key. **Or** use OpenRouter below. |
| `OPENROUTER_API_KEY` + `OPENROUTER_MODEL` | Alternative to Anthropic direct. If set, takes priority. |

### 3. Run

```bash
npm run dev          # http://localhost:3000
npm run lint         # ESLint
npx tsc --noEmit     # Typecheck
```

### 4. Wallet + devnet USDC

- Install Phantom or Solflare, switch to **Devnet**.
- Airdrop SOL: `solana airdrop 2 <your-pubkey> --url devnet`
- Get devnet USDC from [Circle's faucet](https://faucet.circle.com/) (pick Solana devnet, paste address).

### 5. Rebuild + redeploy the program (optional)

The program is already deployed to devnet. To rebuild:

```bash
# Requires WSL on Windows — Anchor CLI doesn't run natively
anchor build
anchor deploy
```

Program ID is pinned in `Anchor.toml` and `NEXT_PUBLIC_PROGRAM_ID`; redeploy preserves the ID as long as the keypair in `target/deploy/escrow-keypair.json` is unchanged.

---

## Key features

- **Plain-language deal intake** — the Structurer agent parses `"build landing page for 500 USDC in 3 milestones"` into a `DealParams` with description, amount, and milestone breakdown.
- **Dual-agent negotiation** — both buyer and seller get their own Negotiator with BusinessMemory (deal history, red-lines, negotiation style). The engine runs counter-offers until agreement, then produces a pros/cons/risks summary.
- **On-chain milestone escrow** — USDC locked in a PDA-owned vault; buyer releases per milestone. Each release is one signature, one tx.
- **AI milestone verification** — seller uploads proof (file hash / URL / oracle ref), Verifier scores confidence and recommends approve / reject / request-clarification. Buyer retains final authority.
- **Mutual refund with 2-sig handoff** — because a browser wallet only holds one key, the refund ceremony splits in two: initiator partial-signs and exports a base64 blob; counter-party imports, co-signs, broadcasts. Same-browser demos hand off automatically via `refund-handoff.ts`; cross-browser pairs paste the blob manually.
- **Pre-funding cancel** — if no USDC has been escrowed, either party cancels locally without touching the chain.
- **Reputation-ready** — Anchor state already has a `Reputation` account shape; completed-deals counter is tracked in local BusinessMemory and portable to the PDA when we launch the on-chain version.

---

## Hackathon demo

See **[DEMO.md](./DEMO.md)** for the step-by-step walkthrough covering the full deal lifecycle (chat → negotiate → fund → proof → release → completed) plus the mutual-refund path.

---

## Roadmap after hackathon

1. **Scout agents** — `PurchasingScout` and `SalesScout` roles that discover counter-parties from a shared listings registry. Agent-to-agent matching before any human is involved.
2. **On-chain reputation** — move the completed-deals counter into the `Reputation` PDA. Portable, composable, permissionless.
3. **Supabase backend** — swap `LocalStorageMemoryStore` for `SupabaseMemoryStore` (same interface) to enable cross-device state + listings discovery.
4. **Dispute resolution** — third-party arbiter role for the `Disputed` status path.
5. **Multi-currency** — IDR stablecoin and native IDR on/off ramps for the pengusaha market.

---

## License

MIT.

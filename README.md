# Sealed

**AI escrow for business deals. Any currency. Any chain.**

Businesses describe a deal in plain language. Three AI agents structure it, negotiate terms on behalf of both parties, lock funds into an on-chain Solana escrow, review proof of delivery, and release payment. No banks, no lawyers, no manual coordination.

Built for the Colosseum hackathon. Designed for any business that still closes deals on a handshake, whether or not they've ever touched crypto.

---

## Why this exists

Business deals break. Both sides lose.

- **Web2.** Freelancers lost `$15B` to non-payment in 2025. **58%** face unpaid invoices. **79%** of companies were targeted by payment fraud in 2024. *(Flexable 2025 Freelance Payment Report.)*
- **Web3.** Crypto scams took `$17B` in 2025. Impersonation fraud up **1,400%**. AI-enabled scams are 4.5x more profitable than traditional ones. *(Chainalysis 2026 Crypto Crime Report.)*

Two different worlds. One root cause: no enforceable deal layer.

Sealed closes that gap. An AI agent layer on top of Solana escrow gives any two parties a deal table that enforces itself. The chain guarantees settlement; the agents handle structuring, negotiation, and delivery verification.

Message: **"People break promises. Code doesn't."**

---

## Who it's for

Two modes, one product.

**Web2 mode (primary onboarding).** For businesses that don't hold crypto and don't want to. Email / Google login via social wallet. Pay in local currency (IDR, USD, more) with auto on/off-ramp through Xendit, MoonPay, Transak. USDC and Solana are invisible plumbing. Users see a deal table, not a blockchain.

**Web3 mode (power users).** For teams that already hold stablecoin. Bring your own wallet, skip the ramp fees, settle directly in USDC on Solana.

Shipped today: the web3 mode. Web2 wrapper (social wallet + fiat ramps) lands in Q2 2026 (see Roadmap).

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

Agents are role-based (`Structurer`, `Negotiator`, `Verifier`) sharing one engine. Each role gets its own prompt template and tool allowlist. Adding future roles (Scout agents that discover counter-parties) is a prompt + tool registration, not an engine rewrite. Full design in [ARCHITECTURE.md](./ARCHITECTURE.md).

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
├── programs/escrow/             Anchor program (Rust)
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
├── DECK_BRIEF.md                Structured brief for claude.ai/design
└── DEMO.md                      Step-by-step demo script
```

---

## Tech stack

- **Frontend**: Next.js 16 (Turbopack), React 19, Tailwind v4, Linear-inspired design system
- **Wallet (web3 mode)**: `@solana/wallet-adapter` (Phantom, Solflare, Backpack)
- **Wallet (web2 mode, upcoming)**: Privy or Turnkey social wallet (email / Google login)
- **Fiat ramps (upcoming)**: Xendit / Midtrans (IDR), MoonPay / Transak (global)
- **Chain**: Solana devnet, Anchor 0.30, USDC SPL token
- **AI**: Claude (Anthropic direct or via OpenRouter). BYO-key supported.
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

### 4. Wallet + devnet USDC (web3 mode today)

- Install Phantom or Solflare, switch to **Devnet**.
- Airdrop SOL: `solana airdrop 2 <your-pubkey> --url devnet`
- Get devnet USDC from [Circle's faucet](https://faucet.circle.com/) (pick Solana devnet, paste address).

### 5. Rebuild + redeploy the program (optional)

The program is already deployed to devnet. To rebuild:

```bash
# Requires WSL on Windows. Anchor CLI doesn't run natively.
anchor build
anchor deploy
```

Program ID is pinned in `Anchor.toml` and `NEXT_PUBLIC_PROGRAM_ID`; redeploy preserves the ID as long as the keypair in `target/deploy/escrow-keypair.json` is unchanged.

---

## Key features

- **Plain-language deal intake**: the Structurer agent parses `"build landing page for 500 USDC in 3 milestones"` into a `DealParams` with description, amount, and milestone breakdown.
- **Dual-agent negotiation**: both buyer and seller get their own Negotiator with BusinessMemory (deal history, red-lines, negotiation style). The engine runs counter-offers until agreement, then produces a pros/cons/risks summary.
- **On-chain milestone escrow**: USDC locked in a PDA-owned vault; buyer releases per milestone. Each release is one signature, one tx.
- **AI milestone verification**: seller uploads proof (file hash, URL, oracle ref), Verifier scores confidence and recommends approve / reject / request-clarification. Buyer retains final authority.
- **Mutual refund with 2-sig handoff**: because a browser wallet only holds one key, the refund ceremony splits in two. The initiator partial-signs and exports a base64 blob, the counter-party imports, co-signs, and broadcasts. Same-browser demos hand off automatically via `refund-handoff.ts`; cross-browser pairs paste the blob manually.
- **Pre-funding cancel**: if no USDC has been escrowed, either party cancels locally without touching the chain.
- **Reputation-ready**: Anchor state already has a `Reputation` account shape. The completed-deals counter is tracked in local BusinessMemory and portable to the PDA when we launch the on-chain version.

---

## Pricing

| Stream | Price | Note |
|---|---|---|
| **Platform fee** | `1%` of deal value | Covers compute + infra from deal one |
| **Premium AI** | `$53.90`/mo | BYO LLM key (Anthropic, OpenAI, OpenRouter) or use ours |
| **Verified merchant** | `$100` one-time | Trust badge + premium placement |

---

## Hackathon demo

See **[DEMO.md](./DEMO.md)** for the step-by-step walkthrough covering the full deal lifecycle (chat → negotiate → fund → proof → release → completed) plus the mutual-refund path.

---

## Roadmap after hackathon

1. **Web2 wrapper (Q2 2026)**: social wallet via Privy or Turnkey (email / Google login, no seed phrases) + fiat on/off-ramp via Xendit, MoonPay, Transak. USDC becomes invisible plumbing.
2. **Dispute resolution (Q3 2026)**: optional third-party arbiter role for the `Disputed` status path.
3. **Cross-border escrow (Q4 2026)**: multi-currency stablecoin routing, IDR stablecoin + native IDR on/off ramps.
4. **Portable reputation (2027)**: move the completed-deals counter into the `Reputation` PDA. Portable, composable, permissionless. Potentially as NFT.
5. **Scout agents**: `PurchasingScout` and `SalesScout` roles that discover counter-parties from a shared listings registry. Agent-to-agent matching before any human is involved.
6. **Supabase backend**: swap `LocalStorageMemoryStore` for `SupabaseMemoryStore` (same interface) to enable cross-device state + listings discovery.

---

## License

MIT.

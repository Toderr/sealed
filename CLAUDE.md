# Sealed: AI-Powered Escrow on Solana

## Project Overview
AI agent that represents businesses on an on-chain deal table. It negotiates deal terms, manages escrow, and verifies deliverables on Solana. Payment release requires the buyer to sign the transaction — the AI verifies milestone completion and recommends release, but the final decision and signing always stays with the buyer.

Each user has their own rating built from their past deals, reflecting their credibility as a counterparty. Ratings are stored in `sealed_reputation` (aggregates) and `sealed_ratings` (per-deal), and the on-chain `Reputation` PDA serves as the tamper-proof anchor for this score.

## Architecture
- **Smart Contract**: Anchor program in `programs/escrow/`. Milestone-based escrow with USDC.
- **Frontend**: Next.js app in `app/`. Deal dashboard + AI chat interface.
- **AI Agent**: Claude API via Next.js API route. Parses natural language into structured deal params.

## Key Commands

### Frontend (app/)
```bash
cd app && npm run dev          # Start dev server (http://localhost:3000)
cd app && npm run build        # Production build
cd app && npm run lint         # Run ESLint
```

### Smart Contract (requires WSL on Windows)
```bash
anchor build                   # Build program
anchor test                    # Run tests
anchor deploy                  # Deploy to devnet
solana program deploy target/deploy/escrow.so  # Manual deploy
```

## Smart Contract Accounts
- **Deal** PDA: `seeds = [b"deal", deal_id.as_bytes()]`
- **Escrow Vault** PDA: `seeds = [b"escrow-vault", deal_id.as_bytes()]`
- **Reputation** PDA: `seeds = [b"reputation", wallet.as_bytes()]` (TODO)

## USDC Addresses
- Devnet: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- Mainnet: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`

## Development Notes
- Windows: Use WSL Ubuntu for `anchor build` and `anchor test`
- Frontend works natively on Windows
- Wallet adapter auto-detects Phantom, Solflare, Backpack
- AI agent uses Claude API. Set ANTHROPIC_API_KEY in app/.env.local.

## Off-Chain Storage: Supabase

Sealed uses Supabase for off-chain context only. On-chain remains the source of truth for deal state, escrow balances, and fund movement.

- **Client**: `app/src/lib/supabase.ts` exports `supabase` (service-role client) and `table(name)` helper. Project prefix is `sealed`.
- **Schema**: `app/src/lib/supabase-schema.sql` — 9 tables. Apply via the Supabase SQL editor.
- **Storage buckets**: `sealed-docs` (deliverable files) and `sealed-kyc` (KYC documents). Both private. Create in Supabase Storage dashboard.
- **Env vars** (in `app/.env.local`):
  - `NEXT_PUBLIC_SUPABASE_URL` — Project URL from Supabase Settings → API
  - `SUPABASE_SERVICE_ROLE_KEY` — service_role key (server-only, never expose to client)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon key

### What goes off-chain
| Table | Purpose |
|---|---|
| `sealed_deals` | Human-readable deal mirror (on-chain deal_id is the join key) |
| `sealed_messages` | AI agent chat transcripts per deal |
| `sealed_agent_memory` | Long-term per-wallet agent learnings |
| `sealed_deliverables` | File metadata; bytes in `sealed-docs` bucket |
| `sealed_users` | User profiles, handles, email, KYC status |
| `sealed_agent_templates` | Per-wallet agent configuration |
| `sealed_reputation` | Deal counts and rating aggregates |
| `sealed_ratings` | Per-deal star ratings (hidden until both parties rate) |
| `sealed_notification_queue` | Email/Telegram dispatch queue |

### What stays on-chain
Escrow balances, milestone release, refund, dispute state. Never trust Supabase for fund movement.

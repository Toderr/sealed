# Sealed: AI-Powered Autonomous Escrow on Solana

## Project Overview
AI agent that represents businesses on an on-chain deal table. It negotiates, manages escrow, verifies deliverables, and releases payment autonomously on Solana.

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

## Off-Chain Storage: InsForge

Sealed uses the shared workspace InsForge stack for off-chain context only. On-chain remains the source of truth for deal state, escrow balances, and fund movement.

- **Client**: `app/src/lib/insforge.ts` exports `insforge` (SDK client) and `table(name)` helper. Project prefix is `sealed`.
- **Schema**: `app/src/lib/insforge-schema.sql`. Four tables: `sealed_deals`, `sealed_messages`, `sealed_agent_memory`, `sealed_deliverables`.
- **Env vars** (in `app/.env.local`):
  - `INSFORGE_URL=http://localhost:7130`
  - `INSFORGE_ACCESS_API_KEY=ik_...` (copy from `E:/Claude Code/insforge/.env`)

### Apply or update schema
```bash
docker exec -i insforge-postgres-1 psql -U postgres -d insforge < app/src/lib/insforge-schema.sql
```

### What goes off-chain
- AI chat transcripts for a deal (`sealed_messages`)
- Agent memory across deals per wallet (`sealed_agent_memory`)
- Deliverable file metadata (`sealed_deliverables`). Bytes live in InsForge Storage.
- Human-readable deal mirror (`sealed_deals`). On-chain deal_id is the join key.

### What stays on-chain
- Escrow balances, milestone release, refund, dispute state. Never trust InsForge for fund movement.

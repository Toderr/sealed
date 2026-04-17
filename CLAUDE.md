# Sealed — AI-Powered Autonomous Escrow on Solana

## Project Overview
AI agent that represents businesses on an on-chain deal table — negotiates, manages escrow, verifies deliverables, and releases payment autonomously on Solana.

## Architecture
- **Smart Contract**: Anchor program in `programs/escrow/` — milestone-based escrow with USDC
- **Frontend**: Next.js app in `app/` — deal dashboard + AI chat interface
- **AI Agent**: Claude API via Next.js API route — parses natural language → structured deal params

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
- AI agent uses Claude API — set ANTHROPIC_API_KEY in app/.env.local

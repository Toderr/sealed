# Build Context — Phase 2

## Stack
- **smart_contract**: Anchor 0.30.1, Rust, Solana CLI 2.2.7
- **frontend**: Next.js (App Router), TypeScript, Tailwind CSS
- **ai_agent**: Claude API (@anthropic-ai/sdk)
- **wallet**: Wallet Standard (@solana/wallet-adapter-react)
- **rpc**: Solana devnet (upgrade to Helius for production)
- **stablecoin**: USDC (SPL Token)
- **skills_installed**: solana-dev, debug-program, review-and-iterate
- **mcps_configured**: none yet (add helius-mcp when ready)

## Architecture
- **pattern**: Next.js + Anchor dApp (hybrid with AI agent)
- **program_accounts**: Deal (PDA), EscrowVault (PDA token account), Reputation (PDA)
- **instructions**: create_deal, fund_escrow, release_milestone, refund
- **agent_flow**: User chat → Claude API → structured deal params → create_deal instruction

## Build Status
- **mvp_complete**: false
- **tests_passing**: false
- **devnet_deployed**: false

## Milestones Completed
1. [x] TypeScript types matching smart contract state (`app/src/lib/types.ts`)
2. [x] App shell with header, tab nav, wallet connect (`Header.tsx`, `layout.tsx`)
3. [x] AI chat interface with deal parsing (`ChatInterface.tsx`)
4. [x] Deal dashboard with status badges & progress bars (`DealDashboard.tsx`)
5. [x] Deal detail view with milestone timeline (`DealDetail.tsx`)
6. [x] Escrow client with PDA derivation & Borsh instruction builders (`escrow-client.ts`)

## Decisions
- Refund requires both buyer AND seller signatures (mutual agreement)
- Milestone release is buyer-only (buyer confirms delivery)
- Max 10 milestones per deal
- Deal ID max 32 chars
- Reputation is per-wallet, counts completed deals (TODO)
- Windows dev: frontend native, smart contract via WSL
- On-chain transactions gated behind `ON_CHAIN_ENABLED` flag in `page.tsx`
- Using raw instruction builders instead of Anchor Program class (avoids TS deep instantiation errors)

## Next Steps
1. Deploy escrow program to devnet (WSL: anchor build && anchor deploy)
2. Update PROGRAM_ID in escrow-client.ts with real deployed address
3. Set ON_CHAIN_ENABLED = true in page.tsx
4. Write Anchor tests
5. Add reputation tracking
6. Add notification system (toast component)
7. Add deal persistence (localStorage or on-chain fetch)

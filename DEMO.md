# Sealed Demo Script

**Target runtime: 4–5 minutes.** Covers the full deal lifecycle on Solana devnet plus the mutual-refund path. Optimized for judges watching a screen-share.

---

## Prerequisites

### Two wallets, devnet-funded

| Role | Wallet | Needs |
|---|---|---|
| **Buyer** (Alice) | Phantom, devnet | ≥ 0.2 SOL for fees, ≥ 500 USDC (devnet) |
| **Seller** (Bob) | Solflare or Phantom second account, devnet | ≥ 0.05 SOL for fees |

- Airdrop SOL: `solana airdrop 2 <pubkey> --url devnet` (retry if rate-limited).
- Devnet USDC: [faucet.circle.com](https://faucet.circle.com/) → Solana devnet → paste Alice's address.
- For the cleanest demo, use **two browser profiles** (or two browsers) so both wallets can be connected simultaneously without adapter switching.

### Environment

```bash
cd app
cp .env.example .env.local   # fill ANTHROPIC_API_KEY or OPENROUTER_API_KEY
npm install
npm run dev
```

Open `http://localhost:3000` in both browser profiles.

---

## Part 1: Happy path (3 min)

### Step 1 · Connect buyer wallet & describe the deal

1. Alice's browser: click **Connect Wallet** → Phantom → approve.
2. In the chat input, paste:

   > *"I need a landing page built for my coffee roasting business. Budget is 500 USDC total. Three milestones: design mockup, coded build, and post-launch fixes."*

3. Hit send. **Narrate**: *"The Structurer agent is parsing this into a structured deal: counter-party, amount, milestones."*
4. A deal preview card appears with three milestones (e.g. 150 / 250 / 100 USDC). Seller wallet field is still editable; paste Bob's pubkey.

### Step 2 · Dual-agent negotiation

1. Click **Negotiate** on the preview.
2. **Narrate**: *"Both sides now have their own Negotiator agent. They carry BusinessMemory: past deals, red-lines, negotiation style. They counter-offer until they agree."*
3. The NegotiationView streams rounds: buyer's Negotiator proposes, seller's Negotiator counter-proposes, concessions listed inline.
4. When status turns **Agreed**, the summary card shows pros / cons / risk flags / confidence score.
5. Click **Accept final terms**.

### Step 3 · Create the deal on-chain

1. Click **Create Deal on Solana**.
2. Phantom pops up; approve the `create_deal` tx.
3. **Narrate**: *"That just wrote a Deal PDA with seeds `[b'deal', deal_id]` and provisioned an escrow-vault PDA. No USDC moved yet; status is `Created`."*
4. Dashboard now shows the deal card with a **Created** badge.

### Step 4 · Fund escrow

1. Open the deal → click **Fund Escrow** → enter `500` → approve in Phantom.
2. **Narrate**: *"500 USDC just moved from Alice's ATA into the PDA-owned vault. Neither side can spend it unilaterally."*
3. Status flips to **Funded**. Milestone list is now actionable.

### Step 5 · Seller submits proof (milestone 1)

1. Switch to Bob's browser. Connect Solflare. Deal appears on his dashboard.
2. Open the deal → milestone 1 **Submit proof** → paste a URL (e.g., `https://figma.com/file/demo-mockup`) → submit.
3. **Narrate**: *"The proof goes into per-wallet local state. The Verifier agent reviews it and scores confidence: approve, reject, or request clarification."*
4. The Verifier card appears with a recommendation and notes.

### Step 6 · Buyer releases milestone 1

1. Switch back to Alice. Open the same deal.
2. Milestone 1 shows seller's proof + Verifier recommendation. Click **Release payment**.
3. Phantom popup → approve `release_milestone` ix.
4. **Narrate**: *"One signature, one tx. 150 USDC moved from the vault to Bob's ATA. Buyer retains final authority even when the AI recommends approve."*
5. Milestone 1 badge flips to **Released**. Deal status → **InProgress**.

### Step 7 · Release milestones 2 and 3 (fast-forward)

Repeat Step 5 + 6 for milestones 2 and 3. On the final release the program marks the deal **Completed** and the Solscan link opens the last tx.

**Narrate the close**: *"Three milestones, three signatures, zero intermediaries. Alice's BusinessMemory just incremented her completed-deals counter. That's the reputation primitive we'll move on-chain post-hackathon."*

---

## Part 2: Mutual refund (90 sec)

Use a second deal (create + fund another small one, e.g. 50 USDC, so the happy-path deal stays completed for the final dashboard shot).

### Step 1 · Request refund

1. Alice opens the funded deal → scroll to **Refund** panel → click **Request mutual refund**.
2. Phantom popup → **sign only** (don't broadcast). Alice's signature is captured.
3. **Narrate**: *"Mutual refund needs both buyer and seller signatures, but a browser wallet only holds one key. So we split the ceremony: Alice partial-signs, we serialize the half-signed tx to base64, Bob imports it and adds his signature."*
4. Alice's panel now shows **Awaiting counter-party**. The base64 blob is already in shared localStorage so Bob's browser can pick it up automatically. A **Copy blob** button is there for cross-browser pairs.

### Step 2 · Counter-party approves

1. Switch to Bob. Same deal → **Refund** panel → **Approve & submit refund** button is live.
2. Click it → Solflare popup → approve.
3. **Narrate**: *"Bob's wallet adds his signature to the already-partial-signed tx and broadcasts. The program verifies both sigs, sends the unreleased remainder back to Alice's ATA, and sets deal status to `Refunded`."*
4. Status flips to **Refunded** on both browsers.

### Edge: blockhash expired

If > ~90s pass between Alice signing and Bob approving, the tx will fail with a blockhash error. Alice just clicks **Request refund** again to start a fresh round. Mention this briefly if it happens.

### Edge: pre-funding cancel

Mention but skip in the live demo: *"If a deal is created but not yet funded, either party can cancel locally. No chain writes needed, because no USDC is at risk."*

---

## Talking points

Keep these ready for Q&A:

- **Why AI?** Deal structuring and negotiation are the unsolved UX layer on top of escrow. Raw contract UIs don't work for mid-market business owners.
- **Why on-chain?** Escrow without a bank or lawyer. Programmable release conditions. Portable reputation.
- **Why Solana?** Sub-second settlement, negligible fees, real USDC liquidity. Matters for the pengusaha price point. A 2% bank wire on a 500 USDC deal is 10 bucks; on Solana it's fractions of a cent.
- **Why mutual refund instead of timeout refund?** MVP defensive choice. A unilateral timeout refund creates a griefing vector where the buyer funds, waits, refunds, and the seller burned delivery cost. Post-hackathon: arbiter-triggered refund for the `Disputed` path.
- **What's the moat?** Direct access to the pengusaha community via our team's 18-year trading and business network. We have 10 first customers already doing these deals today over WhatsApp + bank transfer.

---

## If something breaks live

| Symptom | Fix |
|---|---|
| Phantom shows a scary "unknown program" warning | Expected on devnet. It's our deployed program; just approve. |
| `AccountNotFound` on fund | Buyer's USDC ATA wasn't created. Our `buildEnsureAtaIx` handles this idempotently; click Fund again. |
| Blockhash expired during refund handoff | Alice re-requests refund; fresh blockhash, fresh 90s window. |
| Verifier call times out | AI API hiccup. Buyer can still release from their own judgment; Verifier is advisory. |
| RPC 429 rate limit | Swap `NEXT_PUBLIC_RPC_URL` to a Helius key in `.env.local` and restart dev server. |

---

## Recording checklist

- [ ] Two browser windows side-by-side before recording.
- [ ] Both wallets on devnet, both funded.
- [ ] `.env.local` has a working AI key.
- [ ] Dev server warmed up (trigger one chat message first so cold-start latency doesn't show).
- [ ] Solscan open in a tab for the "here's the actual on-chain tx" moment.
- [ ] Clear all localStorage before recording for a clean dashboard empty state.

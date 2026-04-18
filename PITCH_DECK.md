# Sealed — Pitch Deck Draft

Target: Colosseum Frontier Hackathon submission (3-min video + deck)
Audience: Judges, potential angels, Solana ecosystem partners

---

## Slide 1 — Title

**SEALED**

*People break promises. Code doesn't.*

AI-powered B2B escrow on Solana.

Built for business owners who already use crypto rails but still settle deals on handshake.

**Speaker notes:** Open with the headline on screen for 3 seconds of silence before speaking. Let it land.

---

## Slide 2 — Problem

### 64 million Indonesian MSMEs close deals on trust alone.

Indonesia's B2B ecommerce market is projected to reach ~$14B in 2026 and grow at 18.74% CAGR through 2031. Most of it still settles over WhatsApp and bank transfers.

- No escrow.
- No enforceable milestones.
- No shared source of truth.

When a deal goes wrong, the options are ugly: eat the loss, hire a lawyer, or send a debt collector.

> *"I shipped 40% of the order. The buyer ghosted. I have no recourse."*
> — pengusaha in our community

*Sources: Mordor Intelligence, trade.gov (Indonesia ecommerce 2026).*

---

## Slide 3 — Solution

### Three AI agents. One on-chain deal table.

*Structurer, Negotiator, Verifier — sharing one engine, each with its own role.*

1. **Chat** — describe your deal in plain language (Bahasa Indonesia or English). The **Structurer** agent parses it into milestones, amounts, and release conditions.
2. **Negotiate** — both parties get their own **Negotiator** agent carrying their BusinessMemory (deal history, red-lines, style). The agents counter-offer until they agree, then summarize pros, cons, and risk flags.
3. **Sign + fund** — both wallets approve. USDC locks in a Solana PDA-owned vault.
4. **Verify + settle** — seller submits proof per milestone. The **Verifier** agent scores confidence and recommends approve / reject / request clarification. Buyer releases with one signature.
5. **Exit** — mutual refund via 2-sig partial-sign handoff if the deal unwinds.

No lawyer. No bank. No dispute hotline.

Just code that can't lie.

---

## Slide 4 — Product Demo

### Live on Solana devnet today.

**Program ID:** `3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ`

**[Screenshot or GIF grid]**

**Core flow**
- Chat intake → deal preview card
- Dual-agent negotiation view (counter-offers, concessions, risk summary)
- On-chain deal creation (Solscan link)
- Fund escrow with USDC
- Milestone release transaction

**Recovery flow** *(the stuff judges usually don't see shipped)*
- Seller proof submission + AI Verifier review
- Mutual refund via 2-sig partial-sign handoff

**Built in 4 weeks by a team of 2.** 4 Anchor instructions, 3 AI agent roles, end-to-end typed — no mocks.

Full walkthrough in [DEMO.md](./DEMO.md) and the technical video.

---

## Slide 5 — Why Now / Market

### Three curves converging.

- **Stablecoin B2B payments** hit **$226B annually** (McKinsey/Artemis, Feb 2026), up **733% YoY**. Asia drives 60% of global stablecoin payment volume.
- **Indonesia** ranks **#7 in the Chainalysis 2025 Global Crypto Adoption Index**, with **~39 million crypto holders** (3rd globally by user count).
- **AI agents** finally good enough to parse messy business intent into structured contracts.

Pengusaha (Indonesian business owners) already hold USDT on exchanges. They move millions off-chain because on-chain tooling was built for traders, not merchants.

**Sealed is the first escrow layer built for them, not for DeFi natives.**

*Sources: [McKinsey Feb 2026](https://www.mckinsey.com/industries/financial-services/our-insights/stablecoins-in-payments-what-the-raw-transaction-numbers-miss), [Chainalysis 2025 Index](https://www.chainalysis.com/blog/2025-global-crypto-adoption-index/).*

---

## Slide 6 — Why us, not another escrow dApp

> **Escrow is a feature. Negotiation is the product.**

Bare on-chain escrow already exists — and nobody in our target market uses it, because locking funds into a contract is the *last* 10% of the work. The first 90% is:

- Structuring a messy WhatsApp deal into milestones
- Negotiating terms without a lawyer
- Judging whether delivery actually happened

Every incumbent skips straight to "sign this smart contract." We built the agent layer that gets two businesses **to the signature** — and a Verifier that helps them decide **whether to release**.

That's why our wedge is AI-first; escrow is the settlement rail underneath.

---

## Slide 7 — Business Model

### Revenue at three points.

| Stream | Pricing | Why it works |
|---|---|---|
| **Platform fee** | 0.5% of deal value | Cheaper than notary, lawyer, or bank escrow |
| **Premium AI** | $49/mo per business | Dispute drafting, contract templates, analytics |
| **Reputation layer** | Paid verification | Verified merchants get premium placement |

**Unit economics:** one $50,000 deal pays $250. Break-even on compute + infra at ~20 deals per month.

---

## Slide 8 — Go To Market

### We don't need to find users. We already know them.

Our partner has 18 years in trading, investing, and crypto, with direct relationships inside the Indonesian pengusaha community.

**Week 1–4 (post-hackathon):**
- 10 closed-beta deals from our network. Real money, real stakes.

**Month 2–6:**
- Founder-led sales. One community at a time.
- Content in Bahasa Indonesia. Demo booths at pengusaha meetups.

**Year 1:**
- Regional expansion into Vietnam, Philippines, Thailand. Same archetype, same pain.

---

## Slide 9 — Traction + Team

### Already shipping.

- Anchor program on devnet: `create_deal`, `fund_escrow`, `release_milestone`, `refund`
- Full deal lifecycle working end-to-end: chat → negotiate → fund → proof → verify → release → complete
- Dual-agent negotiation engine with BusinessMemory per wallet
- AI Verifier scoring milestone proofs (approve / reject / request-clarification)
- Mutual refund via 2-sig partial-sign handoff — no trusted relay needed
- Anthropic direct + OpenRouter both supported
- Linear-grade UI — not a hackathon-looking app

---

### Team

- **[Dev name]** — builds AI agents. Previously shipped a DLMM agent that auto-screens, opens, and closes positions with self-learning.
- **[Partner name]** — 18 years in trading, investing, crypto, and DLMM valuation. Direct line to target customer segment.

Two people. Four weeks. Working product on mainnet-adjacent infrastructure.

---

## Slide 10 — Ask + Roadmap

### What we're building next.

**Q2 2026:** Mainnet launch. First 10 paying businesses.
**Q3 2026:** Dispute resolution layer. Optional arbitrator network.
**Q4 2026:** Cross-border escrow with multi-currency stablecoin routing.
**2027:** Reputation NFTs portable across platforms.

### The ask.

- **$250K pre-seed** to get to 100 active businesses and $1M TVL.
- **Ecosystem partners** on the Solana side: stablecoin issuers, wallet providers, on-ramps.
- **Design partners** in SEA B2B verticals: manufacturing, logistics, agriculture trade.

**Contact:** [email]
**GitHub:** github.com/Toderr/sealed
**Live demo:** [url]

---

## Video Pitch Script (3 min)

**0:00–0:15 — Hook**
"Every day, billions of dollars in business deals close on nothing but a handshake. When it works, it's beautiful. When it breaks, there's no recourse."

**0:15–0:45 — Problem**
"Indonesia has 64 million MSMEs. B2B ecommerce hits 14 billion dollars in 2026 and grows 18% a year. Almost all of it still settles over WhatsApp and bank transfers. When the buyer ghosts after 40% delivery, the seller eats it."

**0:45–1:15 — Solution intro**
"Sealed is an AI agent that represents your business on an on-chain deal table. You describe the deal in plain language. The agent structures it. Solana locks the funds. Milestones release automatically when delivery is confirmed."

**1:15–2:15 — Product walkthrough**
[Screen recording: chat, deal preview, wallet sign, on-chain confirmation, milestone release]

**2:15–2:45 — Why us**
"Two people, four weeks. Three AI agents — Structurer, Negotiator, Verifier — on top of a four-instruction Anchor escrow. My partner has eighteen years in trading and a direct line to business owners who will never touch a DEX but will happily use this if it feels like chat. That's our wedge."

**2:45–3:00 — Close**
"People break promises. Code doesn't. Sealed makes the deal table that enforces itself — for the 99% of business that still runs on handshakes."

---

## Submission Checklist (Colosseum)

**Blockers before submission:**
- [ ] 3-min pitch video uploaded
- [ ] Under-3-min technical walkthrough uploaded
- [ ] Live demo URL (Vercel)
- [ ] Contact email filled in Slide 10
- [ ] Team bios — replace `[Dev name]` + `[Partner name]` in Slide 9
- [ ] Track selection on Colosseum portal
- [ ] Screenshot/GIF grid for Slide 4

**Done:**
- [x] Project name + one-line tagline
- [x] GitHub repo (public, README, demo script) — github.com/Toderr/sealed
- [x] Tech stack listed — in README

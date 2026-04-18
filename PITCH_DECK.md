# Sealed Pitch Deck

Target: Colosseum Frontier Hackathon submission (3-min video + deck)
Audience: Judges, potential angels, Solana ecosystem partners

---

## Slide 1 · Title

**SEALED**

*People break promises. Code doesn't.*

AI escrow for business deals. Any currency. Any chain.

**Speaker notes:** Hold on the wordmark for 3 seconds of silence before speaking.

---

## Slide 2 · Problem

### Business deals break. Both sides lose.

**Web2.** Freelancers lost **$15B** to non-payment in 2025. **58%** face unpaid invoices. **79%** of companies were targeted by payment fraud in 2024.

**Web3.** Bare escrow primitives exist, but none of them cover the full B2B deal lifecycle. There is no structured deal layer for on-chain agreements: no negotiation, no milestone verification, no enforceable "did it ship?" step. Escrow locks funds. It does not enforce promises.

One root cause: no enforceable deal layer.

*Source: Flexable 2025 Freelance Payment Report.*

---

## Slide 3 · Solution

### Three AI agents. One deal table.

**Structurer** parses the deal. **Negotiator** reaches terms for both sides. **Verifier** reviews delivery.

Funds lock on-chain. Release on milestone. Mutual refund if it breaks.

No lawyer. No bank. No dispute hotline.

Just code that can't lie.

---

## Slide 4 · Product Demo

### Live on Solana devnet today.

**Program ID:** `3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ`

**[Screenshot grid]**

**Core flow**
chat → negotiate → fund → verify → release.

**Recovery flow**
AI Verifier proof review + mutual refund via 2-sig partial-sign handoff.

Full walkthrough in [DEMO.md](./DEMO.md) and the technical video.

---

## Slide 5 · Why Now

### Three curves converging.

**$226B** in stablecoin B2B payments in 2025, up **733% YoY** (McKinsey/Artemis, Feb 2026).

**Deal layer missing.** No on-chain standard for structured B2B agreements. Escrow primitives exist, but nothing wraps chat → structure → negotiate → verify → release into a single lifecycle.

**AI agents** finally good enough to turn messy business intent into structured contracts.

The plumbing is ready. The trust layer isn't. Yet.

*Source: McKinsey / Artemis, Feb 2026.*

---

## Slide 6 · Why us

> **Escrow is a feature. Negotiation is the product.**

Bare on-chain escrow already exists. Nobody in our target market uses it, because locking funds is the *last* 10% of the work.

The first 90% is:
- structuring a messy deal into milestones,
- negotiating terms without a lawyer,
- judging whether delivery actually happened.

Every incumbent skips to "sign this smart contract." We built the agent layer that gets two parties **to the signature**, plus a Verifier that helps them decide **whether to release**.

Our wedge is AI-first. Escrow is the settlement rail underneath.

---

## Slide 7 · Business Model

| Stream | Price | Why |
|---|---|---|
| **Platform fee** | **1%** of deal value | Pays compute + infra from deal one |
| **Premium AI** | **+5%** markup on LLM provider pricing | Any provider (Anthropic, OpenAI, OpenRouter) with pass-through billing |
| **Verified merchant** | **$100** one-time | Filter for serious parties |

Verified merchants get premium placement and a trust badge other parties actually look for.

---

## Slide 8 · Go To Market

### Hide the crypto. Keep the guarantees.

Most businesses don't hold crypto. So we built the wrapper.

- **Email / Google login** via social wallet. No seed phrases.
- **Pay in local currency.** Auto on/off-ramp: IDR, USD, and more via Xendit, MoonPay, Transak.
- **Deal table in plain language.** USDC is invisible plumbing, not the product.

**Week 1–4:** 10 closed-beta deals from cofounder's pengusaha network. Real money, real stakes.

**Month 2–6:** Freelance agencies, cross-border B2B, SEA manufacturing.

**Year 1:** Regional expansion + web3-native power-user tier (bring your own wallet, lower fees).

---

## Slide 9 · Team

### Two founders. One bet.

- **[Dev name]** builds AI agents. Previously shipped a DLMM agent that auto-screens, opens, and closes positions with self-learning.
- **[Partner name]** has direct lines into the target customer segment and a long track record in trading and crypto.

---

## Slide 10 · Roadmap

### Where we go from here.

**Q2 2026:** Mainnet launch + web2 wrapper (social wallet, fiat on/off-ramp).
**Q3 2026:** Dispute resolution layer. Optional arbitrator network.
**Q4 2026:** Multi-currency cross-border escrow.
**2027:** Portable on-chain reputation NFTs.

---

## Slide 11 · Closing

*People break promises. Code doesn't.*

**Contact:** [email]
**GitHub:** github.com/Toderr/sealed
**Live demo:** sealed-nine.vercel.app

---

## Video Pitch Script (3 min)

**0:00–0:15 · Hook**
"Every day, billions of dollars in business deals close on nothing but a handshake. When it works, it's beautiful. When it breaks, there's no recourse."

**0:15–0:45 · Problem**
"Freelancers lost fifteen billion to broken promises last year. On-chain, there's no structured deal layer at all — escrow primitives lock funds, but they don't negotiate terms, verify delivery, or enforce promises. Two different worlds, one missing trust layer."

**0:45–1:15 · Solution**
"Sealed is an AI agent that runs the deal table. Describe the deal in plain language. Three agents handle structuring, negotiation, and delivery verification. Funds lock on Solana, release on milestone."

**1:15–2:15 · Product walkthrough**
[Screen recording: chat, deal preview, wallet sign, on-chain confirmation, milestone release]

**2:15–2:45 · Why us**
"We hide the crypto behind email login and auto on/off-ramp, so any business can use Sealed, not just web3 natives. Our cofounder brings deep networks of business owners who've never touched a DEX. That's our wedge: the crypto is invisible plumbing; the product is trust."

**2:45–3:00 · Close**
"People break promises. Code doesn't. Sealed makes the deal table that enforces itself, for every business that still runs on handshakes."

---

## Submission Checklist (Colosseum)

**Blockers before submission:**
- [ ] 3-min pitch video uploaded
- [ ] Under-3-min technical walkthrough uploaded
- [x] Live demo URL (Vercel): sealed-nine.vercel.app
- [ ] Contact email filled in Slide 11
- [ ] Team bios: replace `[Dev name]` + `[Partner name]` in Slide 9
- [ ] Track selection on Colosseum portal
- [ ] Screenshot grid for Slide 4

**Done:**
- [x] Project name + tagline
- [x] GitHub repo (public, README, demo script): github.com/Toderr/sealed
- [x] Tech stack listed in README

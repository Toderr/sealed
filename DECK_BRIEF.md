# Sealed — Deck Brief for claude.ai/design

**What this file is:** a design-ready brief you paste into [claude.ai/design](https://claude.ai/design) to render the 10-slide Colosseum pitch deck. Not a deck itself.

**How to use:**

1. Open claude.ai/design
2. Paste this entire file
3. Prompt: *"Generate a 10-slide 16:9 dark pitch deck matching the design system and per-slide content below. Keep one primary message per slide. Don't invent stats or copy — use exactly what's provided."*
4. Iterate slide-by-slide if specific layouts miss.

---

## Design System

**Palette** — dark mode, Linear-inspired:

| Token | Hex | Use |
|---|---|---|
| Background | `#08090a` | Slide background (marketing black) |
| Panel | `#0f1011` | Raised panels, content blocks |
| Surface | `#191a1b` | Cards, callouts |
| Text primary | `#f7f8f8` | Headlines, body |
| Text muted | `#8a8f98` | Eyebrows, metadata, footers |
| Brand indigo | `#5e6ad2` | Primary emphasis, links, agent names |
| Accent indigo | `#7170ff` | Secondary emphasis, highlight states |
| Success | `#4ade80` | Positive data |
| Warning | `#fbbf24` | Stat callouts, attention |
| Danger | `#f87171` | Risk framing |
| Border | `rgba(255,255,255,0.08)` | Hairlines, card edges |

**Typography:**

- **Headings**: Inter, weight 590, letter-spacing −0.02em at display sizes
- **Body**: Inter, weight 400
- **Emphasis inline**: weight 510 (Linear's signature)
- **Numerics**: JetBrains Mono — always used for dollar amounts, program IDs, deal IDs, version numbers, wallet addresses

**Layout rules:**

- 16:9, generous padding (≥80px outer)
- Each slide has exactly **one primary message**
- No emoji as icons. Use minimal stroked SVG glyphs (Lucide-style) where icons appear
- **Eyebrow labels**: uppercase, tracked +0.1em, 12–14pt, muted color
- **Pull-quotes**: italic, left-border accent in brand indigo
- **Tables / data**: hairline borders only, no filled cells
- Background has a subtle radial gradient in brand indigo at ~5% opacity — ambient, not decorative

**Tone references** (copy these verbatim where called for):
- "People break promises. Code doesn't." — primary tagline
- "No lawyer. No bank. No dispute hotline. Just code that can't lie."
- "Escrow is a feature. Negotiation is the product."
- "Structurer, Negotiator, Verifier — sharing one engine, each with its own role."

---

## Slide 1 — Title

**Eyebrow:** —
**Headline:** `SEALED`
**Sub-headline:** *People break promises. Code doesn't.*
**Body:** AI-powered B2B escrow on Solana.
Built for business owners who already use crypto rails but still settle deals on handshake.
**Footer (mono, muted):** Program ID `3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ` · Solana devnet
**Visual:** Minimal title. Wordmark left-aligned or centered, oversized. Subtle brand-indigo gradient orb behind the word — like a soft spotlight. No chrome, no icons.
**Tone:** Confident, quiet. Let it breathe.

---

## Slide 2 — Problem

**Eyebrow:** THE PROBLEM
**Headline:** 64 million Indonesian MSMEs close deals on trust alone.
**Body:**
Indonesia's B2B ecommerce market is projected to reach **~$14B in 2026** and grow at **18.74% CAGR** through 2031. Most of it still settles over WhatsApp and bank transfers.

- No escrow.
- No enforceable milestones.
- No shared source of truth.

When a deal goes wrong: eat the loss, hire a lawyer, or send a debt collector.

**Pull-quote (dominant visual element, bottom half of slide):**
> *"I shipped 40% of the order. The buyer ghosted. I have no recourse."*
> — pengusaha in our community

**Footer (mono, muted):** Sources: Mordor Intelligence · trade.gov (Indonesia ecommerce 2026)
**Visual:** Top half = headline with `64M` as a display stat (oversized, mono, warning-yellow). Three "No X" bullets as hairline chips. Bottom half = the pull-quote with an indigo left-border accent, taking 40% of slide height.
**Tone:** Analytical → personal. The quote should hit.

---

## Slide 3 — Solution

**Eyebrow:** THE SOLUTION
**Headline:** Three AI agents. One on-chain deal table.
**Sub-headline (muted, italic):** *Structurer, Negotiator, Verifier — sharing one engine, each with its own role.*
**Body (numbered 5-step flow):**

1. **Chat** — describe your deal in plain language (Bahasa Indonesia or English). **Structurer** parses it into milestones, amounts, release conditions.
2. **Negotiate** — both parties get a **Negotiator** carrying their BusinessMemory. The agents counter-offer until they agree, then summarize pros, cons, risk flags.
3. **Sign + fund** — both wallets approve. USDC locks in a Solana PDA-owned vault.
4. **Verify + settle** — seller submits proof per milestone. **Verifier** scores confidence, recommends approve / reject / request clarification. Buyer releases with one signature.
5. **Exit** — mutual refund via 2-sig partial-sign handoff if the deal unwinds.

**Closing line (large, centered):** *No lawyer. No bank. No dispute hotline. Just code that can't lie.*
**Visual:** Horizontal 5-step flow with numbered nodes. Each node labeled with the agent in brand indigo where applicable. Connecting lines in muted border color. The three agent names (Structurer, Negotiator, Verifier) are the hero visual — they should read even if you squint.
**Tone:** Confident, technical but accessible.

---

## Slide 4 — Product Demo

**Eyebrow:** PRODUCT
**Headline:** Live on Solana devnet today.
**Sub-line (mono):** Program ID `3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ`
**Body — two groups:**

**Core flow**
- Chat intake → deal preview card
- Dual-agent negotiation view (counter-offers, concessions, risk summary)
- On-chain deal creation (Solscan link)
- Fund escrow with USDC
- Milestone release transaction

**Recovery flow** *(the stuff judges usually don't see shipped)*
- Seller proof submission + AI Verifier review
- Mutual refund via 2-sig partial-sign handoff

**Footer emphasis:** **Built in 4 weeks by a team of 2.** 4 Anchor instructions, 3 AI agent roles, end-to-end typed — no mocks.
**Visual:** 2×3 screenshot grid from the Sealed app (dark UI matches the deck). If screenshots aren't available, replace with labeled placeholder frames: "Chat", "Negotiation", "Deal creation", "Fund", "Proof + Verifier", "Release". Bottom caption row lists the bullets concisely.
**Tone:** Evidentiary. "We actually shipped this."

---

## Slide 5 — Why Now

**Eyebrow:** WHY NOW
**Headline:** Three curves converging.
**Body — 3 stat blocks:**

1. **Stablecoin B2B payments:** `$226B` annually (McKinsey/Artemis, Feb 2026), up **733% YoY**. Asia drives 60% of global stablecoin payment volume.
2. **Indonesia:** **#7** in the Chainalysis 2025 Global Crypto Adoption Index. **~39 million** crypto holders (3rd globally by user count).
3. **AI agents** finally good enough to parse messy business intent into structured contracts.

**Closing paragraph:**
Pengusaha (Indonesian business owners) already hold USDT on exchanges. They move millions off-chain because on-chain tooling was built for traders, not merchants.

**Emphasis line (brand-indigo accent):** Sealed is the first escrow layer built for them, not for DeFi natives.

**Footer (mono, muted):** Sources: McKinsey (Feb 2026) · Chainalysis 2025 Index
**Visual:** Three equal columns, each with an oversized display stat in mono + one-line caption. Optional: a subtle rising line chart behind the `$226B` block.
**Tone:** Analytical, urgency-building.

---

## Slide 6 — Why us, not another escrow dApp

**Eyebrow:** DIFFERENTIATION
**Headline (pull-quote style, dominant):** Escrow is a feature. Negotiation is the product.
**Body:**
Bare on-chain escrow already exists — and nobody in our target market uses it, because locking funds into a contract is the *last* 10% of the work. The first 90% is:

- Structuring a messy WhatsApp deal into milestones
- Negotiating terms without a lawyer
- Judging whether delivery actually happened

Every incumbent skips straight to "sign this smart contract." We built the agent layer that gets two businesses **to the signature** — and a Verifier that helps them decide **whether to release**.

**Closing line:** That's why our wedge is AI-first; escrow is the settlement rail underneath.
**Visual:** Split panel. Left side labeled "Bare escrow dApps" — a funnel that drops off before the "sign" step (shown via muted/greyed stages). Right side labeled "Sealed" — the full funnel reaches signature → release. Don't make it cartoonish; hairline stage boxes are enough.
**Tone:** Confident, slightly contrarian.

---

## Slide 7 — Business Model

**Eyebrow:** BUSINESS MODEL
**Headline:** Revenue at three points.
**Body — 3-column table:**

| Stream | Pricing | Why it works |
|---|---|---|
| **Platform fee** | 0.5% of deal value | Cheaper than notary, lawyer, or bank escrow |
| **Premium AI** | $49/mo per business | Dispute drafting, contract templates, analytics |
| **Reputation layer** | Paid verification | Verified merchants get premium placement |

**Unit economics callout:** One `$50,000` deal pays `$250`. Break-even on compute + infra at **~20 deals per month**.
**Visual:** Three-card grid (not a table if layout permits). Each card has the stream name as heading, price as oversized mono callout, and the "why it works" as body. Unit-economics callout sits below as a separate bar.
**Tone:** Analytical, simple math.

---

## Slide 8 — Go To Market

**Eyebrow:** GO TO MARKET
**Headline:** We don't need to find users. We already know them.
**Body:**
Our partner has 18 years in trading, investing, and crypto, with direct relationships inside the Indonesian pengusaha community.

**Post-hackathon (weeks 1–4):**
- 10 closed-beta deals from our network. Real money, real stakes.

**Month 2–6:**
- Founder-led sales. One community at a time.
- Content in Bahasa Indonesia. Demo booths at pengusaha meetups.

**Year 1:**
- Regional expansion into Vietnam, Philippines, Thailand. Same archetype, same pain.

**Visual:** Horizontal timeline with three nodes (Weeks 1–4 · Months 2–6 · Year 1). Under each node, the 1–3 bullet points. Top of slide holds the headline as dominant; timeline occupies bottom 60%.
**Tone:** Confident. This isn't theoretical distribution.

---

## Slide 9 — Traction + Team

**Eyebrow:** TRACTION + TEAM
**Headline:** Already shipping.
**Traction bullets (checkmark list):**

- Anchor program on devnet: `create_deal`, `fund_escrow`, `release_milestone`, `refund`
- Full deal lifecycle working end-to-end: chat → negotiate → fund → proof → verify → release → complete
- Dual-agent negotiation engine with BusinessMemory per wallet
- AI Verifier scoring milestone proofs (approve / reject / request-clarification)
- Mutual refund via 2-sig partial-sign handoff — no trusted relay needed
- Anthropic direct + OpenRouter both supported
- Linear-grade UI — not a hackathon-looking app

**Team (2 blocks):**
- **[Dev name]** — builds AI agents. Previously shipped a DLMM agent that auto-screens, opens, and closes positions with self-learning.
- **[Partner name]** — 18 years in trading, investing, crypto, and DLMM valuation. Direct line to target customer segment.

**Closing line (large):** Two people. Four weeks. Working product on mainnet-adjacent infrastructure.
**Visual:** Left column = traction list with indigo checkmarks. Right column = two team blocks side-by-side or stacked, each with name placeholder + role description.
**Tone:** Evidentiary + human.

---

## Slide 10 — Ask + Roadmap

**Eyebrow:** THE ASK
**Headline:** What we're building next.
**Roadmap (horizontal timeline):**

- **Q2 2026** — Mainnet launch. First 10 paying businesses.
- **Q3 2026** — Dispute resolution layer. Optional arbitrator network.
- **Q4 2026** — Cross-border escrow with multi-currency stablecoin routing.
- **2027** — Reputation NFTs portable across platforms.

**The ask (3 blocks):**
- **`$250K` pre-seed** to get to 100 active businesses and `$1M` TVL.
- **Ecosystem partners** on the Solana side: stablecoin issuers, wallet providers, on-ramps.
- **Design partners** in SEA B2B verticals: manufacturing, logistics, agriculture trade.

**Footer (mono):** Contact: `[email]` · GitHub: `github.com/Toderr/sealed` · Live demo: `[url]`
**Visual:** Top half = 4-node horizontal roadmap timeline. Bottom half = 3-column ask grid. Clear visual separation between the two halves.
**Tone:** Forward-looking, inviting. Close with confidence.

---

## After claude.ai/design renders

Check each slide against these:

- [ ] One primary message per slide — no crammed layouts
- [ ] All dollar amounts, program IDs, deal IDs, and wallet addresses in mono
- [ ] Agent names (Structurer, Negotiator, Verifier) are visually emphasized in brand indigo on Slide 3
- [ ] Pull-quote on Slide 2 dominates bottom half
- [ ] "Escrow is a feature. Negotiation is the product." reads as a hero line on Slide 6
- [ ] No emoji as icons anywhere. If icons needed, minimal stroked SVG.
- [ ] Contrast: text-primary on background passes 7:1 (WCAG AAA) — it's white on near-black, this should be automatic.
- [ ] Placeholders intact for final-pass edits: `[Dev name]`, `[Partner name]`, `[email]`, `[url]`, screenshot frames on Slide 4.

Export options: PDF (for email) + PPTX (for speaker notes + last-mile edits) + individual PNGs per slide (for Colosseum submission uploads).

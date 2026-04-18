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

**Tone references** (copy these verbatim where called for):
- "People break promises. Code doesn't." — primary tagline
- "No lawyer. No bank. No dispute hotline. Just code that can't lie."
- "Escrow is a feature. Negotiation is the product."
- "Structurer, Negotiator, Verifier — sharing one engine, each with its own role."

---

## Supporting Elements Library

Reference Linear.app's product pages — they're dark but never plain. Every surface has ambient depth. **Don't leave slides flat black.** Apply 2–4 of these elements on every slide, matched to the slide's purpose:

### 1. Gradient mesh backdrops (use on every slide)

Layer 2–3 overlapping radial gradient orbs per slide, each 15–30% of slide width, at 8–15% opacity, heavily blurred (Gaussian blur ~200px):

- **Primary orb**: brand indigo `#5e6ad2` — typically top-left or top-right
- **Secondary orb**: accent indigo `#7170ff` — opposite corner, dimmer
- **Warmth orb**: subtle magenta/rose `#c47aff` at 5% — mid-slide, breaks the cool palette

Different slide, different orb position — so the deck doesn't feel like one big wallpaper.

### 2. Noise / grain texture overlay

2–3% opacity grain overlay on every background. Prevents the "digital flat" look and adds warmth. Use fine monochrome noise (Photoshop Noise filter equivalent).

### 3. Grid / dot patterns

On slides with technical content (Slide 3, 4, 6), add a subtle background pattern:

- **Dot grid**: 24px spacing, 1.5px dots at 4% white opacity
- **Line grid**: 48px spacing, 1px lines at 3% white opacity
- Fade the pattern to 0% at slide edges (radial mask) so it doesn't feel boxed in

### 4. Glass cards

For emphasis blocks (pull-quotes, stat callouts, closing lines):

- Fill: `rgba(255,255,255,0.03)`
- Backdrop blur: 20px
- Border: 1px `rgba(255,255,255,0.08)`
- Inner highlight: 1px `rgba(255,255,255,0.05)` at top edge (catches "light")
- Corner radius: 12–16px
- Optional: subtle drop shadow `0 24px 64px rgba(0,0,0,0.4)` for depth

### 5. Glow effects

Key numbers, CTAs, and hero words get a soft outer glow:

- **Primary glow**: `0 0 48px rgba(94,106,210,0.35)` — brand indigo
- **Warning glow**: `0 0 40px rgba(251,191,36,0.3)` — for alarming stats
- **Success glow**: `0 0 32px rgba(74,222,128,0.25)` — for shipped / achieved markers
- Keep glow subtle — it should register, not scream

### 6. Icon set — Lucide, stroked

Consistent 1.5px stroke weight. Default muted; emphasized icons tinted brand indigo. Common mappings:

- Chat: `message-square`  ·  Handshake / deal: `handshake`  ·  Lock / escrow: `lock`
- Shield / verify: `shield-check`  ·  Release / send: `arrow-up-right`
- Refund / undo: `rotate-ccw`  ·  Problem / X: `x-circle` (danger color)
- Checkmark / shipped: `check-circle-2` (success color)
- Chart / growth: `trending-up`  ·  Timer / wait: `clock`
- Map / region: `map-pin`  ·  Users / team: `users`
- Code / program: `terminal`  ·  Wallet: `wallet`

### 7. Data-viz primitives

For stat slides (2, 5, 7):

- **Oversized display numbers**: 120–180pt mono, with glow + subtle gradient (white → text-muted)
- **Mini line charts**: behind stats, 1.5px stroke, brand indigo, low opacity (~30%), rising trend
- **Progress rings / bars**: 4px stroke, brand indigo fill on rgba white track
- **Stat cards**: glass card + oversized number + caption + optional mini-chart

### 8. Logo wall

Slides 4 + 9 should include partner/tech logos as a small footer strip:

- **Solana** (gradient or white)  ·  **Anchor**  ·  **USDC** (Circle)
- **Anthropic** / **OpenRouter**  ·  **Next.js**  ·  **Phantom** / **Solflare**
- All rendered monochrome white at 60% opacity OR as their native marks at 80% opacity
- Hairline divider above, caption below: "Built on" or "Powered by"

### 9. Flow / diagram primitives

For Slide 3 especially, but also useful elsewhere:

- **Agent nodes**: 80px circles with 1.5px brand-indigo border, glass-card fill, icon centered, label below
- **Connector lines**: 1px dashed or solid, muted color, with small directional arrow caps
- **Flow arrows**: 2px solid brand indigo for active paths; muted for passive
- **Hub-and-spoke**: three agent nodes connected to a central "deal" node = works well for Slide 3

### 10. Photo / screenshot treatments

For Slide 4 (product screenshots) and Slide 9 (team):

- **App screenshots**: wrap in a subtle "browser chrome" or floating card frame, 16–20px radius, 1px hairline border, drop shadow `0 32px 80px rgba(0,0,0,0.5)`, slight gradient glow behind
- **Multi-screenshot grid**: overlap slightly (stagger z-order) so the group feels like a product, not a contact sheet
- **Team avatars**: 80–96px circles with 2px brand-indigo ring + subtle glow; fallback to monogram if no photo

### 11. Typography as texture

- **Oversized section eyebrows**: set the eyebrow label at very light weight + large size (e.g., 140pt, weight 200) in `rgba(255,255,255,0.04)` behind the main content — fills empty space, adds a magazine-layout feel
- **Accent underlines**: animated-looking 2px brand-indigo underlines under hero words (use a gradient stroke that fades at both ends)
- **Number emphasis**: biggest numbers get their own cell, not inline with text — e.g., `$226B` as a display block with caption underneath

### 12. Motion hints (for PPTX export with animations)

If exporting with build animations:

- Headlines fade-up 200ms, body fade-up 400ms (staggered 80ms between items)
- Stat counters count up from 0 to final value over 600ms, ease-out
- Gradient orbs subtly drift (20px max) over 4s, looped

---

## Slide 1 — Title

**Eyebrow:** —
**Headline:** `SEALED`
**Sub-headline:** *People break promises. Code doesn't.*
**Body:** AI-powered B2B escrow on Solana.
Built for business owners who already use crypto rails but still settle deals on handshake.
**Footer (mono, muted):** Program ID `3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ` · Solana devnet

**Visual:**
- **Background**: triple gradient orb — primary brand indigo top-left, accent indigo bottom-right, subtle magenta warmth dead-center behind the wordmark. 200px blur.
- **Grain overlay**: 3% opacity noise across entire slide.
- **Wordmark treatment**: SEALED in oversized display weight (~180pt), letter-spacing −0.03em, color `#f7f8f8`, with soft glow behind (`0 0 80px rgba(94,106,210,0.4)`).
- **Accent underline**: 2px gradient stroke beneath the wordmark, fading from transparent → brand indigo → transparent.
- **Tagline** sits 40px below in italic, text-muted color.
- **Body copy** below that, tight max-width (480px), left-aligned if wordmark is left-aligned.
- **Floating particle dots**: 6–12 tiny dots (2–4px) in brand indigo at 30–50% opacity, scattered asymmetrically in the negative space — barely visible, adds ambient depth.
- **Program ID footer**: bottom-left in mono 11pt muted, preceded by a pulsing 6px green dot (live indicator).
- **Top-right corner**: Solana logo + "devnet" pill in hairline border — confirms chain at a glance.

**Tone:** Confident, quiet. Let it breathe — but not barren.

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

**Visual:**
- **Background**: single warning-yellow orb top-left at 8% opacity + brand indigo orb bottom-right at 10% opacity — the warm/cool tension mirrors "problem → solution coming."
- **Grain overlay**: 3% across slide.
- **Left column (60% width)**:
  - Eyebrow label up top, tracked wide.
  - Headline below with **64M** isolated as a display number — ~140pt JetBrains Mono, warning-yellow `#fbbf24` with soft yellow glow. "million Indonesian MSMEs" wraps beside/below in smaller heading type.
  - Supporting paragraph ($14B + 18.74% CAGR) in body type.
  - Three "No X" bullets rendered as **hairline chips** (rounded pill shapes, 1px border, 4px padding, with a tiny danger-red `x-circle` Lucide icon prefix). Inline horizontal, not vertical list.
  - Below the chips: the 3-options line ("eat the loss, hire a lawyer...") in body text.
- **Right column (40% width) — the pull-quote panel**:
  - **Glass card** (rgba white 3% + 20px blur + hairline border + drop shadow).
  - 4px solid brand-indigo left border inside the card.
  - Quote in italic, 24–28pt, text-primary.
  - Attribution below in muted 14pt.
  - Optional: a 60px `quote` glyph at the top-left of the card, faded to 15% opacity brand indigo — acts as decorative texture.
- **Behind the right column**: faint outline of Indonesia archipelago at 5% opacity — positioned so it bleeds off the right edge. Rendered as stroke-only, 1.5px, brand indigo.
- **Inset mini-chart** (optional, between stats and chips): 120×60px sparkline showing B2B ecommerce growth 2020→2031, 1.5px stroke, rising trend, brand indigo, low opacity.
- **Sources footer**: bottom-right, mono 10pt muted.

**Tone:** Analytical → personal. The number shocks; the map grounds it; the quote lands.

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

**Visual:**
- **Background**: dot-grid pattern (24px spacing, 1.5px dots, 4% opacity), radially masked so it fades out at slide edges. Add a brand-indigo orb center-top at 10% opacity so the grid glows around the agent row.
- **Grain overlay**: 2%.
- **Top band — the three agents**:
  - Three 96px glass-card circles arranged in a row, spaced generously.
  - Each circle has a 1.5px brand-indigo border + soft glow, with a Lucide icon centered: `terminal` (Structurer) · `handshake` (Negotiator) · `shield-check` (Verifier).
  - Agent name below each circle in weight 590, brand indigo. Role tagline below in muted 12pt:
    - "Structurer — parses plain language"
    - "Negotiator — counter-offers on your behalf"
    - "Verifier — reviews delivery proof"
  - Between the three circles: subtle dashed 1px connector lines (they share an engine, after all).
- **Middle band — the 5-step flow**:
  - Horizontal chain of 5 numbered nodes (rounded squares, hairline border, glass fill).
  - Each node: big mono number (1–5), then step title in weight 510, one-line sub-copy in muted body.
  - Solid 2px brand-indigo arrows connect nodes left → right.
  - Agent callouts appear above the relevant step (e.g., Structurer label above step 1 with a curved dashed line dropping into the node).
- **Bottom band — the closing line**:
  - Full-width glass card, centered text, 32–40pt.
  - 2px gradient top-border (transparent → brand indigo → transparent).
  - The four short sentences visually separated by faint pipe dividers `·` in muted color.
- **Side ornament**: a thin vertical spine on the far left — 1px hairline with three 8px filled circles in brand indigo, aligned to the three agents above. Suggests "shared engine, three outputs."

**Tone:** Confident, technical but accessible. This is the "how" slide — earn the complexity.

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

**Visual:**
- **Background**: brand-indigo orb top-right at 10%, accent indigo orb bottom-left at 8%. Dot grid at 3% layered over.
- **Grain overlay**: 2%.
- **Top-left of slide**: pulsing 8px success-green dot + "LIVE · DEVNET" pill (hairline border, mono 11pt, text-muted) — at a glance: this is real.
- **Program ID treatment**: in a mono code pill with copy-icon, centered under the headline. Dimensions: 1px hairline, 6px radius, 6px vertical padding, slight brand-indigo left-border accent.
- **Screenshot grid (hero visual)**:
  - 2 rows × 3 columns = 6 screenshot frames, but the *top-left frame is 2× scale* (spans 2 columns × 2 rows). That single frame is the "hero shot" — use the negotiation view or deal detail with the most visual content.
  - Remaining 4 frames fill the right half of the grid.
  - Each frame: 12–16px corner radius, 1px hairline border, drop shadow `0 32px 80px rgba(0,0,0,0.5)`, subtle brand-indigo glow behind (`0 0 120px rgba(94,106,210,0.15)`).
  - Hero frame has a slight 3D tilt (perspective rotate 6° clockwise) so it reads as "prominent."
  - Caption under each frame: 11pt muted, tight.
  - **If no screenshots available**: render labeled placeholder rectangles with the view name + a tiny Lucide icon matching the step (chat / handshake / lock / arrow-up-right / shield-check / rotate-ccw).
- **Core flow vs Recovery flow**: label the grid sections with 2 tiny section eyebrows inline: "CORE FLOW" above the first 4 frames, "RECOVERY FLOW" above the remaining 2. Hairline vertical divider between.
- **Bottom logo wall**: monochrome white at 60% — Solana · Anchor · USDC · Anthropic · OpenRouter · Next.js. Hairline divider above. Small caption: "Built on".
- **Footer emphasis strip** (above the logo wall): "Built in 4 weeks by a team of 2." in weight 590, with the three stats (`4` Anchor ix · `3` AI roles · `100%` typed) as mono pill chips right-aligned on the same line.

**Tone:** Evidentiary. Every visual element earns its place by showing receipts.

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

**Visual:**
- **Background**: three subtle orbs positioned behind each stat column — brand indigo · accent indigo · warmth magenta. 10% opacity each, heavy blur.
- **Grain overlay**: 2%.
- **Oversized decorative eyebrow**: "WHY NOW" rendered huge behind the headline at 140pt weight 200 in `rgba(255,255,255,0.03)` — typography as texture.
- **Three stat columns** as glass cards, evenly spaced with hairline dividers between:
  - **Column 1**: Lucide `trending-up` icon at top (brand indigo, 32px). Display stat `$226B` in mono 120pt with indigo glow. Behind the number: rising line chart (6–8 data points, 1.5px brand-indigo stroke, 25% opacity, positioned as background texture). Caption below: "Stablecoin B2B payments annually" + tag pill "733% YoY" in warning-yellow.
  - **Column 2**: Lucide `map-pin` icon. Display stat `#7` in mono 120pt, each character glowing. Caption: "Indonesia in Chainalysis 2025 Global Crypto Adoption Index." Tag pill: "~39M crypto holders · 3rd globally."
  - **Column 3**: Lucide `sparkles` icon (or `brain-circuit`). Display stat not a number but a short phrase: "NOW" in mono 120pt with indigo glow. Caption: "AI agents finally good enough to parse messy business intent into structured contracts."
- **Below the three columns — unifying paragraph**: in a full-width subtle panel (no border, just text) about pengusaha already holding USDT off-chain.
- **Emphasis line at bottom**: as a distinct glass card with accent-indigo top-border highlight and a small spark glyph. The sentence is the payoff of the slide.
- **Footer sources**: mono 10pt muted, bottom-right.

**Tone:** Analytical, urgency-building. Numbers do most of the work — make them impossible to ignore.

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

**Visual:**
- **Background**: warmth magenta orb top-center at 10% (breaks the cool palette — signals "this is the spicy slide"). Grain 2%.
- **Hero headline treatment**: "Escrow is a feature. Negotiation is the product." set as oversized pull-quote — 48–56pt, weight 590, with the words "feature" and "product" in brand indigo with gradient underlines. Takes 30% of vertical space.
- **Split comparison panel (dominant visual, 50% of slide)**:
  - **Left panel — "BARE ESCROW dApps"**: eyebrow label muted-red. Vertical funnel with 4 stages stacked: `Structure → Negotiate → Sign → Release`. Stages 1–3 are muted/greyed with red `x-circle` icons beside them (dropped). Only "Release" reaches full color, but the funnel narrows harshly before it — most deals never arrive. The arrow between stages is dashed, broken.
  - **Right panel — "SEALED"**: eyebrow label brand indigo. Same 4-stage funnel but all stages glow in brand indigo with success-green checkmarks. Each stage is labeled with the agent responsible (Structurer · Negotiator · Verifier · on-chain release). Arrows are solid 2px brand indigo.
  - Divider between panels: 1px hairline, not a harsh wall.
- **Below the panels — 3 pain-point chips inline**: "Structuring messy deals" · "Negotiating without a lawyer" · "Judging delivery" — each as a glass pill with a tiny Lucide icon prefix. Reinforces the "first 90%" framing.
- **Closing line**: full-width at bottom, medium weight, with "AI-first" and "settlement rail" bolded.
- **Optional ornament**: a subtle meter/gauge SVG showing "10%" on the left panel and "100%" on the right panel — reinforces the "last 10% vs first 90%" math.

**Tone:** Confident, slightly contrarian. We're the protagonist of this slide.

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

**Visual:**
- **Background**: brand indigo orb top-left + accent indigo orb right-center. Grain 2%.
- **Three pricing cards** in equal columns, each styled distinctly via top-border accent color:
  - **Card 1 — Platform fee**: brand indigo top border (4px, gradient fade to transparent at edges). Icon: Lucide `percent`. Heading: "Platform fee". Oversized mono price: `0.5%` in brand indigo with glow. Sub-caption: "of deal value". Body: "Cheaper than notary, lawyer, or bank escrow." Bottom of card: tiny comparison strip showing competitor costs as faded mono text ("Notary: ~2% · Bank escrow: $200+ flat · Lawyer: $500+ review").
  - **Card 2 — Premium AI**: accent indigo top border. Icon: Lucide `sparkles`. Heading: "Premium AI". Oversized mono price: `$49` in accent indigo. Sub-caption: "per month / business". Body: "Dispute drafting, contract templates, analytics." Bottom: three feature-tag pills in hairline chips.
  - **Card 3 — Reputation layer**: success-green top border. Icon: Lucide `badge-check`. Heading: "Reputation layer". Oversized mono price: styled as a verification badge (not dollar amount — just a badge visual). Sub-caption: "Paid verification". Body: "Verified merchants get premium placement." Bottom: "Launch: Q3 2026" pill in muted color.
- **Unit economics strip** below the cards, full-width:
  - Glass card with 1px hairline, 16px padding.
  - Left side: math visualization — `$50,000` → × → `0.5%` → = → `$250`. Each element in a mono pill, connected by subtle arrows. The `$250` has a small success-green glow.
  - Right side: "Break-even: ~20 deals/month" in weight 510, with a tiny progress bar showing 20/20 filled in brand indigo.
- **Eyebrow texture**: "BUSINESS MODEL" set huge at 140pt weight 200 in `rgba(255,255,255,0.03)` behind the cards top row — typography as ambient ornament.

**Tone:** Analytical, simple math. The cards should feel like a real pricing page, not a table.

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

**Visual:**
- **Background**: brand indigo orb top-left, warmth magenta bottom-right (warmth = human relationships). Grain 2%. Subtle line grid at 48px spacing, 3% opacity, radially masked.
- **Partner credential card (top-right)**: 240×120 glass card showing "18 YEARS" as oversized mono with brand-indigo glow, caption "in trading, investing, crypto" below. Small `users` Lucide icon top-left of card. This is our proof-of-distribution at a glance.
- **Horizontal timeline (hero visual, 55% of slide height)**:
  - Single horizontal rail — 2px gradient line (transparent → brand indigo → accent indigo → success green → transparent) spanning the slide width.
  - Three milestone nodes on the rail: 64px circles with 2px brand-indigo border + glass fill, each containing a Lucide icon: `rocket` (post-hackathon) · `megaphone` (month 2–6) · `map` (year 1).
  - Above each node: date label in mono (`Weeks 1–4` · `Months 2–6` · `Year 1`) with a glowing accent dot.
  - Below each node: a glass card (240px wide) with the bullets for that phase, 1-2 bullets each, Lucide check icon prefix in brand indigo.
  - Between nodes: dashed connector ornaments with small arrow caps, indicating momentum.
- **Year-1 map visual (right side of timeline)**: SEA region outline (Indonesia, Vietnam, Philippines, Thailand) rendered as 1.5px stroke at 40% brand indigo, each country with a small pulsing dot. "Same archetype, same pain" caption in italic muted below.
- **Eyebrow ornament**: "GO TO MARKET" at 140pt weight 200 in 3% white behind the headline — ambient texture.
- **Bottom strip (optional)**: a pengusaha-meetup iconography row — small Lucide glyphs for `coffee` (warung), `store`, `handshake`, `users` — rendered in muted color, representing the grassroots sales motion.

**Tone:** Confident. The map + "18 YEARS" badge should make the distribution claim feel concrete, not aspirational.

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

**Visual:**
- **Background**: success green orb top-left at 8% (celebration of shipped work) + brand indigo orb right at 10%. Grain 2%.
- **Top strip — stats counter bar (full-width)**: four mono stat blocks in a row, each with oversized number + caption:
  - `4` — Anchor instructions
  - `3` — AI agent roles
  - `2` — founders
  - `4` — weeks
  Dividers are hairline vertical lines. Each number has subtle brand-indigo glow.
- **Left column (60%) — traction checklist**:
  - Each bullet in a faint glass strip (rgba white 2%, 1px top border only, 12px padding).
  - Success-green `check-circle-2` Lucide icon (20px) on the far left of each strip.
  - Bullet text in body weight, with emphasis words in weight 510 (instruction names, `create_deal`, `release_milestone`, etc. in mono pills inline).
  - Strips have a hairline divider between; slight hover-state glow possible for interactive PPTX.
- **Right column (40%) — team block**:
  - Two stacked team cards (glass, 1px border).
  - Each card: 96px circular avatar placeholder (2px brand-indigo ring + soft glow, monogram if no photo) on the left. Right side: name in weight 590, role label in muted small caps, then 2-line description.
  - Past-work badge pill on each card: e.g., "DLMM agent · self-learning" (Dev), "18 years · trading & crypto" (Partner).
  - Small Lucide icon badges indicating specialty: `terminal` (code) / `trending-up` (markets).
- **Closing line strip (full-width, below both columns)**:
  - Glass card with 2px gradient top-border (indigo → accent → transparent).
  - Text centered, 24–32pt weight 590.
  - Flanked by two tiny ornamental dots in brand indigo.
- **Bottom logo wall**: "Built on" row — Solana · Anchor · USDC · Next.js · Anthropic · Phantom · OpenRouter — monochrome 60%. Hairline above.

**Tone:** Evidentiary + human. The stat counter is the "hook," the checklist proves it, the team personalizes it.

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

**Visual:**
- **Background**: accent indigo orb top-right + brand indigo orb bottom-left + subtle magenta warmth center. Grain 2%. Very subtle dot grid at 3% to signal "scaffolding for what's next."
- **Top half — Roadmap timeline**:
  - Horizontal rail with 4 milestone stations, evenly spaced.
  - Rail is a 3px gradient bar (transparent → brand indigo → accent → success → transparent), slightly bowed (gentle curve up) to imply growth trajectory.
  - Each station is a glass card (160×120) above or below the rail alternating (zigzag pattern):
    - **Q2 2026** (above rail) — `rocket` Lucide icon + "Mainnet launch" + "First 10 paying businesses" as sub-line + stat pill: `10` paying · `$50K` TVL target
    - **Q3 2026** (below rail) — `scale` Lucide icon + "Dispute resolution" + "Optional arbitrator network"
    - **Q4 2026** (above rail) — `globe` Lucide icon + "Cross-border escrow" + "Multi-currency stablecoin routing"
    - **2027** (below rail) — `badge-check` Lucide icon + "Reputation NFTs" + "Portable across platforms"
  - Each station connects to the rail with a dashed vertical line + small indigo dot on the rail itself.
  - Stations have subtle brand-indigo glow, progressively brighter left-to-right (implying momentum).
- **Divider**: hairline horizontal divider with the word "THE ASK" centered on it as an eyebrow label.
- **Bottom half — Three ask cards** in equal columns:
  - **Card 1 — Capital**: glass card with brand-indigo top border. Icon: `banknote` Lucide. Oversized mono `$250K` with strong indigo glow. Caption: "Pre-seed round". Below: two small milestone pills — "100 active businesses" · "$1M TVL".
  - **Card 2 — Ecosystem partners**: accent-indigo top border. Icon: `network` Lucide. Heading: "Ecosystem partners". Body: "Solana stablecoin issuers, wallet providers, on-ramps." Logo wall mini-strip below: Circle · Phantom · Helius · Solflare monochrome.
  - **Card 3 — Design partners**: success-green top border. Icon: `handshake` Lucide. Heading: "Design partners". Body: "SEA B2B verticals — manufacturing, logistics, agriculture trade." Three tiny industry glyphs below (factory · truck · leaf) as ornaments.
- **Footer row** (full-width, below cards):
  - Three contact pills: `[email]` with mail icon · `github.com/Toderr/sealed` with GitHub octocat · `[url]` with globe icon.
  - All mono, hairline borders, slight glass fill.
  - Far right: small QR code (60×60) linking to the live demo URL — makes the deck work even in PDF form where links aren't clickable.
- **Final ornament**: the Sealed wordmark at bottom-center in weight 590, small, with the tagline under it in italic — "People break promises. Code doesn't." — as the final beat. Subtle indigo underline.

**Tone:** Forward-looking, inviting. The roadmap feels earned, the ask feels scoped, the close echoes the open.

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

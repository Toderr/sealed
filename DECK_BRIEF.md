# Sealed: Deck Brief for claude.ai/design

**What this file is:** a design-ready brief you paste into [claude.ai/design](https://claude.ai/design) to render the 10-slide Colosseum pitch deck. Not a deck itself.

**How to use:**

1. Open claude.ai/design
2. Paste this entire file
3. Prompt: *"Generate a 10-slide 16:9 dark pitch deck matching the design system and per-slide content below. Keep copy minimal (one primary message per slide). Don't invent stats. Use exactly what's provided."*
4. Iterate slide-by-slide if layouts miss.

---

## Design System

**Palette** (dark mode, Linear-inspired):

| Token | Hex | Use |
|---|---|---|
| Background | `#08090a` | Slide background |
| Panel | `#0f1011` | Raised panels |
| Surface | `#191a1b` | Cards, callouts |
| Text primary | `#f7f8f8` | Headlines, body |
| Text muted | `#8a8f98` | Eyebrows, metadata |
| Brand indigo | `#5e6ad2` | Primary emphasis |
| Accent indigo | `#7170ff` | Secondary emphasis |
| Success | `#4ade80` | Positive data |
| Warning | `#fbbf24` | Alerts, stat callouts |
| Danger | `#f87171` | Risk, scam framing |
| Border | `rgba(255,255,255,0.08)` | Hairlines |

**Typography:**

- **Headings**: Inter, weight 590, letter-spacing −0.02em at display sizes
- **Body**: Inter, weight 400
- **Emphasis inline**: weight 510
- **Numerics**: JetBrains Mono for dollar amounts, program IDs, wallet addresses

**Layout rules:**

- 16:9, generous padding (≥80px outer)
- **One primary message per slide.** Minimal text. Let the visual carry the weight.
- No emoji. Minimal stroked SVG glyphs only (Lucide-style).
- Eyebrow labels: uppercase, tracked +0.1em, 12–14pt, muted
- Pull-quotes: italic, left-border accent in brand indigo
- Tables: hairline borders only, no filled cells

**Tone references** (copy verbatim where called for):
- "People break promises. Code doesn't." (primary tagline)
- "No lawyer. No bank. No dispute hotline. Just code that can't lie."
- "Escrow is a feature. Negotiation is the product."

---

## Supporting Elements Library

Reference Linear.app's product pages. Dark but never plain. Every surface has ambient depth. **Don't leave slides flat black.**

### 1. Gradient mesh backdrops (every slide)

Layer 2–3 overlapping radial gradient orbs, each 15–30% of slide width, 8–15% opacity, ~200px blur:

- Primary orb: brand indigo `#5e6ad2`
- Secondary orb: accent indigo `#7170ff` (opposite corner, dimmer)
- Warmth orb: magenta `#c47aff` at 5% (breaks cool palette)

Vary orb position per slide so the deck doesn't feel like one wallpaper.

### 2. Noise / grain overlay

2–3% opacity monochrome grain on every background.

### 3. Grid / dot patterns (technical slides: 3, 4, 6)

- Dot grid: 24px spacing, 1.5px dots, 4% white opacity
- Radially masked so it fades at edges

### 4. Glass cards (emphasis blocks)

- Fill: `rgba(255,255,255,0.03)`
- Backdrop blur: 20px
- Border: 1px `rgba(255,255,255,0.08)`
- Inner top highlight: 1px `rgba(255,255,255,0.05)`
- Corner radius: 12–16px
- Optional drop shadow: `0 24px 64px rgba(0,0,0,0.4)`

### 5. Glow effects

- Primary: `0 0 48px rgba(94,106,210,0.35)` (brand indigo, hero words)
- Warning: `0 0 40px rgba(251,191,36,0.3)` (alarming stats)
- Success: `0 0 32px rgba(74,222,128,0.25)` (shipped markers)
- Danger: `0 0 40px rgba(248,113,113,0.3)` (scam/fraud stats)

Subtle. Should register, not scream.

### 6. Icon set: Lucide, stroked (1.5px)

Common mappings:
- Chat `message-square` · Handshake `handshake` · Lock `lock`
- Shield `shield-check` · Release `arrow-up-right` · Refund `rotate-ccw`
- Problem `x-circle` · Check `check-circle-2`
- Chart `trending-up` · Map `map-pin` · Team `users`
- Program `terminal` · Wallet `wallet` · Fraud `alert-triangle`

### 7. Data-viz primitives (stat slides 2, 5, 7)

- Oversized numbers: 120–180pt mono, glow, subtle white → muted gradient
- Mini line charts: behind stats, 1.5px stroke, brand indigo, 30% opacity, rising
- Stat cards: glass + oversized number + caption

### 8. Flow primitives (Slide 3)

- Agent nodes: 96px glass circles with brand-indigo border + icon + label
- Connector lines: 1px dashed muted, or 2px solid brand indigo for active
- Hub-and-spoke or horizontal chain

### 9. Screenshot treatment (Slide 4)

- Floating card frame: 16–20px radius, 1px hairline, drop shadow `0 32px 80px rgba(0,0,0,0.5)`
- Subtle brand-indigo glow behind
- Multi-screenshot grid: slight z-stagger so it feels like a product

### 10. Typography as texture

- Oversized section eyebrow: 140pt weight 200 in `rgba(255,255,255,0.04)` behind main content
- Accent underlines under hero words: 2px brand-indigo gradient stroke

---

## Slide 1 · Title

**Eyebrow:** (none)
**Wordmark:** `SEALED`
**Tagline (italic, muted):** *People break promises. Code doesn't.*
**Sub-copy:** AI escrow for business deals. Any currency. Any chain.
**Footer (mono, muted):** Program ID `3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ` · Solana devnet

**Visual:**
- Triple gradient orb backdrop (brand indigo top-left, accent bottom-right, magenta center behind wordmark). 200px blur.
- Wordmark: ~180pt display weight, letter-spacing −0.03em, soft glow `0 0 80px rgba(94,106,210,0.4)`.
- Gradient accent underline (fades transparent → brand indigo → transparent) beneath wordmark.
- Tagline sits 40px below, italic, muted.
- 6–12 floating 2–4px brand-indigo particles in negative space, 30–50% opacity.
- Top-right: hairline pill "devnet" with pulsing green dot.

**Tone:** Confident, quiet. Breathes but never barren.

---

## Slide 2 · Problem

**Eyebrow:** THE PROBLEM
**Headline:** Business deals break. Both sides lose.
**Body (two stat columns):**

**Web2:**
- `$15B` lost to freelancer non-payment in 2025
- `58%` face unpaid invoices
- `79%` of companies targeted by payment fraud in 2024

**Web3:**
- `$17B` stolen in crypto scams in 2025
- `1,400%` jump in impersonation fraud
- AI scams 4.5× more profitable than traditional

**Kicker (pull-quote style, centered):** *One root cause. No enforceable deal layer.*

**Footer (mono, muted):** Sources: Flexable 2025 Freelance Payment Report · Chainalysis 2026 Crypto Crime Report

**Visual:**
- Background: danger-red orb top-left at 8% + warning-yellow orb top-right at 8% (both sides have a fraud problem). Brand indigo orb bottom-center at 10% (implies solution coming). Grain 3%.
- **Split layout (60% top / 40% bottom)**:
  - Top half: two stat columns side-by-side, hairline vertical divider between.
    - **Left column "WEB2"**: eyebrow label in warning-yellow. Oversized display `$15B` in mono 140pt with warning glow. Three stat chips stacked below: "58% face unpaid invoices" · "79% hit by fraud in 2024" · "broken promises, no recourse". Small Lucide `alert-triangle` icon top-right of column.
    - **Right column "WEB3"**: eyebrow label in danger-red. Oversized display `$17B` in mono 140pt with danger glow. Three stat chips stacked below: "1,400% impersonation spike" · "AI scams 4.5× more profitable" · "crypto trust crisis". Small Lucide `x-circle` icon top-right.
  - Horizontal divider below (1px gradient, transparent → brand indigo → transparent).
  - Bottom half: kicker line as full-width glass card, italic 32–40pt, centered. Small brand-indigo pipe `·` separator between the two short sentences.
- Optional ambient: "THE PROBLEM" at 140pt weight 200 in 3% white behind the column headers.
- Sources: mono 10pt muted, bottom-right.

**Tone:** Analytical, urgent. The numbers tell the story. Keep text count minimal.

---

## Slide 3 · Solution

**Eyebrow:** THE SOLUTION
**Headline:** Three AI agents. One deal table.
**Body (single-line descriptions):**

- **Structurer** parses the deal.
- **Negotiator** reaches terms for both sides.
- **Verifier** reviews delivery.

**Closing row (muted body):** Funds lock on-chain. Release on milestone. Mutual refund if it breaks.

**Pull-line (large, centered, bottom):** *No lawyer. No bank. No dispute hotline. Just code that can't lie.*

**Visual:**
- Background: dot-grid pattern (24px, 1.5px dots, 4% opacity, radially masked). Brand-indigo orb top-center at 10%. Grain 2%.
- **Top band**: three 96px glass circles in a row, spaced generously. Each has 1.5px brand-indigo border + soft glow with a Lucide icon: `terminal` (Structurer) · `handshake` (Negotiator) · `shield-check` (Verifier). Agent name below each in weight 590 brand indigo, one-line role below in muted 12pt. Dashed 1px connector lines between circles (shared engine).
- **Middle band**: single-line summary row in muted body text. Brand-indigo dot delimiters between the three short sentences.
- **Bottom band**: full-width glass card centered at 32–40pt italic, 2px gradient top-border (transparent → brand indigo → transparent). The four short sentences separated by faint `·` pipe dividers.
- Side ornament (far left): 1px vertical hairline with three 8px brand-indigo dots aligned to the agents above.

**Tone:** Confident, minimal. Let whitespace do work.

---

## Slide 4 · Product Demo

**Eyebrow:** PRODUCT
**Headline:** Live on Solana devnet today.
**Sub-line (mono):** Program ID `3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ`

**Body (two tight groups):**

**Core flow:** chat → negotiate → fund → verify → release

**Recovery flow:** AI Verifier proof review + mutual refund via 2-sig handoff

**Visual:**
- Background: brand-indigo orb top-right at 10%, accent indigo bottom-left at 8%. Dot grid at 3%. Grain 2%.
- Top-left: pulsing 8px success-green dot + "LIVE · DEVNET" pill (hairline border, mono 11pt, muted).
- Program ID in mono code pill, centered under headline, 1px hairline, 6px radius, slight brand-indigo left-border accent, with copy icon.
- **Screenshot grid (hero visual, takes ~60% of slide height)**:
  - 2 rows × 3 columns = 6 frames, top-left frame 2× scale (hero shot).
  - Each frame: 12–16px radius, 1px hairline border, drop shadow `0 32px 80px rgba(0,0,0,0.5)`, subtle brand-indigo glow behind.
  - Hero frame: perspective-rotate 6° clockwise for prominence.
  - Caption under each frame: 11pt muted, tight.
  - If no screenshots: labeled placeholder rectangles with view name + tiny Lucide icon.
- Label the grid halves with 2 tiny section eyebrows inline: "CORE FLOW" above the first 4 frames, "RECOVERY FLOW" above the remaining 2. Hairline vertical divider between groups.
- **No logo wall. No "built in 4 weeks" line.** Keep the slide breathable.

**Tone:** Evidentiary. The screenshots do the talking.

---

## Slide 5 · Why Now

**Eyebrow:** WHY NOW
**Headline:** Three curves converging.
**Body (3 stat blocks):**

1. **Stablecoin B2B payments:** `$226B` in 2025, up **733% YoY** (McKinsey/Artemis, Feb 2026).
2. **Trust crisis:** `$17B` lost to crypto scams in 2025 = demand for verifiable trust (Chainalysis 2026).
3. **AI agents** finally good enough to parse messy business intent into structured contracts.

**Emphasis line (brand-indigo accent, bottom):** The plumbing is ready. The trust layer isn't. Yet.

**Footer (mono, muted):** Sources: McKinsey (Feb 2026) · Chainalysis 2026

**Visual:**
- Background: three subtle orbs behind each stat column: brand indigo · accent indigo · warmth magenta. 10% opacity, heavy blur. Grain 2%.
- Decorative eyebrow: "WHY NOW" at 140pt weight 200 in `rgba(255,255,255,0.03)` behind headline.
- **Three stat columns** as glass cards, hairline dividers between:
  - **Column 1**: Lucide `trending-up` icon (brand indigo, 32px). Display stat `$226B` mono 120pt with indigo glow. Behind number: rising line chart (6–8 points, 1.5px brand-indigo stroke, 25% opacity). Caption: "Stablecoin B2B payments, 2025" + warning-yellow tag pill "+733% YoY".
  - **Column 2**: Lucide `alert-triangle` icon (danger red). Display stat `$17B` mono 120pt with danger glow. Caption: "Lost to crypto scams, 2025" + tag pill "Impersonation +1,400%".
  - **Column 3**: Lucide `sparkles` icon. Display phrase `NOW` mono 120pt with indigo glow. Caption: "AI agents can finally parse messy business intent."
- **Emphasis line**: as a distinct glass card at bottom, 2px accent-indigo top-border highlight, small spark glyph. Italic 28–32pt.
- Sources: mono 10pt muted, bottom-right.

**Tone:** Analytical, urgency-building. Numbers carry the slide.

---

## Slide 6 · Why us

**Eyebrow:** DIFFERENTIATION
**Hero pull-quote (dominant):** *Escrow is a feature. Negotiation is the product.*

**Body (tight):**
Bare on-chain escrow already exists. Nobody in our target market uses it, because locking funds is the *last* 10% of the work.

The first 90% is structuring, negotiating, judging delivery.

**Closing line:** Our wedge is AI-first. Escrow is the settlement rail underneath.

**Visual:**
- Background: warmth magenta orb top-center at 10% (breaks cool palette, signals spicy). Grain 2%.
- **Hero headline treatment**: pull-quote at 48–56pt weight 590 with "feature" and "product" in brand indigo + gradient underlines. 30% of slide vertical space.
- **Split comparison panel (dominant visual, 50% of slide)**:
  - **Left panel ("BARE ESCROW dApps")**: muted-red eyebrow. Vertical 4-stage funnel: `Structure → Negotiate → Sign → Release`. Stages 1–3 muted/greyed with red `x-circle` icons (dropped). Funnel narrows harshly before "Release". Arrows dashed, broken.
  - **Right panel ("SEALED")**: brand-indigo eyebrow. Same 4-stage funnel, all stages glow brand indigo with success-green checkmarks. Each stage labeled with agent (Structurer · Negotiator · Verifier · on-chain release). Arrows solid 2px brand indigo.
  - 1px hairline divider between panels.
- Optional ornament: meter gauge showing "10%" (left) and "100%" (right).
- Closing line: full-width bottom, weight 510, "AI-first" and "settlement rail" bolded.

**Tone:** Confident, slightly contrarian.

---

## Slide 7 · Business Model

**Eyebrow:** BUSINESS MODEL
**Headline:** Revenue at three points.
**Body (3 cards):**

| Stream | Price | Note |
|---|---|---|
| **Platform fee** | `1%` of deal value | Pays compute + infra from deal one |
| **Premium AI** | `$53.90`/mo | Bring your own LLM, or use ours |
| **Verified merchant** | `$100` one-time | Filter for serious parties |

**Closing line:** One `$50,000` deal = `$500`. Verified merchants get premium placement and a trust badge other parties actually look for.

**Visual:**
- Background: brand indigo orb top-left + accent indigo right-center. Grain 2%.
- **Three pricing cards** in equal columns with distinct top-border accent colors:
  - **Card 1 (Platform fee)**: brand-indigo top border (4px gradient fade). Lucide `percent` icon. Heading "Platform fee". Oversized mono `1%` in brand indigo with glow. Sub-caption "of deal value". Body "Pays compute + infra from deal one."
  - **Card 2 (Premium AI)**: accent-indigo top border. Lucide `sparkles` icon. Heading "Premium AI". Oversized mono `$53.90` in accent indigo. Sub-caption "per month". Body "Bring your own LLM key, or use ours." Bottom row: three LLM provider pills (Anthropic · OpenAI · OpenRouter) in hairline chips.
  - **Card 3 (Verified merchant)**: success-green top border. Lucide `badge-check` icon. Heading "Verified merchant". Oversized mono `$100` in success green. Sub-caption "one-time fee". Body "Filter for serious parties." Bottom: trust-badge mini-visual (circular checkmark seal in success green).
- **Closing strip** below cards (full-width glass):
  - Left: math visualization `$50,000` → × → `1%` → = → `$500`. Each element in a mono pill, connected by subtle arrows. `$500` has small success-green glow.
  - Right: "Verified merchants get premium placement + a trust badge." Italic 16pt muted.
- Eyebrow texture: "BUSINESS MODEL" at 140pt weight 200 in `rgba(255,255,255,0.03)` behind cards top row.

**Tone:** Clean pricing page feel, not a dense table.

---

## Slide 8 · Go To Market

**Eyebrow:** GO TO MARKET
**Headline:** Hide the crypto. Keep the guarantees.
**Body:**

Most businesses don't hold crypto. Our cofounder's 18-year network is web2. So we built the wrapper.

- **Email / Google login** via social wallet. No seed phrases.
- **Pay in local currency.** Auto on/off-ramp: IDR, USD, and more via Xendit, MoonPay, Transak.
- **Deal table in plain language.** USDC is invisible plumbing.

**Rollout timeline:**
- **Weeks 1–4:** 10 beta deals from cofounder's pengusaha network.
- **Months 2–6:** Freelance agencies, cross-border B2B, SEA manufacturing.
- **Year 1:** Regional expansion + web3-native power-user tier (own wallet, lower fees).

**Visual:**
- Background: brand indigo orb top-left + warmth magenta bottom-right. Line grid at 48px spacing, 3% opacity, radially masked. Grain 2%.
- **Top row: three feature pills (full-width glass strip)**: each with Lucide icon + short label.
  - `mail` "Social login" · `credit-card` "Fiat on/off-ramp" · `message-square-text` "Plain-language deals"
  - Each pill 1px hairline, brand-indigo icon, weight 510 label. Dividers between = hairline vertical lines.
- **Middle row: horizontal timeline (hero visual, ~45% of slide)**:
  - Single horizontal rail: 2px gradient line (transparent → brand indigo → accent indigo → success green → transparent).
  - Three milestone nodes on the rail: 64px circles, 2px brand-indigo border + glass fill, Lucide icons: `rocket` (weeks 1–4) · `megaphone` (months 2–6) · `globe` (year 1).
  - Above each node: date label in mono with glowing accent dot.
  - Below each node: glass card (240px wide) with the bullets for that phase.
- **Bottom row**: partner credential line as ambient text. "18 YEARS" in brand-indigo mono with glow + caption "in trading, investing, crypto" below. This is the distribution proof.
- Decorative eyebrow: "GO TO MARKET" at 140pt weight 200 in 3% white behind headline.

**Tone:** Practical. The wrapper framing + cofounder credential should make the distribution claim feel concrete.

---

## Slide 9 · Traction + Team

**Eyebrow:** TRACTION + TEAM
**Headline:** Already shipping.
**Traction (checkmark list, tight):**

- Full lifecycle on Solana devnet: chat → negotiate → fund → proof → verify → release → complete
- Dual-agent negotiation with BusinessMemory per wallet
- AI Verifier scoring milestone proofs
- Mutual refund via 2-sig partial-sign handoff. No trusted relay.
- Anthropic direct + OpenRouter both supported

**Next:** Social wallet + fiat on/off-ramp for web2 onboarding.

**Team:**
- **[Dev name]** builds AI agents. Previously shipped a DLMM agent that auto-screens, opens, and closes positions with self-learning.
- **[Partner name]** has 18 years in trading, investing, crypto. Direct line to target customer segment.

**Closing line (large):** Two people. Four weeks. Working product.

**Visual:**
- Background: success green orb top-left at 8% + brand indigo orb right at 10%. Grain 2%.
- **Top strip (stats counter bar, full-width, 4 mono blocks)**:
  - `4` Anchor instructions · `3` AI agent roles · `2` founders · `4` weeks
  - Hairline vertical dividers. Each number has subtle brand-indigo glow.
- **Left column (60%), traction checklist**:
  - Each bullet in a faint glass strip (rgba white 2%, 1px top border, 12px padding).
  - Success-green `check-circle-2` Lucide icon (20px) far left of each strip.
  - Body weight text, emphasis words in weight 510, instruction names in mono pills inline.
  - "Next:" bullet at the bottom uses an `arrow-right` icon in accent indigo instead of check.
- **Right column (40%), team block**:
  - Two stacked team cards (glass, 1px border).
  - Each card: 96px circular avatar placeholder (2px brand-indigo ring + glow, monogram if no photo) on left. Right: name weight 590, role muted small caps, 2-line description.
  - Past-work badge pill on each card: "DLMM agent · self-learning" (Dev), "18 years · trading & crypto" (Partner).
  - Small Lucide icon badges: `terminal` (Dev) · `trending-up` (Partner).
- **Closing line strip (full-width, below columns)**:
  - Glass card, 2px gradient top-border (indigo → accent → transparent).
  - Text centered 24–32pt weight 590.

**Tone:** Evidentiary + human. Stats hook, checklist proves, team personalizes.

---

## Slide 10 · Ask + Roadmap

**Eyebrow:** THE ASK
**Headline:** What we're building next.
**Roadmap:**

- **Q2 2026:** Mainnet launch + web2 wrapper (social wallet, fiat ramps).
- **Q3 2026:** Dispute resolution. Optional arbitrator network.
- **Q4 2026:** Multi-currency cross-border escrow.
- **2027:** Portable on-chain reputation NFTs.

**The ask (3 blocks):**
- **`$250K` pre-seed** to reach 100 active businesses and `$1M` TVL.
- **Ecosystem partners:** stablecoin issuers, wallets, fiat ramps.
- **Design partners:** SEA B2B verticals (manufacturing, logistics, agri-trade).

**Footer (mono):** Contact: `[email]` · GitHub: `github.com/Toderr/sealed` · Live demo: `[url]`

**Visual:**
- Background: accent indigo orb top-right + brand indigo bottom-left + subtle magenta warmth center. Very subtle dot grid at 3%. Grain 2%.
- **Top half (Roadmap timeline)**:
  - Horizontal rail, 4 milestone stations, evenly spaced.
  - Rail is 3px gradient bar (transparent → brand indigo → accent → success → transparent), slightly bowed upward (growth trajectory).
  - Stations zigzag above/below the rail. Each 160×120 glass card:
    - **Q2 2026** (above): `rocket` icon + "Mainnet + web2 wrapper" + sub-line "social wallet, fiat ramps"
    - **Q3 2026** (below): `scale` icon + "Dispute resolution" + "optional arbitrator"
    - **Q4 2026** (above): `globe` icon + "Cross-border escrow" + "multi-currency routing"
    - **2027** (below): `badge-check` icon + "Reputation NFTs" + "portable across platforms"
  - Dashed vertical connectors + indigo dot on rail. Stations glow progressively brighter left-to-right.
- **Divider**: hairline horizontal with "THE ASK" eyebrow centered on it.
- **Bottom half (three ask cards)** in equal columns:
  - **Card 1 (Capital)**: brand-indigo top border. `banknote` icon. Oversized mono `$250K` with strong indigo glow. Caption "Pre-seed". Two milestone pills: "100 active businesses" · "$1M TVL".
  - **Card 2 (Ecosystem partners)**: accent-indigo top border. `network` icon. Heading "Ecosystem partners". Body "Stablecoin issuers, wallets, fiat ramps." Logo strip below (monochrome): Circle · Phantom · Helius · MoonPay.
  - **Card 3 (Design partners)**: success-green top border. `handshake` icon. Heading "Design partners". Body "SEA B2B verticals: manufacturing, logistics, agri-trade." Three tiny industry glyphs (factory · truck · leaf).
- **Footer row (below cards)**:
  - Three contact pills: `[email]` with mail icon · `github.com/Toderr/sealed` with GitHub icon · `[url]` with globe icon. Mono, hairline borders, slight glass fill.
  - Far right: small QR code (60×60) linking to live demo.
- **Final ornament**: Sealed wordmark bottom-center weight 590 small, italic tagline under it: *"People break promises. Code doesn't."* Subtle indigo underline.

**Tone:** Forward-looking, inviting. Roadmap feels earned, ask feels scoped, close echoes the open.

---

## After claude.ai/design renders

Check each slide against these:

- [ ] One primary message per slide. Minimal text. Visuals carry the weight.
- [ ] All dollar amounts, program IDs, deal IDs, wallet addresses in mono
- [ ] Agent names (Structurer, Negotiator, Verifier) visually emphasized in brand indigo on Slide 3
- [ ] Web2 + Web3 stat columns on Slide 2 are visually symmetric and read as dual sides of one problem
- [ ] "Escrow is a feature. Negotiation is the product." reads as a hero line on Slide 6
- [ ] No emoji as icons. Minimal stroked SVG only.
- [ ] Contrast: text-primary on background passes 7:1 (WCAG AAA).
- [ ] Placeholders intact: `[Dev name]`, `[Partner name]`, `[email]`, `[url]`, screenshot frames on Slide 4.

Export options: PDF (email) + PPTX (speaker notes + edits) + individual PNGs per slide (Colosseum uploads).

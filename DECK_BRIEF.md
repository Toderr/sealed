# Sealed: Deck Brief for claude.ai/design

**What this is:** a design-ready brief for claude.ai/design to render a 10-slide Colosseum pitch deck. Paste it, iterate per slide.

**Prompt to paste alongside this file:**

> *Generate an 11-slide 16:9 dark pitch deck matching the design system and per-slide spec below. **Strict rules:** one primary message per slide. Keep copy to the exact strings under "Text (verbatim)". Never invent stats, sentences, or additional bullets. If a slide looks empty, add ambient visual depth (orbs, grain, dot grid), not more copy. The visual should carry the weight. Respect the global rhythm elements (slide counter, progress rail, scanlines, watermark) on every slide.*

**How to iterate slide-by-slide:**
Pick one slide, paste only that slide's section (plus the Design System block), and prompt: *"Re-render slide N only. Keep the verbatim copy. Re-design the layout."*

---

## Density budget (hard rules)

These exist because the previous draft was text-heavy. Enforce on every slide.

- **Headline:** ≤10 words.
- **Body copy:** ≤30 words per slide (stats, sub-labels, and captions count).
- **Bullets:** ≤5 per slide, each ≤8 words. Prefer tags over sentences.
- **No explanatory paragraphs.** If a point needs a paragraph, it's a speaker-notes line, not a slide line.
- **Numbers and brand terms in mono.** Dollar amounts, program IDs, wallet addresses, `USDC`, `SOL`.
- **No emoji. No decorative punctuation runs.** Lucide icons only.

If a slide feels sparse, add ambient depth (gradient orbs, grain, dot grid, typography-as-texture), not more words.

---

## Design system

**Palette** (dark, Linear-inspired):

| Token | Hex | Use |
|---|---|---|
| Background | `#08090a` | Slide bg |
| Panel | `#0f1011` | Raised blocks |
| Surface | `#191a1b` | Cards |
| Text primary | `#f7f8f8` | Headlines, body |
| Text muted | `#8a8f98` | Eyebrows, metadata |
| Brand indigo | `#5e6ad2` | Primary emphasis |
| Accent indigo | `#7170ff` | Secondary emphasis |
| Success | `#4ade80` | Positive data |
| Warning | `#fbbf24` | Alert stats |
| Danger | `#f87171` | Risk, scam stats |
| Border | `rgba(255,255,255,0.08)` | Hairlines |

**Typography:**
- Headings: Inter 590, letter-spacing −0.02em at display sizes
- Body: Inter 400
- Emphasis inline: Inter 510
- Numerics: JetBrains Mono (dollar amounts, IDs, addresses)

**Layout rules:**
- 16:9, ≥80px outer padding
- Eyebrow labels: uppercase, tracked +0.1em, 12–14pt, muted
- Pull-quotes: italic, left-border accent in brand indigo
- Tables: hairline borders only, no filled cells

**Tone strings** (copy verbatim where called for):
- Tagline: `People break promises. Code doesn't.`
- Closing: `No lawyer. No bank. No dispute hotline. Just code that can't lie.`
- Wedge line: `Escrow is a feature. Negotiation is the product.`

---

## Brand mark (locked)

Use this mark wherever a `Sealed` logo appears. Do not swap it for generic shield / lock icons. Color inherits from the surrounding text (render in `#f7f8f8` on dark bg for this deck).

**Geometry (120×120 viewBox):**
- Dot: `cx=60 cy=60 r=13`, filled.
- Ring: `cx=60 cy=60 r=54`, stroke `1.25`, opacity `0.22`, fill none.
- Whiskers: 3 per side, `stroke=3`, `stroke-linecap=round`.
  - Inner x at `±20` from center, outer x at `±37`.
  - Top stroke: `y1=-12, y2=-15` (angles up-out).
  - Middle stroke: `y1=0, y2=0` (horizontal).
  - Bottom stroke: `y1=12, y2=15` (angles down-out).

**Copy-paste SVG (white on transparent):**
```svg
<svg viewBox="0 0 120 120" width="120" height="120" fill="none">
  <circle cx="60" cy="60" r="54" stroke="#f7f8f8" stroke-width="1.25" opacity="0.22"/>
  <g stroke="#f7f8f8" stroke-width="3" stroke-linecap="round">
    <line x1="80" y1="48" x2="97" y2="45"/>
    <line x1="80" y1="60" x2="97" y2="60"/>
    <line x1="80" y1="72" x2="97" y2="75"/>
    <line x1="40" y1="48" x2="23" y2="45"/>
    <line x1="40" y1="60" x2="23" y2="60"/>
    <line x1="40" y1="72" x2="23" y2="75"/>
  </g>
  <circle cx="60" cy="60" r="13" fill="#f7f8f8"/>
</svg>
```

**Usage in this deck:**
- Slide 1: stacked lockup, mark above wordmark, mark at 120–160pt.
- Slide 10 closing ornament: inline lockup, mark ~28pt next to wordmark.
- Any in-context mockup (browser chrome, favicon strip, chat avatar): use the mark at favicon scale. Ring on at ≥24pt; ring off at ≤20pt so the whiskers stay legible.

**Clear space:** min 1× dot radius (13u) on all sides. Do not place inside filled chips / pills on dark bg.

---

## Global rhythm elements (every slide)

These repeat across all 11 slides in the exact same position. They read as structural rhythm, not clutter.

1. **Slide counter** — `NN / 11` (mono, 10pt, muted) in the bottom-left corner, 32px from both edges. Increments per slide: `01 / 11`, `02 / 11`, … `11 / 11`.
2. **Progress rail (right edge)** — 1px vertical hairline, 60% of slide height, right-aligned 40px from the edge. 11 small dots evenly spaced along it. Current slide's dot glows brand indigo; past-slide dots at 20% white; future-slide dots at 6% white. Reads like a "you are here" spine.
3. **Hairline scanlines** — horizontal 1px lines every 40px at 1.5% white, additive with the grain overlay. Adds monitor/tech depth without fighting the copy.
4. **Watermark Sealed mark** — 280pt Sealed mark at 3% opacity, pinned to the top-right corner on content-heavy slides only: 2, 5, 7, 8, 10. Skip on 1, 3, 6, 9, 11 (those already have focal lockups or sparse compositions).
5. **Mono side annotations** — thin italic mono 9pt muted marginal callouts, editorial-style. Use on 4 slides where there's margin room:
   - Slide 2 right margin: `// root cause, not symptom`
   - Slide 4 right margin: `// deployed 2026-04 · solana devnet`
   - Slide 6 left margin: `// why we win`
   - Slide 10 right margin: `// targets, not promises`

---

## Ambient elements library

Apply 2–4 per slide. Varies per slide so the deck doesn't look like one wallpaper.

1. **Gradient orbs.** 2–3 per slide, 15–30% of width, 8–15% opacity, ~200px blur. Brand indigo + accent indigo always; magenta `#c47aff` at 5% for warmth on select slides.
2. **Grain overlay.** 2–3% monochrome noise on every slide.
3. **Dot / line grids** (technical slides only: 3, 4, 6). 24px dot spacing, 4% white, radially masked to fade at edges.
4. **Glass cards.** `rgba(255,255,255,0.03)` fill + 20px backdrop blur + hairline border + inner top highlight + 12–16px radius. Optional `0 24px 64px rgba(0,0,0,0.4)` shadow.
5. **Glows** (hero words, key numbers only). Brand `0 0 48px rgba(94,106,210,0.35)` · Warning `0 0 40px rgba(251,191,36,0.3)` · Danger `0 0 40px rgba(248,113,113,0.3)` · Success `0 0 32px rgba(74,222,128,0.25)`.
6. **Lucide icons** (1.5px stroke): `terminal`, `handshake`, `shield-check`, `message-square`, `lock`, `arrow-up-right`, `rotate-ccw`, `x-circle`, `check-circle-2`, `trending-up`, `alert-triangle`, `sparkles`, `map-pin`, `users`, `banknote`, `network`, `globe`, `rocket`, `scale`, `badge-check`, `percent`, `mail`, `credit-card`.
7. **Typography as texture.** Oversized section eyebrow (140pt, weight 200, `rgba(255,255,255,0.04)`) behind main content on stat-heavy slides.
8. **Accent underline.** 2px brand-indigo gradient stroke (fades transparent at both ends) under hero words.
9. **Diagonal light sweep.** 2px gradient line at 4% opacity sweeping top-left → bottom-right, ~15% of slide diagonal. Suggests a light hitting a dark stage. Use on Slides 1 + 11 only.
10. **Concentric orbit rings.** 2–3 thin rings (1px, 2–4% opacity), centered on a focal glyph. Use behind the Sealed mark on 1 + 11; behind the agent trio on 3.
11. **Dashed future treatment.** After a certain x-position, switch solid 2px rails/strokes to 1.5px dashed (`stroke-dasharray 4 4`). Signals "this hasn't happened yet." Use on Slide 10's Q4 / 2027 stations.
12. **Gauge bar.** Thin 1px hairline track with a filled segment + percentage labels at both ends. Use on Slide 6 to show `10%` (bare-escrow coverage) vs `90%` (Sealed coverage).
13. **Browser chrome mockup.** Faux browser shell around a screenshot: 3 traffic-light dots, URL bar showing `sealed-nine.vercel.app`, lock glyph. Use on Slide 4 hero frame only.
14. **Geographic fragment.** Outline-only SEA region (Indonesia + neighbors) at 4% opacity, bottom-right. Use on Slide 8 only — GTM wedge is SEA.
15. **Monogram background texture.** Large founder-initial letter at 3% opacity behind each founder card. Use on Slide 9.
16. **Endmark glyph.** 40px horizontal 1px bar with a centered 4px brand-indigo dot. Typographic "end of book" mark. Use on Slide 11 only, below the tagline.
17. **Revenue flow arrows.** 3 thin gradient arrows (1.5px, fade at mid-arrow) converging from each pricing card into a shared pool glyph below. Use on Slide 7 only.
18. **Timeline axis rule.** Horizontal 1px rule beneath stat columns with 4–5 tick marks labeled in mono 9pt (`'23 '24 '25 '26 '27`). Use on Slide 5 only.

---

## Per-slide bespoke hero elements

One richness hero per slide. Pick only the one that earns its keep. Do NOT layer all of them.

| Slide | Hero element | Rationale |
|---|---|---|
| 1 | Diagonal light sweep + concentric orbit rings behind lockup | Opening should feel staged |
| 2 | Stat-column icons upgraded to stylized **badge tiles** (32px rounded tile w/ icon inside, thin gradient border) | Columns feel balanced and designed, not templated |
| 3 | Concentric orbit rings centered between the 3 agent circles | Visualizes "three faces, one engine" |
| 4 | Browser chrome mockup around hero screenshot | Screenshot reads as a real product, not a crop |
| 5 | Timeline axis rule below the 3 columns | Ties the 3 stats to the "curves converging" story |
| 6 | Gauge bar at bottom showing `10%` vs `90%` coverage | Quantifies the pull-quote visually |
| 7 | 3 revenue flow arrows converging into a pool glyph labeled "platform revenue" | Shows the architecture of the pricing |
| 8 | SEA geographic fragment bottom-right + timeline nodes 2-tone (solid past, faded future) | Regional specificity without making it a map slide |
| 9 | Monogram background texture behind each founder card (`T` + `D` at 3%) | Depth without photo dependency |
| 10 | Dashed future treatment on Q4 / 2027 stations; Q2 + Q3 glow brighter | Confidence decay visualization |
| 11 | Diagonal light sweep + concentric orbit rings + endmark glyph below tagline | Book-ends Slide 1 at quieter intensity |

---

## Color polarity pass

Indigo dominates by default; add polarity so the deck doesn't read mono-chrome. Assignments:

- **Slide 2 Column B `NONE`** → danger-red glow (shifts from warning-yellow — aligns "absence = risk").
- **Slide 6 Panel A** bare-escrow funnel → muted danger-red tint on dropped stages.
- **Slide 6 Panel B** Sealed funnel → brand indigo stages with **success-green check accents** (mix palette, not mono-indigo).
- **Slide 7 Card 3** `$100 verified merchant` → success-green kept; seal glyph upgraded to a filled circle with check.
- **Slide 10 Q2 2026 station** → small success-green `check-circle-2` badge (signals "nearest to ship"). Q3 stays neutral indigo. Q4 + 2027 dashed.

Final palette rhythm: indigo dominant, green = achieved/live/settled, red = absence/risk, warning-yellow = non-payment/unpaid only.

---

## Slide 1 · Title

**Eyebrow:** (none)

**Text (verbatim):**
- Wordmark: `SEALED`
- Tagline (italic, muted): *People break promises. Code doesn't.*
- Sub: `AI escrow for business deals. Any currency. Any chain.`
- Footer (mono, muted): `Program ID 3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ · Solana devnet`

**Visual:**
- Triple gradient orb: brand indigo top-left, accent bottom-right, magenta warmth center behind wordmark. 200px blur.
- **Stacked lockup center:** Sealed mark (see "Brand mark (locked)" spec) at 120–160pt rendered in `#f7f8f8`, ring on, soft indigo glow `0 0 64px rgba(94,106,210,0.35)`. Directly beneath, the wordmark `SEALED` at ~180pt display weight, letter-spacing −0.03em. Clear space ≥13u between mark and wordmark.
- Gradient accent underline beneath wordmark.
- 6–12 floating brand-indigo particles (2–4px) in negative space at 30–50% opacity.
- Top-right: hairline pill "devnet" with pulsing green dot.
- Footer mono strip bottom-left.

**Tone:** Confident, quiet. Breathes.

---

## Slide 2 · Problem

**Eyebrow:** THE PROBLEM
**Headline:** `Business deals break. Both sides lose.`

**Text (verbatim):**
- Column A (label): `WEB2`
  - Hero stat: `$15B`
  - Caption: `lost to freelancer non-payment, 2025`
  - Tag: `58% face unpaid invoices`
- Column B (label): `WEB3`
  - Hero: `NONE`
  - Caption: `structured deal layer for on-chain agreements`
  - Tag: `bare escrow locks funds, not promises`
- Kicker (italic, centered): *One root cause. No enforceable deal layer.*
- Footer (mono, muted): `Source: Flexable 2025`

**Visual:**
- Bg: warning-yellow orb top-left at 8% + danger-red orb top-right at 8% (both sides have a problem). Brand-indigo orb bottom-center at 10% (solution signal). Grain 3%.
- **Top 60% split into two stat columns**, hairline vertical divider between:
  - Left `WEB2`: eyebrow warning-yellow. `$15B` mono 140pt with warning glow. Caption below in muted 14pt. One tag pill beneath ("58% face unpaid invoices"). Small Lucide `alert-triangle` icon top-right of column.
  - Right `WEB3`: eyebrow danger-red. `NONE` mono 140pt with danger-red glow. Caption below in muted 14pt. One tag pill beneath ("bare escrow locks funds, not promises"). Small `shield-off` icon top-right. Where the dollar-figure would normally sit, render a faded dashed-outline rectangle at 8% opacity to make the *absence* visible.
- Hairline horizontal divider (gradient, transparent → brand indigo → transparent).
- **Bottom 40%**: kicker as full-width glass card, italic 32–40pt, centered. `·` pipe separator.
- Ambient: "THE PROBLEM" at 140pt weight 200 in 3% white behind column headers.
- Sources: mono 10pt muted, bottom-right.

**Tone:** Analytical, urgent. Numbers carry the slide.

---

## Slide 3 · Solution

**Eyebrow:** THE SOLUTION
**Headline:** `Three AI agents. One deal table.`

**Text (verbatim):**
- Agent 1: `Structurer` — parses the deal.
- Agent 2: `Negotiator` — reaches terms.
- Agent 3: `Verifier` — reviews delivery.
- Micro-line (muted): `Funds lock on-chain. Release on milestone. Mutual refund if it breaks.`
- Closing (large, italic, centered): *No lawyer. No bank. No dispute hotline. Just code that can't lie.*

**Visual:**
- Bg: dot grid (24px, 1.5px dots, 4% opacity, radially masked). Brand-indigo orb top-center at 10%. Grain 2%.
- **Top band: three 96px glass circles** spaced generously. Each has 1.5px brand-indigo border + soft glow with centered Lucide icon: `terminal` · `handshake` · `shield-check`. Agent name below each in weight 590 brand indigo, role in muted 12pt one-liner. Dashed 1px connector lines between circles.
- **Middle strip:** single-line micro-sentence in muted body text. Brand-indigo `·` pipe delimiters between the three short clauses.
- **Bottom band:** full-width glass card with the closing line centered at 32–40pt italic. 2px gradient top-border (transparent → brand indigo → transparent). The four short sentences separated by faint `·` dividers.
- Side ornament (far left): 1px vertical hairline with three 8px brand-indigo dots aligned to the agents above.

**Tone:** Confident, minimal. Whitespace does work.

---

## Slide 4 · Product Demo

**Eyebrow:** PRODUCT
**Headline:** `Live on Solana devnet today.`

**Text (verbatim):**
- Sub-line (mono): `Program ID 3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ`
- Grid section A label: `CORE FLOW`
- Grid section B label: `RECOVERY FLOW`
- Core flow caption (one line): `chat → negotiate → fund → verify → release`
- Recovery flow caption (one line): `AI Verifier proof review · mutual refund via 2-sig handoff`

**Visual:**
- Bg: brand-indigo orb top-right at 10%, accent indigo bottom-left at 8%. Dot grid at 3%. Grain 2%.
- Top-left: pulsing 8px success-green dot + `LIVE · DEVNET` pill (hairline, mono 11pt, muted).
- Program ID in mono code pill, centered under headline: 1px hairline, 6px radius, slight brand-indigo left-border accent, with copy icon.
- **Screenshot grid (hero, ~60% of slide height)**:
  - 2 rows × 3 columns = 6 frames. Top-left frame 2× scale (hero shot, 2 cols × 2 rows).
  - Each frame: 12–16px radius, 1px hairline, drop shadow `0 32px 80px rgba(0,0,0,0.5)`, subtle brand-indigo glow behind.
  - Hero frame: perspective-rotate 6° clockwise for prominence.
  - Frame caption: 11pt muted, tight.
  - If no screenshots: labeled placeholder rectangles with tiny Lucide icon matching the step.
- Section eyebrows inline above groups: `CORE FLOW` and `RECOVERY FLOW`. Hairline vertical divider between groups.
- **Do NOT add:** "built in 4 weeks" badge, logo wall, or any bottom strip. Leave the slide breathable.

**Tone:** Evidentiary. Screenshots do the talking.

---

## Slide 5 · Why Now

**Eyebrow:** WHY NOW
**Headline:** `Three curves converging.`

**Text (verbatim):**
- Stat 1 label: `STABLECOIN B2B`
  - Hero: `$226B`
  - Caption: `2025, +733% YoY`
- Stat 2 label: `DEAL LAYER`
  - Hero: `MISSING`
  - Caption: `no on-chain standard for structured B2B agreements`
- Stat 3 label: `AI AGENTS`
  - Hero: `NOW`
  - Caption: `good enough to parse messy deals`
- Emphasis line (italic, brand-indigo accent): *The plumbing is ready. The trust layer isn't. Yet.*
- Footer (mono, muted): `Source: McKinsey Feb 2026`

**Visual:**
- Bg: three subtle orbs behind each stat column: brand indigo · accent indigo · warmth magenta. 10% opacity each, heavy blur. Grain 2%.
- Ambient eyebrow: "WHY NOW" at 140pt weight 200 in `rgba(255,255,255,0.03)` behind headline.
- **Three stat columns** as glass cards, hairline dividers between:
  - Column 1: Lucide `trending-up` icon (brand indigo, 32px). `$226B` mono 120pt with indigo glow. Rising mini line-chart (6–8 points, 1.5px brand-indigo stroke, 25% opacity) behind the number. Warning-yellow `+733% YoY` tag pill.
  - Column 2: Lucide `shield-off` icon (warning yellow). `MISSING` mono 120pt with warning-yellow glow. Caption below; no tag pill. Instead of a mini chart, render a faded dashed-outline rectangle where a filled data slot would sit — a literal visual gap.
  - Column 3: Lucide `sparkles` icon. Display phrase `NOW` mono 120pt with indigo glow. Caption only (no tag).
- **Emphasis line** at bottom as distinct glass card with 2px accent-indigo top-border, small spark glyph left. Italic 28–32pt.
- Sources: mono 10pt muted, bottom-right.

**Tone:** Analytical, urgency-building. Numbers carry.

---

## Slide 6 · Why us

**Eyebrow:** DIFFERENTIATION
**Hero pull-quote (dominant, takes ~30% vertical):** *Escrow is a feature. Negotiation is the product.*

**Text (verbatim):**
- Body (muted, tight): `Bare on-chain escrow already exists. Nobody uses it, because locking funds is the last 10% of the work.`
- Sub-body: `The first 90% is structuring, negotiating, judging delivery.`
- Closing line (bolded words as indicated): `Our wedge is **AI-first**. Escrow is the **settlement rail** underneath.`

**Visual:**
- Bg: warmth magenta orb top-center at 10% (signals "the spicy slide"). Grain 2%.
- **Hero treatment:** pull-quote at 48–56pt weight 590. Words `feature` and `product` in brand indigo with gradient underlines. Takes ~30% of vertical space.
- **Split comparison panel (50% of slide height, dominant)**:
  - Left panel `BARE ESCROW dApps`: eyebrow muted-red. Vertical 4-stage funnel: `Structure → Negotiate → Sign → Release`. Stages 1–3 muted/greyed with red `x-circle` icons (dropped). Funnel narrows harshly before Release. Arrows dashed, broken.
  - Right panel `SEALED`: eyebrow brand-indigo. Same 4-stage funnel. All stages glow brand indigo with success-green checkmarks. Each stage labeled with agent: `Structurer · Negotiator · Verifier · on-chain release`. Arrows solid 2px brand indigo.
  - 1px hairline divider between panels.
- Optional ornament: meter gauge showing `10%` (left panel) and `100%` (right panel).
- Closing line: full-width bottom strip, weight 510, emphasized words bolded.

**Tone:** Confident, slightly contrarian.

---

## Slide 7 · Business Model

**Eyebrow:** BUSINESS MODEL
**Headline:** `Revenue at three points.`

**Text (verbatim, as 3 cards):**
- Card 1 heading: `Platform fee`
  - Price: `1%`
  - Caption: `of deal value`
  - Body: `Covers compute + infra from deal one.`
- Card 2 heading: `Premium AI`
  - Price: `+5%`
  - Caption: `markup on LLM provider pricing`
  - Body: `Any provider · Anthropic, OpenAI, OpenRouter. Pass-through + 5%.`
- Card 3 heading: `Verified merchant`
  - Price: `$100`
  - Caption: `one-time`
  - Body: `Filter for serious parties.`
- Closing strip (below cards): `Verified merchants get premium placement and a trust badge.`

**Visual:**
- Bg: brand-indigo orb top-left + accent-indigo right-center. Grain 2%.
- **Three pricing cards** in equal columns with distinct top-border accents:
  - Card 1: brand-indigo 4px top border (gradient fade). Lucide `percent` icon. Price `1%` in brand indigo with glow. Body as above.
  - Card 2: accent-indigo top border. Lucide `sparkles` icon. Price `+5%` in accent indigo with the same glow treatment as other prices. Body + bottom row of three hairline LLM chips: `Anthropic` · `OpenAI` · `OpenRouter`.
  - Card 3: success-green top border. Lucide `badge-check` icon. Price `$100` in success green. Body + small circular trust-seal glyph in success green.
- **Closing strip** below cards as full-width hairline-top glass strip:
  - Centered italic 16pt muted line about verified-merchant benefits. No math row, no dollar pills.
- Ambient: "BUSINESS MODEL" at 140pt weight 200 in `rgba(255,255,255,0.03)` behind the card row.

**Tone:** Clean pricing page. Not a table.

---

## Slide 8 · Go To Market

**Eyebrow:** GO TO MARKET
**Headline:** `Hide the crypto. Keep the guarantees.`

**Text (verbatim):**
- Intro (muted, one line): `Most businesses don't hold crypto. We built the wrapper.`
- Feature pill 1: `Email / Google login` (Lucide `mail`)
- Feature pill 2: `Pay in local currency` (Lucide `credit-card`)
- Feature pill 3: `Plain-language deals` (Lucide `message-square`)
- Timeline node 1 label: `Weeks 1–4`
  - Sub: `10 beta deals · cofounder's network`
- Timeline node 2 label: `Months 2–6`
  - Sub: `Freelance agencies · cross-border B2B · SEA manufacturing`
- Timeline node 3 label: `Year 1`
  - Sub: `Regional expansion + web3 power-user tier`

**Visual:**
- Bg: brand-indigo orb top-left + warmth magenta bottom-right. Line grid 48px at 3%, radially masked. Grain 2%.
- **Top row: three feature pills in a full-width glass strip**. Each: 1px hairline, brand-indigo Lucide icon, weight 510 label. Hairline vertical dividers between pills.
- **Middle: horizontal timeline (hero, ~45% of slide)**:
  - Rail: 2px gradient line (transparent → brand indigo → accent indigo → success green → transparent).
  - Three 64px nodes on the rail: 2px brand-indigo border + glass fill, Lucide icons: `rocket` · `megaphone` · `globe`.
  - Above each node: date label in mono with glowing accent dot.
  - Below each node: glass card (240px wide) with the sub-text, 1-2 micro-bullets, brand-indigo check icon prefix.
- Ambient: "GO TO MARKET" at 140pt weight 200 in 3% white behind headline.

**Tone:** Practical. Wrapper framing + timeline does the distribution work.

---

## Slide 9 · Team

**Eyebrow:** TEAM
**Headline:** `Two founders. One bet.`

**Text (verbatim, team):**
- `[Dev name]` — builds AI agents. Previously shipped a DLMM agent that auto-screens, opens, closes positions with self-learning.
- `[Partner name]` — direct line to the target customer segment. Long track record in trading and crypto.

**Visual:**
- Bg: brand-indigo orb top-right at 10% + warmth magenta bottom-left at 8%. Grain 2%. Scanlines at 1.5%.
- Ambient: "TEAM" at 140pt weight 200 in 3% white behind the card row (replaces the old "TRACTION + TEAM" texture).
- **Two founder cards as hero row** (centered, equal width, generous margin between and on both sides):
  - Each card ~44% of content width, vertically stacked elements: 96px circular avatar placeholder (2px brand-indigo ring + glow, monogram if no photo) top-left inside the card, name weight 590 right of avatar, role muted small-caps below name, 3-line description below.
  - Past-work badge pill at the bottom of each card: `DLMM agent · self-learning` (Dev), `trading · crypto · DLMM` (Partner).
  - Specialty icon badge top-right of card: `terminal` (Dev), `trending-up` (Partner).
  - Monogram background texture: large letter (`T` for dev, `D` for partner, or initials of placeholder names) at 3% opacity behind each card. Anchors the card, adds depth without photo dependency.
- No stats bar, no checklist, no closing line. Contact info lives on Slide 11.

**Tone:** Human. Two faces carry the whole slide.

---

## Slide 10 · Roadmap

**Eyebrow:** WHAT'S NEXT
**Headline:** `Where we go from here.`

**Roadmap (verbatim, 4 stations):**
- `Q2 2026` — Mainnet + web2 wrapper (social wallet, fiat ramps)
- `Q3 2026` — Dispute resolution + optional arbitrator
- `Q4 2026` — Cross-border escrow, multi-currency routing
- `2027` — Portable on-chain reputation NFTs

**Visual:**
- Bg: accent-indigo orb top-right + brand-indigo bottom-left + subtle magenta warmth center. Dot grid at 3%. Grain 2%.
- Top ~15% of slide: eyebrow + headline.
- Middle ~70% — **Roadmap timeline, hero of the slide:**
  - Horizontal rail, 4 stations evenly spaced.
  - Rail: 3px gradient bar (transparent → success green → brand indigo → accent indigo → dashed fade at far right), slightly bowed upward (growth trajectory). Dashed treatment kicks in after Q3 to signal "future, not yet earned."
  - Stations zigzag above/below rail. Each 200×150 glass card (larger than before since roadmap now owns more vertical):
    - Q2 2026 (above): `rocket` icon + heading + sub-line. Small success-green `check-circle-2` badge in corner suggesting "nearest to shipped."
    - Q3 2026 (below): `scale` icon + heading + sub-line. Neutral brand indigo.
    - Q4 2026 (above): `globe` icon + heading + sub-line. Station card uses 1.5px dashed border (future treatment).
    - 2027 (below): `badge-check` icon + heading + sub-line. Station card uses 1.5px dashed border + 80% opacity.
  - Dashed vertical connector + indigo dot on rail for each station. Stations glow progressively brighter left-to-right, then fade into dashed treatment on the right.
- Bottom ~15%: breathing whitespace. No ornament, no pills, no QR. The bookend lives on Slide 11.

**Tone:** Forward-looking, quiet. Roadmap carries the slide; closing beat lands on Slide 11.

---

## Slide 11 · Closing

**Eyebrow:** (none)

**Text (verbatim):**
- Stacked lockup: Sealed mark (120–160pt, ring on) above wordmark `SEALED` (~180pt, weight 590, letter-spacing −0.03em), both in `#f7f8f8`. Same treatment as Slide 1.
- Italic tagline: *People break promises. Code doesn't.*
- Hairline contact rail (mono, 3 pills, centered, equal spacing):
  - `[email]` with `mail` icon
  - `github.com/Toderr/sealed` with GitHub icon
  - `sealed-nine.vercel.app` with `globe` icon
- Optional bottom-right: 60×60 QR linking to live demo.

**Visual:**
- Bg mirrors Slide 1: triple gradient orb (brand indigo top-left, accent indigo bottom-right, magenta warmth center behind lockup). 200px blur. Grain 2%. 4–8 floating brand-indigo particles (2–4px) in negative space — quieter than Slide 1.
- Diagonal light sweep (from Ambient library) at 4% opacity, top-left to bottom-right.
- Concentric orbit rings (2–3 at 1px, 2–4% opacity) behind the Sealed mark — subtle halo.
- Stacked lockup optically centered (nudge up ~5% from geometric center so tagline + contact rail get room).
- Italic tagline: 28–32pt muted, subtle brand-indigo gradient underline beneath (fades transparent at both ends).
- **Endmark glyph** below tagline: 40px horizontal 1px bar with centered 4px brand-indigo dot. Book-ending typographic mark, signals "this is the end."
- Contact rail in the bottom third: hairline glass strip, three mono pills with stroked icons, equal spacing, centered.
- QR: optional, bottom-right corner, 60×60 hairline border. Skip if it fights the breathing room (design judgment call).
- Top-right: same `devnet` pill with pulsing green dot as Slide 1 (consistency marker).

**Tone:** Quiet, confident bookend. Breathes harder than Slide 1 — the exhale after the roadmap.

---

## Revision shortcuts

If a specific slide needs another pass, these are the highest-leverage prompts to paste back into claude.ai/design (with this file attached):

1. **"Re-render Slide 2. Make the Web2 / Web3 columns feel more symmetric and higher contrast."**
2. **"Slide 3: make the three agent circles the hero. Shrink the 5-step flow or remove it. Keep the closing line."** (The original draft included a 5-step flow band; if claude.ai/design adds that back, drop it.)
3. **"Slide 4: screenshot grid is hero. No bottom strip at all."**
4. **"Slide 6: pull-quote should dominate. Comparison panel is evidence, not the point."**
5. **"Slide 8: timeline should feel horizontal and light. The wrapper pills on top are the real insight, not the dates."**
6. **"Slide 10: roadmap is the whole slide; let it breathe. Slide 11 is the bookend."**
7. **"Slide 11: bookend to Slide 1. Stacked lockup dominates; contact rail understated. Do not add any other text."**

---

## Post-render QA

Before exporting, check:

- [ ] One primary message per slide. Nothing feels crammed.
- [ ] No em-dashes (`—`) anywhere in rendered output. (Ambient rule: project-wide ban.)
- [ ] All dollar amounts, program IDs, wallet addresses in mono.
- [ ] Agent names in brand indigo on Slide 3.
- [ ] Web2 / Web3 stat columns on Slide 2 are symmetric.
- [ ] No emoji as icons. Lucide stroked SVG only.
- [ ] Contrast passes 7:1 (WCAG AAA).
- [ ] Placeholders intact: `[Dev name]`, `[Partner name]`, `[email]`, screenshot frames on Slide 4. (`[url]` removed — live demo URL is baked into Slide 11's contact rail as `sealed-nine.vercel.app`.)
- [ ] No `$17B` crypto-scam stat anywhere in the brief.
- [ ] No `18 YEARS` credential anywhere in the brief.
- [ ] No `$250K` ask figure anywhere in the brief.
- [ ] Slide counter `NN / 11` present bottom-left on all 11 slides.
- [ ] Progress rail visible on right edge of every slide with current-slide dot glowing.
- [ ] Ambient element count ≤ 4 per slide (density budget still honored).

**Export formats:** PDF (email) · PPTX (speaker notes + last-mile edits) · individual PNGs per slide (Colosseum submission).

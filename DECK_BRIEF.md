# Sealed: Deck Brief for claude.ai/design

**What this is:** a design-ready brief for claude.ai/design to render an 8-slide Colosseum pitch deck. Paste it, iterate per slide.

**Prompt to paste alongside this file:**

> *Generate an 8-slide 16:9 dark pitch deck matching the design system and per-slide spec below. **Strict rules:** one primary message per slide. Keep copy to the exact strings under "Text (verbatim)". Never invent stats, sentences, or additional bullets. If a slide looks empty, add ambient visual depth (orbs, grain, dot grid), not more copy. The visual should carry the weight. Respect the global rhythm elements (slide counter, progress rail, scanlines, watermark) on every slide.*

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
- Tagline: `Don't trust promises. Seal the deal.`
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
- Slide 8 closing ornament: inline lockup, mark ~28pt next to wordmark.
- Any in-context mockup (browser chrome, favicon strip, chat avatar): use the mark at favicon scale. Ring on at ≥24pt; ring off at ≤20pt so the whiskers stay legible.

**Clear space:** min 1× dot radius (13u) on all sides. Do not place inside filled chips / pills on dark bg.

---

## Global rhythm elements (every slide)

These repeat across all 8 slides in the exact same position. They read as structural rhythm, not clutter.

1. **Slide counter.** `NN / 08` (mono, 10pt, muted) in the bottom-left corner, 32px from both edges. Increments per slide: `01 / 08`, `02 / 08`, … `08 / 08`.
2. **Progress rail (right edge).** 1px vertical hairline, 60% of slide height, right-aligned 40px from the edge. 8 small dots evenly spaced along it. Current slide's dot glows brand indigo; past-slide dots at 20% white; future-slide dots at 6% white. Reads like a "you are here" spine.
3. **Hairline scanlines.** Horizontal 1px lines every 40px at 1.5% white, additive with the grain overlay. Adds monitor/tech depth without fighting the copy.
4. **Watermark Sealed mark.** 280pt Sealed mark at 3% opacity, pinned to the top-right corner on content-heavy slides only: 2, 4, 5, 7. Skip on 1, 3, 6, 8 (those already have focal lockups or sparse compositions).
5. **Mono side annotations.** Thin italic mono 9pt muted marginal callouts, editorial-style. Use on 4 slides where there's margin room:
   - Slide 2 right margin: `// root cause, not symptom`
   - Slide 7 right margin: `// targets, not promises`

---

## Ambient elements library

Apply 2–4 per slide. Varies per slide so the deck doesn't look like one wallpaper.

1. **Gradient orbs.** 2–3 per slide, 15–30% of width, 8–15% opacity, ~200px blur. Brand indigo + accent indigo always; magenta `#c47aff` at 5% for warmth on select slides.
2. **Grain overlay.** 2–3% monochrome noise on every slide.
3. **Dot / line grids** (technical slides only: 3). 24px dot spacing, 4% white, radially masked to fade at edges.
4. **Glass cards.** `rgba(255,255,255,0.03)` fill + 20px backdrop blur + hairline border + inner top highlight + 12–16px radius. Optional `0 24px 64px rgba(0,0,0,0.4)` shadow.
5. **Glows** (hero words, key numbers only). Brand `0 0 48px rgba(94,106,210,0.35)` · Warning `0 0 40px rgba(251,191,36,0.3)` · Danger `0 0 40px rgba(248,113,113,0.3)` · Success `0 0 32px rgba(74,222,128,0.25)`.
6. **Lucide icons** (1.5px stroke): `terminal`, `handshake`, `shield-check`, `message-square`, `lock`, `arrow-up-right`, `rotate-ccw`, `x-circle`, `check-circle-2`, `trending-up`, `alert-triangle`, `sparkles`, `map-pin`, `users`, `banknote`, `network`, `globe`, `rocket`, `scale`, `badge-check`, `percent`, `mail`, `credit-card`.
7. **Typography as texture.** Oversized section eyebrow (140pt, weight 200, `rgba(255,255,255,0.04)`) behind main content on stat-heavy slides.
8. **Accent underline.** 2px brand-indigo gradient stroke (fades transparent at both ends) under hero words.
9. **Diagonal light sweep.** 2px gradient line at 4% opacity sweeping top-left → bottom-right, ~15% of slide diagonal. Suggests a light hitting a dark stage. Use on Slides 1 + 11 only.
10. **Concentric orbit rings.** 2–3 thin rings (1px, 2–4% opacity), centered on a focal glyph. Use behind the Sealed mark on 1 + 11; behind the agent trio on 3.
11. **Dashed future treatment.** After a certain x-position, switch solid 2px rails/strokes to 1.5px dashed (`stroke-dasharray 4 4`). Signals "this hasn't happened yet." Use on Slide 7's Q4 / 2027 stations.
12. **Gauge bar.** Thin 1px hairline track with a filled segment + percentage labels at both ends. Not used in current 8-slide deck (Why Us slide removed).
13. **Browser chrome mockup.** Faux browser shell around a screenshot: 3 traffic-light dots, URL bar showing `sealed-nine.vercel.app`, lock glyph. Not used in current 8-slide deck.
14. **Geographic fragment.** Outline-only SEA region (Indonesia + neighbors) at 4% opacity, bottom-right. Not used in current 8-slide deck (Why Now slide removed). GTM wedge is SEA.
15. **Monogram background texture.** Large founder-initial letter at 3% opacity behind each founder card. Use on Slide 6.
16. **Endmark glyph.** 40px horizontal 1px bar with a centered 4px brand-indigo dot. Typographic "end of book" mark. Use on Slide 8 only, below the tagline.
17. **Revenue flow arrows.** 3 thin gradient arrows (1.5px, fade at mid-arrow) converging from each pricing card into a shared pool glyph below. Use on Slide 4 only.
18. **Timeline axis rule.** Horizontal 1px rule beneath stat columns with 4–5 tick marks labeled in mono 9pt (`'23 '24 '25 '26 '27`). Not used in current 8-slide deck (Why Now slide removed).

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

- **Slide 2 Column B `NONE`** → danger-red glow (shifts from warning-yellow, aligning "absence = risk").
- **Slide 7 Card 3** `$100 verified merchant` → success-green kept; seal glyph upgraded to a filled circle with check.
- **Slide 7 Q2 2026 station** → small success-green `check-circle-2` badge (signals "nearest to ship"). Q3 stays neutral indigo. Q4 + 2027 dashed.

Final palette rhythm: indigo dominant, green = achieved/live/settled, red = absence/risk, warning-yellow = non-payment/unpaid only.

---

## Slide 1 · Title

**Eyebrow:** (none)

**Text (verbatim):**
- Wordmark: `SEALED AGENT`
- Tagline (italic, muted): *Don't trust promises. Seal the deal.*
- Sub: `Escrow agent for business deals and negotiations.`
- Footer (mono, muted): `Program ID 3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ · Solana devnet`

**Visual:**
- Triple gradient orb: brand indigo top-left, accent bottom-right, magenta warmth center behind wordmark. 200px blur.
- **Stacked lockup center:** Sealed mark (see "Brand mark (locked)" spec) at 120–160pt rendered in `#f7f8f8`, ring on, soft indigo glow `0 0 64px rgba(94,106,210,0.35)`. Directly beneath, the wordmark `SEALED AGENT` at ~160pt display weight, letter-spacing −0.05em, `white-space:nowrap`. Clear space ≥13u between mark and wordmark.
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
- Agent 1: `Structurer`. Parses the deal.
- Agent 2: `Negotiator`. Reaches terms.
- Agent 3: `Verifier`. Reviews delivery.
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

## Slide 4 · Business Model

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

## Slide 5 · Go To Market

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

## Slide 6 · Team

**Eyebrow:** TEAM
**Headline:** `Two founders. One bet.`

**Text (verbatim, team):**
- `[Dev name]:` 4+ years in digital marketing, ex Marketing Agency CCO. High proficiency in agentic AI. Knows the pain from both sides of every deal.
- `[Partner name]:` direct line to the target customer segment. Long track record in financial markets and marketplaces.

**Visual:**
- Bg: brand-indigo orb top-right at 10% + warmth magenta bottom-left at 8%. Grain 2%. Scanlines at 1.5%.
- Ambient: "TEAM" at 140pt weight 200 in 3% white behind the card row (replaces the old "TRACTION + TEAM" texture).
- **Two founder cards as hero row** (centered, equal width, generous margin between and on both sides):
  - Each card ~44% of content width, vertically stacked elements: 96px circular avatar placeholder (2px brand-indigo ring + glow, monogram if no photo) top-left inside the card, name weight 590 right of avatar, role muted small-caps below name, 3-line description below.
  - Past-work badge pill at the bottom of each card: `AI expert · marketing` (Dev), `financial market · marketplace` (Partner).
  - Specialty icon badge top-right of card: `terminal` (Dev), `trending-up` (Partner).
  - Monogram background texture: large letter (`T` for dev, `D` for partner, or initials of placeholder names) at 3% opacity behind each card. Anchors the card, adds depth without photo dependency.
- No stats bar, no checklist, no closing line. Contact info lives on Slide 8.

**Tone:** Human. Two faces carry the whole slide.

---

## Slide 7 · Roadmap

**Eyebrow:** WHAT'S NEXT
**Headline:** `Where we go from here.`

**Roadmap (verbatim, 4 stations):**
- `Q2 2026`: Mainnet + web2 wrapper (social wallet, fiat ramps)
- `Q3 2026`: Dispute resolution + optional arbitrator
- `Q4 2026`: Cross-border escrow, multi-currency routing
- `2027`: Portable on-chain reputation NFTs

**Visual:**
- Bg: accent-indigo orb top-right + brand-indigo bottom-left + subtle magenta warmth center. Dot grid at 3%. Grain 2%.
- Top ~15% of slide: eyebrow + headline.
- Middle ~70%. **Roadmap timeline, hero of the slide:**
  - Horizontal rail, 4 stations evenly spaced.
  - Rail: 3px gradient bar (transparent → success green → brand indigo → accent indigo → dashed fade at far right), slightly bowed upward (growth trajectory). Dashed treatment kicks in after Q3 to signal "future, not yet earned."
  - Stations zigzag above/below rail. Each 200×150 glass card (larger than before since roadmap now owns more vertical):
    - Q2 2026 (above): `rocket` icon + heading + sub-line. Small success-green `check-circle-2` badge in corner suggesting "nearest to shipped."
    - Q3 2026 (below): `scale` icon + heading + sub-line. Neutral brand indigo.
    - Q4 2026 (above): `globe` icon + heading + sub-line. Station card uses 1.5px dashed border (future treatment).
    - 2027 (below): `badge-check` icon + heading + sub-line. Station card uses 1.5px dashed border + 80% opacity.
  - Dashed vertical connector + indigo dot on rail for each station. Stations glow progressively brighter left-to-right, then fade into dashed treatment on the right.
- Bottom ~15%: breathing whitespace. No ornament, no pills, no QR. The bookend lives on Slide 8.

**Tone:** Forward-looking, quiet. Roadmap carries the slide; closing beat lands on Slide 8.

---

## Slide 8 · Closing

**Eyebrow:** (none)

**Text (verbatim):**
- Stacked lockup: Sealed mark (120–160pt, ring on) above wordmark `SEALED AGENT` (~160pt, weight 600, letter-spacing −0.05em, `white-space:nowrap`), both in `#f7f8f8`. Same treatment as Slide 1.
- Italic tagline: *Don't trust promises. Seal the deal.*
- Hairline contact rail (mono, 3 pills, centered, equal spacing):
  - `[deck link]` with `monitor` icon
  - `github.com/Toderr/sealed` with GitHub icon
  - `sealed-nine.vercel.app` with `globe` icon
- Optional bottom-right: 60×60 QR linking to live demo.

**Visual:**
- Bg mirrors Slide 1: triple gradient orb (brand indigo top-left, accent indigo bottom-right, magenta warmth center behind lockup). 200px blur. Grain 2%. 4–8 floating brand-indigo particles (2–4px) in negative space, quieter than Slide 1.
- Diagonal light sweep (from Ambient library) at 4% opacity, top-left to bottom-right.
- Concentric orbit rings (2–3 at 1px, 2–4% opacity) behind the Sealed mark, a subtle halo.
- Stacked lockup optically centered (nudge up ~5% from geometric center so tagline + contact rail get room).
- Italic tagline: 28–32pt muted, subtle brand-indigo gradient underline beneath (fades transparent at both ends).
- **Endmark glyph** below tagline: 40px horizontal 1px bar with centered 4px brand-indigo dot. Book-ending typographic mark, signals "this is the end."
- Contact rail in the bottom third: hairline glass strip, three mono pills with stroked icons, equal spacing, centered.
- QR: optional, bottom-right corner, 60×60 hairline border. Skip if it fights the breathing room (design judgment call).
- Top-right: same `devnet` pill with pulsing green dot as Slide 1 (consistency marker).

**Tone:** Quiet, confident bookend. Breathes harder than Slide 1, the exhale after the roadmap.

---

## Revision shortcuts

If a specific slide needs another pass, these are the highest-leverage prompts to paste back into claude.ai/design (with this file attached):

1. **"Re-render Slide 2. Make the Web2 / Web3 columns feel more symmetric and higher contrast."**
2. **"Slide 3: make the three agent circles the hero. Shrink the 5-step flow or remove it. Keep the closing line."** (The original draft included a 5-step flow band; if claude.ai/design adds that back, drop it.)
3. **"Slide 5: timeline should feel horizontal and light. The wrapper pills on top are the real insight, not the dates."**
4. **"Slide 7: roadmap is the whole slide; let it breathe. Slide 8 is the bookend."**
5. **"Slide 8: bookend to Slide 1. Stacked lockup dominates; contact rail understated. Do not add any other text."**

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
- [ ] Placeholders intact: `[Dev name]`, `[Partner name]`, `[deck link]`, screenshot frames removed (Product Demo slide deleted). (`[url]` removed: live demo URL is baked into Slide 8's contact rail as `sealed-nine.vercel.app`.)
- [ ] No `$17B` crypto-scam stat anywhere in the brief.
- [ ] No `18 YEARS` credential anywhere in the brief.
- [ ] No `$250K` ask figure anywhere in the brief.
- [ ] Slide counter `NN / 08` present bottom-left on all 8 slides.
- [ ] Progress rail visible on right edge of every slide with current-slide dot glowing.
- [ ] Ambient element count ≤ 4 per slide (density budget still honored).

**Export formats:** PDF (email) · PPTX (speaker notes + last-mile edits) · individual PNGs per slide (Colosseum submission).
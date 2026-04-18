# Sealed: Deck Brief for claude.ai/design

**What this is:** a design-ready brief for claude.ai/design to render a 10-slide Colosseum pitch deck. Paste it, iterate per slide.

**Prompt to paste alongside this file:**

> *Generate a 10-slide 16:9 dark pitch deck matching the design system and per-slide spec below. **Strict rules:** one primary message per slide. Keep copy to the exact strings under "Text (verbatim)". Never invent stats, sentences, or additional bullets. If a slide looks empty, add ambient visual depth (orbs, grain, dot grid), not more copy. The visual should carry the weight.*

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
- Wordmark: ~180pt display weight, letter-spacing −0.03em, soft glow `0 0 80px rgba(94,106,210,0.4)`.
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
  - Hero stat: `$17B`
  - Caption: `lost to crypto scams, 2025`
  - Tag: `impersonation fraud +1,400%`
- Kicker (italic, centered): *One root cause. No enforceable deal layer.*
- Footer (mono, muted): `Sources: Flexable 2025 · Chainalysis 2026`

**Visual:**
- Bg: warning-yellow orb top-left at 8% + danger-red orb top-right at 8% (both sides have a problem). Brand-indigo orb bottom-center at 10% (solution signal). Grain 3%.
- **Top 60% split into two stat columns**, hairline vertical divider between:
  - Left `WEB2`: eyebrow warning-yellow. `$15B` mono 140pt with warning glow. Caption below in muted 14pt. One tag pill beneath ("58% face unpaid invoices"). Small Lucide `alert-triangle` icon top-right of column.
  - Right `WEB3`: eyebrow danger-red. `$17B` mono 140pt with danger glow. Caption + tag pill. Small `x-circle` icon top-right.
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
- Stat 2 label: `TRUST CRISIS`
  - Hero: `$17B`
  - Caption: `lost to crypto scams, 2025`
- Stat 3 label: `AI AGENTS`
  - Hero: `NOW`
  - Caption: `good enough to parse messy deals`
- Emphasis line (italic, brand-indigo accent): *The plumbing is ready. The trust layer isn't. Yet.*
- Footer (mono, muted): `Sources: McKinsey Feb 2026 · Chainalysis 2026`

**Visual:**
- Bg: three subtle orbs behind each stat column: brand indigo · accent indigo · warmth magenta. 10% opacity each, heavy blur. Grain 2%.
- Ambient eyebrow: "WHY NOW" at 140pt weight 200 in `rgba(255,255,255,0.03)` behind headline.
- **Three stat columns** as glass cards, hairline dividers between:
  - Column 1: Lucide `trending-up` icon (brand indigo, 32px). `$226B` mono 120pt with indigo glow. Rising mini line-chart (6–8 points, 1.5px brand-indigo stroke, 25% opacity) behind the number. Warning-yellow `+733% YoY` tag pill.
  - Column 2: Lucide `alert-triangle` icon (danger red). `$17B` mono 120pt with danger glow. Caption + tag pill.
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
  - Price: `$53.90`
  - Caption: `per month`
  - Body: `Bring your own LLM, or use ours.`
- Card 3 heading: `Verified merchant`
  - Price: `$100`
  - Caption: `one-time`
  - Body: `Filter for serious parties.`
- Closing strip (below cards): `One $50,000 deal = $500. Verified merchants get premium placement + trust badge.`

**Visual:**
- Bg: brand-indigo orb top-left + accent-indigo right-center. Grain 2%.
- **Three pricing cards** in equal columns with distinct top-border accents:
  - Card 1: brand-indigo 4px top border (gradient fade). Lucide `percent` icon. Price `1%` in brand indigo with glow. Body as above.
  - Card 2: accent-indigo top border. Lucide `sparkles` icon. Price `$53.90` in accent indigo. Body + bottom row of three hairline LLM chips: `Anthropic` · `OpenAI` · `OpenRouter`.
  - Card 3: success-green top border. Lucide `badge-check` icon. Price `$100` in success green. Body + small circular trust-seal glyph in success green.
- **Closing strip** below cards as full-width glass card:
  - Left: math row in mono pills connected by subtle arrows: `$50,000` → `×` → `1%` → `=` → `$500`. `$500` has small success-green glow.
  - Right: italic 16pt muted line about verified-merchant benefits.
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
- Credential line (mono, bottom): `18 YEARS in trading, investing, crypto`

**Visual:**
- Bg: brand-indigo orb top-left + warmth magenta bottom-right. Line grid 48px at 3%, radially masked. Grain 2%.
- **Top row: three feature pills in a full-width glass strip**. Each: 1px hairline, brand-indigo Lucide icon, weight 510 label. Hairline vertical dividers between pills.
- **Middle: horizontal timeline (hero, ~45% of slide)**:
  - Rail: 2px gradient line (transparent → brand indigo → accent indigo → success green → transparent).
  - Three 64px nodes on the rail: 2px brand-indigo border + glass fill, Lucide icons: `rocket` · `megaphone` · `globe`.
  - Above each node: date label in mono with glowing accent dot.
  - Below each node: glass card (240px wide) with the sub-text, 1-2 micro-bullets, brand-indigo check icon prefix.
- **Bottom credential line**: `18 YEARS` in brand-indigo mono with glow + caption below. Small Lucide `users` icon left of the number. This is our distribution proof.
- Ambient: "GO TO MARKET" at 140pt weight 200 in 3% white behind headline.

**Tone:** Practical. Wrapper framing + cofounder credential make the distribution claim concrete.

---

## Slide 9 · Traction + Team

**Eyebrow:** TRACTION + TEAM
**Headline:** `Already shipping.`

**Text (verbatim, traction):**
- `Anchor program on devnet: create_deal, fund_escrow, release_milestone, refund`
- `Full lifecycle: chat → negotiate → fund → verify → release → complete`
- `Dual-agent negotiation with BusinessMemory per wallet`
- `AI Verifier scoring milestone proofs`
- `Mutual refund via 2-sig partial-sign handoff`
- `Anthropic direct + OpenRouter supported`
- Next (accent-indigo icon): `Social wallet + fiat on/off-ramp for web2 onboarding`

**Text (verbatim, team):**
- `[Dev name]` — builds AI agents. Previously shipped a DLMM agent that auto-screens, opens, closes positions with self-learning.
- `[Partner name]` — 18 years in trading, investing, crypto. Direct line to target customer segment.

**Closing line (large, centered):** `Two people. Four weeks. Working product.`

**Top-strip stats bar (full-width, 4 mono blocks):**
- `4` · Anchor instructions
- `3` · AI agent roles
- `2` · founders
- `4` · weeks

**Visual:**
- Bg: success-green orb top-left at 8% + brand-indigo orb right at 10%. Grain 2%.
- **Top strip**: four mono stat blocks in a row. Hairline vertical dividers. Each number has subtle brand-indigo glow.
- **Left column (60%) — traction checklist**:
  - Each bullet as a faint glass strip (rgba white 2%, 1px top border, 12px padding).
  - Success-green `check-circle-2` Lucide icon (20px) far left. Instruction names in mono pills inline.
  - "Next:" bullet uses accent-indigo `arrow-right` icon instead of check.
- **Right column (40%) — team block**:
  - Two stacked glass cards.
  - Each: 96px circular avatar placeholder (2px brand-indigo ring + glow, monogram if no photo) on left. Right: name weight 590, role muted small-caps, 2-line description.
  - Past-work badge pill: `DLMM agent · self-learning` (Dev), `18 years · trading & crypto` (Partner).
  - Specialty icon badge: `terminal` (Dev), `trending-up` (Partner).
- **Closing line strip** (full-width, below columns):
  - Glass card, 2px gradient top-border (indigo → accent → transparent).
  - Centered 24–32pt weight 590.

**Tone:** Evidentiary + human. Stats hook, checklist proves, team personalizes.

---

## Slide 10 · Ask + Roadmap

**Eyebrow:** THE ASK
**Headline:** `What we're building next.`

**Roadmap (verbatim, 4 stations):**
- `Q2 2026` — Mainnet + web2 wrapper (social wallet, fiat ramps)
- `Q3 2026` — Dispute resolution + optional arbitrator
- `Q4 2026` — Cross-border escrow, multi-currency routing
- `2027` — Portable on-chain reputation NFTs

**Ask (verbatim, 3 cards):**
- Card 1 heading: `Capital`
  - Hero: `$250K`
  - Caption: `pre-seed`
  - Milestones: `100 active businesses · $1M TVL`
- Card 2 heading: `Ecosystem partners`
  - Body: `Stablecoin issuers, wallets, fiat ramps.`
- Card 3 heading: `Design partners`
  - Body: `SEA B2B verticals: manufacturing, logistics, agri-trade.`

**Footer (mono):** `Contact: [email] · GitHub: github.com/Toderr/sealed · Live demo: [url]`

**Final ornament (bottom-center):** Sealed wordmark weight 590 small, italic tagline: *People break promises. Code doesn't.* Subtle indigo underline.

**Visual:**
- Bg: accent-indigo orb top-right + brand-indigo bottom-left + subtle magenta warmth center. Dot grid at 3% for "scaffolding for what's next". Grain 2%.
- **Top half — Roadmap timeline:**
  - Horizontal rail, 4 stations evenly spaced.
  - Rail: 3px gradient bar (transparent → brand indigo → accent → success → transparent), slightly bowed upward (growth trajectory).
  - Stations zigzag above/below rail. Each 160×120 glass card:
    - Q2 (above): `rocket` icon + heading + sub-line
    - Q3 (below): `scale` icon + heading + sub-line
    - Q4 (above): `globe` icon + heading + sub-line
    - 2027 (below): `badge-check` icon + heading + sub-line
  - Dashed vertical connector + indigo dot on rail. Stations glow progressively brighter left-to-right.
- **Divider:** hairline horizontal with "THE ASK" eyebrow centered.
- **Bottom half — Three ask cards** in equal columns:
  - Card 1: brand-indigo top border. `banknote` icon. `$250K` oversized mono with strong indigo glow. Two hairline milestone pills.
  - Card 2: accent-indigo top border. `network` icon. Logo strip mini (monochrome): `Circle · Phantom · Helius · MoonPay`.
  - Card 3: success-green top border. `handshake` icon. Three tiny industry glyphs bottom: factory · truck · leaf.
- **Footer row** (full-width, below cards):
  - Three contact pills: `[email]` with mail icon · `github.com/Toderr/sealed` with GitHub icon · `[url]` with globe icon. Mono, hairline, glass fill.
  - Far right: 60×60 QR linking to live demo.
- **Final ornament**: Sealed wordmark bottom-center weight 590 small, italic tagline beneath with subtle indigo underline.

**Tone:** Forward-looking, inviting. Roadmap feels earned; ask scoped; close echoes the open.

---

## Revision shortcuts

If a specific slide needs another pass, these are the highest-leverage prompts to paste back into claude.ai/design (with this file attached):

1. **"Re-render Slide 2. Make the Web2 / Web3 columns feel more symmetric and higher contrast."**
2. **"Slide 3: make the three agent circles the hero. Shrink the 5-step flow or remove it. Keep the closing line."** (The original draft included a 5-step flow band; if claude.ai/design adds that back, drop it.)
3. **"Slide 4: screenshot grid is hero. No bottom strip at all."**
4. **"Slide 6: pull-quote should dominate. Comparison panel is evidence, not the point."**
5. **"Slide 8: timeline should feel horizontal and light. The wrapper pills on top are the real insight, not the dates."**
6. **"Slide 10: roadmap should feel optimistic but not loud. Ask cards are the real focus."**

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
- [ ] Placeholders intact: `[Dev name]`, `[Partner name]`, `[email]`, `[url]`, screenshot frames on Slide 4.

**Export formats:** PDF (email) · PPTX (speaker notes + last-mile edits) · individual PNGs per slide (Colosseum submission).

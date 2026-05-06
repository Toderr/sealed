# Sealed Deck: Text Size Legibility Fix Plan

**File**: `E:/Claude Code/sealed/Sealed Deck.html`
**Date**: 2026-04-20
**Context**: Pitch deck 1920×1080 untuk Colosseum video submission. Banyak text 13-15px yang unreadable saat scaled-down di video/laptop.

## Role
Senior UI/UX designer, lens: skill `ui-ux-pro-max`.

## Requirements

### Size floors (new minimums)
| Current | New | Applies to |
|---------|-----|------------|
| 13px | 15-16px | counters, pills, source credits, muted captions, mono annotations |
| 14px | 16px | network detail lines, roadmap quarter labels |
| 15px | 16-17px | stat descriptions, bullet lines |
| 16-17px | 18px | team bios, slide subtitles |

### Preserve (tidak diubah)
- Hero/display: 72px, 104px, 120px, 140px, 200px, 220px
- `.eyebrow` letter-spacing 0.14em
- `.devnet` uppercase tracking
- `.counter` mono styling
- Overall type hierarchy (big > medium > small relatively)

### Scope
- Semua 11 slide
- In-place edit to existing file
- Spot-check overflow pada dense slides (How It Works, Business Model, Traction, Roadmap)

## Verification Criteria
1. `grep font-size:\s*1[0-4]px` = 0 matches
2. `grep font-size:\s*15px` = 0 atau hanya non-body context
3. Display sizes intact (72/104/120/140/200/220)
4. HTML valid (no broken tags from edits)
5. Dense slides tidak overflow 1080px stage
6. `.eyebrow` / `.devnet` / `.counter` tetap mono + tracking

## Execution Order
1. Base CSS (lines ~155-270): counter, anno, devnet, eyebrow, pill
2. Slide 1: Title
3. Slide 2: Problem
4. Slide 3: Solution/Agents
5. Slide 4: Demo/Live app
6. Slide 5: Market ($226B)
7. Slide 6: How It Works
8. Slide 7: Business Model
9. Slide 8: Traction/Web2 Wrapper
10. Slide 9: Team
11. Slide 10: Roadmap
12. Slide 11: Closing

## Rollback
File tidak di-commit dulu. Jika overflow muncul, fix via line-height reduce atau revert specific bump.

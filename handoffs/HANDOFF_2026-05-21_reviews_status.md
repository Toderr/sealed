# HANDOFF 2026-05-21 reviews + deal status — branch `main`

- **status**: done
- **branch**: main
- **goal**: Fix invite stats visibility, completed-deal user reviews, clickable deal rows/cards, and completed status display.

## next-action

Deploy or run browser smoke test on:
- `/invite/[token]` — About the inviter shows total deals, completion, avg rating.
- `/deals/[id]` after final milestone release — review card appears and rating submit updates profile aggregate.
- `/app` and `/profile` — deal cards/rows navigate to negotiation/detail and completed deals no longer show awaiting counterparty.

## Context

Implemented server-side completion/reputation flow:
- `PATCH /api/deals/[dealId]` now whitelists fields, infers `completed` when all milestones are released, and increments reputation once on transition to completed.
- `/api/ratings` now supports `GET` for current caller review status and validates POST caller/party/completed-deal constraints.
- Ratings are revealed immediately and recalculate the ratee `avg_rating`.
- Public profile stats now fall back to completed/refunded/disputed deal rows and revealed ratings when `sealed_reputation` is stale.

Implemented UI flow:
- `/deals/[id]` shows a completed-deal counterparty review form with 1-5 stars.
- `/app` deal cards are real links and infer completed state from milestones if mirror status is stale.
- `/profile` Your deals rows are real links, with Invite separated as a button.

## Do-Not

- Jangan import Supabase dari TSX.
- Jangan trust `ratee_wallet`/`rater_wallet` dari body tanpa verify party deal.
- Jangan increment reputation lebih dari sekali untuk deal yang sudah `completed`.
- Jangan pakai istilah/pola "auto-release"; release tetap buyer confirmation.

## Files modified

- `app/src/app/api/deals/[dealId]/route.ts`
- `app/src/app/api/ratings/route.ts`
- `app/src/app/app/page.tsx`
- `app/src/app/deals/[id]/page.tsx`
- `app/src/app/profile/page.tsx`
- `app/src/lib/reputation.ts`
- `app/src/lib/sealed-users.ts`
- `docs/ARCHITECTURE.md`
- `.gitignore`
- `handoffs/HANDOFF_2026-05-21_reviews_status.md`

## Test status

- Frontend targeted lint: pass for changed files except `profile/page.tsx` old unrelated lint errors remain in LLM/friends sections.
- Frontend build: pass (`npm.cmd run build` in `app/`).
- Dev server: running at `http://localhost:3001`.
- Anchor program: not touched, not tested.

## Evidence

- Commit SHA: 6e792cc
- Test command + result:
  - `npx.cmd eslint "src/app/api/deals/[dealId]/route.ts" "src/app/api/ratings/route.ts" "src/lib/reputation.ts" "src/lib/sealed-users.ts" "src/app/deals/[id]/page.tsx" "src/app/app/page.tsx"` — pass
  - `npm.cmd run build` — pass
  - `Invoke-WebRequest http://localhost:3001` — 200
- Files final: listed above.

### Update 2026-05-21 11:48 oleh Codex
- Status: done
- Yang dikerjakan: Invite/profile stats fallback, completed-deal review flow, rating aggregate update, deal completion status persistence, clickable deal cards/rows.
- Files modified: `.gitignore`, `app/src/app/api/deals/[dealId]/route.ts`, `app/src/app/api/ratings/route.ts`, `app/src/app/app/page.tsx`, `app/src/app/deals/[id]/page.tsx`, `app/src/app/profile/page.tsx`, `app/src/lib/reputation.ts`, `app/src/lib/sealed-users.ts`, `docs/ARCHITECTURE.md`, `handoffs/HANDOFF_2026-05-21_reviews_status.md`
- Commit SHA: 6e792cc
- Test status: frontend build pass; targeted lint pass excluding old unrelated `profile/page.tsx` lint errors.
- Blocker (jika ada): Tidak ada.
- Next-action untuk agent berikutnya: Browser smoke test dan deploy.
- Do-Not tambahan: Jangan kembali ke hidden-until-both ratings unless product explicitly wants retaliatory-review protection.

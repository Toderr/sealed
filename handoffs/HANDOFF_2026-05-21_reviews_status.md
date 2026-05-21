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

### Update 2026-05-21 12:10 oleh Codex
- Status: done
- Yang dikerjakan: Profile self stats sekarang merge Supabase mirror, sessionStorage deal drafts, dan local deal store agar sealed deals di board ikut tercatat di profile; wording "Settled/settled" di UI diganti menjadi "Sealed/sealed".
- Files modified: `app/src/app/app/page.tsx`, `app/src/app/profile/page.tsx`, `app/src/app/profile/[wallet]/page.tsx`, `app/src/lib/sealed-users.ts`, `handoffs/HANDOFF_2026-05-21_reviews_status.md`
- Commit SHA: a36df15
- Test status: targeted lint pass untuk `app/page`, public profile, dan `sealed-users`; `profile/page.tsx` masih punya lint lama unrelated di LLM/friends sections; frontend build pass.
- Blocker (jika ada): Tidak ada.
- Next-action untuk agent berikutnya: Smoke test `/app` Sealed lane dan `/profile` stats pada wallet yang punya 5 sealed deals.
- Do-Not tambahan: Jangan hitung profile self hanya dari `useDealsStore`; board memakai mirror/session source.

### Update 2026-05-21 12:25 oleh Codex
- Status: done
- Yang dikerjakan: Menambahkan search/filter/sort pada `/profile` Your deals, menampilkan Avg rating di stats profile via `/api/users/[wallet]/public?self=1`, dan menghapus card "Invite your counterparty" dari sidebar profile. Tombol invite tetap ada di masing-masing deal card yang masih butuh counterparty.
- Files modified: `app/src/app/profile/page.tsx`, `handoffs/HANDOFF_2026-05-21_reviews_status.md`
- Commit SHA: fbe88b1
- Test status: `npm.cmd run build` pass; `npx.cmd eslint "src/app/profile/page.tsx"` masih fail hanya pada lint lama unrelated di Settings/Friends (`set-state-in-effect`, unused vars); dev server `http://localhost:3001/profile` return 200.
- Blocker (jika ada): Tidak ada.
- Next-action untuk agent berikutnya: Browser smoke test `/profile` dengan deals banyak: cek search, filter Active/Sealed/Needs invite, sort, rating self, dan pastikan invite hanya muncul di deal row draft.
- Do-Not tambahan: Jangan reintroduce invite generator sebagai sidebar-level profile card; invite tetap contextual per deal.

### Update 2026-05-21 12:53 oleh Codex
- Status: done
- Yang dikerjakan: Add friend di `/profile` sekarang memakai username/handle dan `POST /api/friends` resolve handle ke wallet server-side; invite page lebih kuat resolve full inviter wallet sebelum fetch stats; public profile stats tetap dihitung dari deal/rating fallback meski row `sealed_users` belum lengkap; profile upsert retry otomatis tanpa kolom optional yang belum ada di schema cache seperti `display_name`.
- Files modified: `app/src/app/api/friends/route.ts`, `app/src/app/invite/[token]/page.tsx`, `app/src/app/profile/page.tsx`, `app/src/lib/sealed-users.ts`, `app/src/lib/types.ts`, `handoffs/HANDOFF_2026-05-21_reviews_status.md`
- Commit SHA: 838fb7a
- Test status: targeted lint pass untuk `api/friends`, invite page, `sealed-users`, `types`; frontend build pass (`npm.cmd run build`); `profile/page.tsx` lint masih fail pada lint lama unrelated di Settings/Friends (`set-state-in-effect`, unused vars).
- Blocker (jika ada): Tidak ada.
- Next-action untuk agent berikutnya: Browser smoke test add friend pakai `@username`, buka invite link lama/baru dan cek About the inviter stats, lalu coba invitee name gate pada schema tanpa `display_name`.
- Do-Not tambahan: Jangan kembalikan add friend ke wallet-address input; public profile button boleh tetap pakai wallet karena sudah berada di profile wallet tersebut.

### Update 2026-05-21 13:27 oleh Codex
- Status: done
- Yang dikerjakan: Canonical profile sekarang `/profile/<wallet>`; `/profile` redirect ke wallet route setelah connect. Wallet route menampilkan dashboard profile lengkap untuk self, public profile menampilkan display name + username tanpa wallet address, Your deals dan `/app` deal board menampilkan nama counterparty jika seller/buyer sudah ada, dan menu Agent diarahkan ke tab Agent profile. Route `/app/agent` dibuat redirect ringan agar tidak lagi import Supabase dari TSX.
- Files modified: `app/src/app/app/agent/page.tsx`, `app/src/app/app/page.tsx`, `app/src/app/profile/SelfProfilePage.tsx`, `app/src/app/profile/[wallet]/page.tsx`, `app/src/app/profile/page.tsx`, `handoffs/HANDOFF_2026-05-21_reviews_status.md`
- Commit SHA: c93051e
- Test status: targeted lint pass untuk file yang berubah; frontend build pass (`npm.cmd run build`).
- Blocker (jika ada): Tidak ada.
- Next-action untuk agent berikutnya: Browser smoke test `/app` deal board counterparty names, `/profile/<wallet>` self dashboard tabs termasuk `?tab=agent`, `/profile` redirect, dan public profile non-self identity display.
- Do-Not tambahan: Jangan reintroduce `/app/agent` sebagai client page yang import Supabase langsung; gunakan profile Agent tab atau API route.

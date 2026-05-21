# HANDOFF 2026-05-21 escalation + notifications — branch `main`

- **status**: done
- **branch**: main
- **goal**: Fix generated username display, align negotiation room header, add back navigation + notification menu, handle renegotiation escalation, and improve escrow funding failure UX.

## next-action

Run Supabase migration `app/src/lib/supabase-migration-004.sql` in the Supabase SQL editor before using `status = 'escalated'` in production. Then smoke test `/app`, `/profile/[wallet]`, `/invite/[token]`, and `/negotiate/[dealId]` with a buyer/seller pair.

## Context

Implemented:
- Display handles hide generated invite suffixes such as `@michael-hjwwnqcw` while preserving unique DB handles.
- `/api/notifications` and `NotificationMenu` show in-app notifications from deal context and notification queue rows.
- Renegotiate marks the shared off-chain deal status as `escalated` and falls back to an escalated proposal when the LLM provider is rate-limited.
- Negotiation room header now matches the landing logo text, has back navigation, and includes notifications.
- Escrow deploy prechecks buyer USDC balance and `sendTx` logs `SendTransactionError.getLogs(connection)` when transaction submission fails.

## Do-Not

- Do not treat `escalated` as an on-chain escrow state; it is Supabase coordination context only.
- Do not mark a deal `funded` before the Solana transaction confirms.
- Do not remove handle uniqueness in `sealed_users`; only normalize display.
- Do not rely on notification rows as source-of-truth for fund movement.

## Files modified

- `ARCHITECTURE.md`
- `SYSTEM_DESIGN.md`
- `docs/ARCHITECTURE.md`
- `app/src/app/api/deals/[dealId]/route.ts`
- `app/src/app/api/negotiate/route.ts`
- `app/src/app/api/notifications/route.ts`
- `app/src/app/app/page.tsx`
- `app/src/app/invite/[token]/page.tsx`
- `app/src/app/negotiate/[dealId]/page.tsx`
- `app/src/app/profile/SelfProfilePage.tsx`
- `app/src/app/profile/[wallet]/page.tsx`
- `app/src/components/NotificationMenu.tsx`
- `app/src/lib/escrow-client.ts`
- `app/src/lib/sealed-users.ts`
- `app/src/lib/supabase-schema.sql`
- `app/src/lib/supabase-migration-004.sql`
- `app/src/lib/user-display.ts`

## Test status

- Targeted ESLint: pass with existing warnings in `src/app/negotiate/[dealId]/page.tsx`.
- Frontend build: pass (`npm.cmd run build` in `app/`).
- Anchor program: not touched, not tested.

## Evidence

- Commit SHA: `f158c754ab0ab8c009f60629b1bcddcc082f5b0d`
- Test command + result:
  - `npx.cmd eslint src/components/NotificationMenu.tsx src/app/api/notifications/route.ts src/app/api/deals/[dealId]/route.ts src/app/api/negotiate/route.ts src/app/app/page.tsx src/app/invite/[token]/page.tsx src/app/negotiate/[dealId]/page.tsx src/app/profile/SelfProfilePage.tsx src/app/profile/[wallet]/page.tsx src/lib/escrow-client.ts src/lib/sealed-users.ts src/lib/user-display.ts` — pass with existing negotiation page warnings.
  - `npm.cmd run build` — pass.

### Update 2026-05-21 15:43 oleh Codex
- Status: done
- Yang dikerjakan: Username display normalization, notification menu/API, escalated renegotiation state, LLM 429 fallback, negotiation room header/back button, modal opacity, and escrow funding precheck/logging.
- Files modified: see list above.
- Commit SHA: `f158c754ab0ab8c009f60629b1bcddcc082f5b0d`
- Test status: Targeted ESLint pass with existing negotiation warnings; frontend build pass; Anchor not touched.
- Blocker (jika ada): Supabase migration 004 must be applied manually before live DB accepts `status = 'escalated'`.
- Next-action untuk agent berikutnya: Run migration 004, then smoke test buyer/seller renegotiate and escrow deploy with insufficient and sufficient devnet USDC.
- Do-Not tambahan: Do not bypass the USDC precheck by writing Supabase `funded`; only confirmed Solana tx can advance funding state.

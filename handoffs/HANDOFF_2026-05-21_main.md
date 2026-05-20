# HANDOFF 2026-05-21 — branch `main`

- **status**: done
- **branch**: main
- **goal**: Implement Claude Design handoff — redesign 5 app pages + 2 new files to match Bold/Conservative design directions.

## next-action

Lanjut: test di browser (`npm run dev` di `app/`), pastikan semua page render OK:
- `/app` → swim-lane deal board (3 kolom)
- `/deals/[id]` → vertical milestone timeline
- `/onboarding` → vertical rail + identity stamp
- `/profile/[wallet]` → trust card hero
- `/app/agent` → persona dial (new page)

Kalau ada visual issue, target file spesifik. Jangan ubah logic — hanya CSS/layout.

## Context — apa yang selesai sesi ini

Design source: Claude Design handoff bundle (`u8VjTONyrOpK8j1qw-6A5w`) — tar.gz dengan 7 JSX screen files + tokens.css + primitives.

User pilihan:
- Deals dashboard → **Bold** (swim-lane by who-owes-action)
- New Deal → **Bold** (live deal sheet)
- Deal detail → **Conservative** (vertical timeline)
- Onboarding → **Bold** (vertical rail + identity stamp)
- Agent settings → **Bold** (persona dial)
- Public profile → **Bold** (trust card + timeline)

### Commits sesi ini

- `3db50c4` feat: redesign app UI to match Claude Design handoff

### Files diubah

| File | Perubahan |
|---|---|
| `app/src/app/globals.css` | Background #08090a→#0b0d12, panel #0f1011→#11141a, surface #191a1b→#181b22; `.surface-card` glass elevation; keyframes (sealed-pulse, sealed-fade-up, sealed-typing-dot, dll) |
| `app/src/components/SealedBackdrop.tsx` | **NEW** — ambient ornaments: violet glow orbs, concentric rings, SealedMark watermark, particle dots, dashed horizon |
| `app/src/app/app/page.tsx` | Bold swim-lane board — 3 kolom (Waiting on you / them / Settled); real API `/api/deals/mirror`; DealCardBold dengan milestone dots |
| `app/src/app/deals/[id]/page.tsx` | Conservative vertical timeline — stat strip 4-col, milestone rail dengan vertical line, parties panel, activity log; semua Solana tx logic intact |
| `app/src/app/onboarding/page.tsx` | Bold vertical rail — 300px left sidebar dengan step line; right panel per step; semua `updateProfile` + LLM/x402 logic intact |
| `app/src/app/profile/[wallet]/page.tsx` | Bold trust card hero — TrustStat components, tab bar (timeline/reviews/agents); semua friend API logic intact |
| `app/src/app/app/agent/page.tsx` | **NEW** — Agent Settings: persona dial SVG, price floor gauge, escalation config, saves to `sealed_agent_templates` |

### Design tokens yang berubah

```css
--background: #0b0d12   (was #08090a — warmer, less trading-terminal)
--panel:      #11141a   (was #0f1011)
--surface:    #181b22   (was #191a1b)

.surface-card {
  background: rgba(255,255,255,0.065);
  border: 1px solid rgba(255,255,255,0.14);
  backdrop-filter: blur(8px);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.05),
              0 2px 4px rgba(0,0,0,0.25),
              0 12px 28px -10px rgba(0,0,0,0.55);
}
```

## Logic inti yang TIDAK boleh diubah (carry-forward)

- On-chain PDA = source of truth untuk dana. Supabase mirror only.
- Release dana **wajib dual-sign**: Verifier rekomendasi, buyer sign.
- Komponen TSX **tidak boleh** import `@supabase/supabase-js` langsung. Lewat `/api/*` route.
- Deal PATCH body whitelist. Jangan pernah `supabase.update(body)` mentah.
- Negotiator emit structured `agreed_terms`; field yang boleh ditulis ke `sealed_deals` ada whitelist.
- File upload validasi magic bytes + strip EXIF di `/api/upload`.

## Do-Not (carry-forward + tambahan)

- **Jangan pakai "auto-release"** di copy/UX. Sealed = dual-sign / buyer confirms.
- **Jangan pakai "pengusaha" atau "not crypto"**. Pakai "business owner" + "web2 wrapper".
- **Jangan pakai email `toderr@example.com`** untuk commit. Pakai `rednave2806@gmail.com`.
- **Jangan import supabase di komponen TSX**. Lewat `/api/*` saja.
- **Jangan nested card di dalam card** berulang — design explicitly forbid ini.
- **Jangan ubah background ke terlalu gelap / neon** — harus "calm fintech trust layer", bukan trading terminal.
- **Jangan ubah `.surface-card` opacity ke < 0.05** — user sudah minta 2x lebih jelas.

## Pending / bisa dikerjakan berikutnya

- Mobile responsive — design ada 3 artboard mobile (Dashboard, New Deal, Deal Detail) belum diimplementasi di app
- Agent settings belum terintegrasi ke negotiation agent — `/api/negotiate` belum baca dari `sealed_agent_templates`
- New Deal Bold page (chat + live deal sheet split) — saat ini `/app` masih pakai `ChatInterface` lama untuk tab "chat"
- Vercel deploy untuk lihat hasil di production

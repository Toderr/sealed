# HANDOFF 2026-05-21 session 2 — branch `main`

- **status**: done
- **branch**: main
- **commit**: `145f414`
- **goal**: Wire agent persona to negotiate API + New Deal Bold split layout + Vercel production deploy.

## next-action

Lanjut bisa ke:
- **Mobile responsive** — 3 artboard (Dashboard, New Deal, Deal Detail) belum diimplementasi
- **Test di browser** — buka https://sealed-nine.vercel.app, coba New Deal tab (split layout), coba Agent settings save → buat deal → pastikan persona terapply ke negosiasi
- **`/api/negotiate/manual`** — belum dicek apakah juga perlu baca `sealed_agent_templates` (cek kalau seller manual negotiation dipakai)

## Context — apa yang selesai sesi ini

### Task 3 — Agent persona wired into `/api/negotiate`

`app/src/app/api/negotiate/route.ts` — setelah validasi body, fetch `sealed_agent_templates` untuk `buyerWallet`:

```ts
const { data: templates } = await supabase
  .from(table("agent_templates"))
  .select("style_index, price_floor, escalate_after")
  .eq("wallet", body.buyerWallet)
  .limit(1);
if (templates && templates.length > 0) {
  const p = templates[0];
  const styleMap: NegotiationStyle[] = ["conservative", "balanced", "balanced"];
  body.buyerBoundaries = {
    ...body.buyerBoundaries,
    negotiationStyle: styleMap[p.style_index ?? 1],
    maxPriceDecrease: 100 - (p.price_floor ?? 80),
    maxNegotiationRounds: p.escalate_after ?? body.buyerBoundaries.maxNegotiationRounds,
  };
}
```

Mapping:
| Persona field | NegotiationBoundaries field | Logic |
|---|---|---|
| `style_index` 0/1/2 | `negotiationStyle` | conservative / balanced / balanced |
| `price_floor` (50–100%) | `maxPriceDecrease` | `100 - floor` |
| `escalate_after` | `maxNegotiationRounds` | direct |

`opening_line` dan `tone` belum diintegrasikan ke engine — sengaja skip, butuh perubahan di `runNegotiation` dan sistem prompt.

### Task 4 — New Deal Bold split layout

`app/src/app/app/page.tsx` — "New Deal" tab sekarang 2-kolom:
- Kiri: `ChatInterface` (flex-1, border kanan)
- Kanan: `LiveDealSheet` (fixed 360px)

`LiveDealSheet` — panel baru, update live saat AI extract terms:
- Empty state: ikon dokumen + hint text
- Filled: contract type, title, amount (monospace large), milestones list dengan dot number badge
- Hint strip di bawah: "Keep chatting to refine the terms"

`app/src/components/ChatInterface.tsx` — 2 perubahan minimal:
1. `interface PartialDeal` → `export interface PartialDeal` (supaya bisa diimport)
2. Tambah prop `onPartialDeal?: (deal: PartialDeal | null) => void` — dipanggil setiap kali AI parse partial deal

### Task 5 — Vercel production deploy

- **URL**: https://sealed-nine.vercel.app
- **Build**: 31s, Next.js 16.2.3 Turbopack, 29 routes, 19 API functions, READY
- Root issue saat deploy: harus run dari repo root `E:\Claude Code\sealed`, bukan dari `app/` (karena `rootDirectory=app` di project settings)

## Logic inti yang TIDAK boleh diubah (carry-forward)

- On-chain PDA = source of truth untuk dana. Supabase mirror only.
- Release dana **wajib dual-sign**: Verifier rekomendasi, buyer sign.
- Komponen TSX **tidak boleh** import `@supabase/supabase-js` langsung. Lewat `/api/*` route.
- Deal PATCH body whitelist. Jangan pernah `supabase.update(body)` mentah.
- Negotiator emit structured `agreed_terms`; field yang boleh ditulis ke `sealed_deals` ada whitelist.

## Do-Not (carry-forward)

- **Jangan pakai "auto-release"** di copy/UX. Sealed = dual-sign / buyer confirms.
- **Jangan pakai "pengusaha" atau "not crypto"**. Pakai "business owner" + "web2 wrapper".
- **Jangan pakai email `toderr@example.com`** untuk commit. Pakai `rednave2806@gmail.com`.
- **Jangan import supabase di komponen TSX**. Lewat `/api/*` saja.
- **Jangan nested card di dalam card** berulang.
- **Deploy dari repo root** `E:\Claude Code\sealed`, bukan dari `app/`.
- **`.next` EPERM di Windows** — jika build gagal dengan EPERM, kill node process dulu (`Stop-Process -Name node -Force`), baru hapus `.next`.

## Pending / bisa dikerjakan berikutnya

- Mobile responsive — design ada 3 artboard mobile (Dashboard, New Deal, Deal Detail)
- `opening_line` + `tone` dari persona belum dikirim ke `runNegotiation` / system prompt
- `/api/negotiate/manual` — belum dicek apakah perlu persona juga
- `app/src/app/app/agent/page.tsx` masih `import { supabase } from "@/lib/supabase"` langsung (violates rule — tapi ini page bukan component, dan sudah ada sebelum rule enforcement; biarkan dulu atau migrate ke `/api/agent-templates`)

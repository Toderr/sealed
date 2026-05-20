# HANDOFF 2026-05-19 — branch `main`

- **status**: done
- **branch**: main
- **goal**: Pasang infrastructure handoff (handoffs/, docs/ARCHITECTURE.md, AGENTS.md) supaya Claude Code ↔ Codex CLI bisa relay tanpa re-explain context.

## next-action

Codex: review struktur baru. Kalau OK, lanjut beresin 3 file yang masih `M` di working tree (`CLAUDE.md`, `README.md`, `Sealed_Pitch_Script_2min.md`) — putuskan mau di-commit atau di-revert. Jangan auto-commit sebelum konfirmasi user.

## Context — apa yang sudah selesai

Sesi sebelumnya (recent commits):
- `9c085ef` docs: add system design document for Sealed Agent
- `47a3861` feat: auto-redirect after Deal Sealed popup (3s delay)
- `b482dd1` feat: show inviter stats on invite page (deals, completion rate, rating)
- `f809518` fix: persist negotiated terms to Supabase so buyer sees updated deal
- `74fae84` feat: Deal Sealed popup + agent propagates negotiated terms

Security baseline 2026-05-10 (lihat `docs/ARCHITECTURE.md` entry "OTP + ratings security baseline"):
- OTP cryptographically secure (`crypto.randomInt`).
- Ratings API: rater dari session, bukan body. Self-rating ditolak.
- Atomic deal increment RPC untuk reputation (fix race condition).
- Deal API enforce caller authorization.
- Deal PATCH whitelist body field.

### Logic inti yang TIDAK boleh diubah

- On-chain PDA = source of truth untuk dana. Supabase mirror only.
- Release dana **wajib dual-sign**: Verifier rekomendasi, buyer sign.
- Komponen TSX **tidak boleh** import `@supabase/supabase-js` langsung. Lewat `/api/*` route.
- Deal PATCH body whitelist. Jangan pernah `supabase.update(body)` mentah.
- Negotiator emit structured `agreed_terms`; field yang boleh ditulis ke `sealed_deals` ada whitelist.
- File upload validasi magic bytes + strip EXIF di `/api/upload`.

## Do-Not — pendekatan yang sudah dicoba dan gagal

- **Jangan pakai `Math.random()` untuk OTP**. Predictable. Pakai `crypto.randomInt`.
- **Jangan trust wallet dari request body** untuk KYC/ratings/email-verify. Selalu derive dari auth header / session.
- **Jangan pass arbitrary body ke supabase.update()**. Whitelist field.
- **Jangan import supabase di komponen TSX**. Audit 2026-05-06 menemukan 0 case, jaga begitu.
- **Jangan pakai istilah "auto-release"** di copy/UX. Sealed = dual-sign.
- **Jangan pakai "pengusaha" atau "not crypto"** di marketing copy. Pakai "business owner" + "web2 wrapper".
- **Jangan pakai email `toderr@example.com`** untuk commit. Vercel build block. Pakai `rednave2806@gmail.com`.
- **Jangan inline role logic ke API route**. Pakai role-based prompt template (Structurer/Negotiator/Verifier).
- **Jangan kirim API key client header ke log server**.

## Files modified — sesi ini

Belum ada perubahan kode di sesi ini. Baru bikin:
- `AGENTS.md` (new)
- `docs/ARCHITECTURE.md` (new)
- `handoffs/HANDOFF_2026-05-19_main.md` (new — file ini)

Working tree pending dari sesi sebelumnya (belum di-commit):
- `CLAUDE.md` (M)
- `README.md` (M)
- `Sealed_Pitch_Script_2min.md` (M)

## Test status

| Modul | Status |
|---|---|
| Anchor program (`programs/escrow/`) | belum ditest di sesi ini |
| Frontend (`app/`) | belum ditest di sesi ini |
| API routes | last verified 2026-05-10 (security fixes pushed) |
| Build (`npm run build`) | last green 2026-05-10 |
| Handoff infra | N/A (docs only) |

## Evidence (isi saat status → done)

- Commit SHA:
- Test command + result:
- Files final:

### Update 2026-05-20 11:28 oleh Codex
- Status: partial
- Yang dikerjakan: Menjalankan workflow apply-grant; export script Bash gagal karena WSL distro tidak terpasang, lalu fallback copy session proof files ke root project untuk aplikasi grant.
- Files modified: `codex-session.jsonl`, `claude-session.jsonl`, `handoffs/HANDOFF_2026-05-19_main.md`
- Commit SHA: e811206
- Test status: Grant prep only; tests tidak dijalankan.
- Blocker (jika ada): Bundled Bash export tidak bisa jalan di Windows tanpa WSL distro.
- Next-action untuk agent berikutnya: Original handoff next-action tetap berlaku; review struktur baru dan putuskan file pending kalau ada sebelum commit.
- Do-Not tambahan: Jangan anggap Bash exporter berhasil di environment ini; gunakan fallback copy latest `~/.codex/sessions/**/*.jsonl` dan `~/.claude/projects/E--Claude-Code-sealed/**/*.jsonl` jika WSL masih belum tersedia.

### Update 2026-05-20 12:05 oleh Codex
- Status: done
- Yang dikerjakan: Memperbaiki invite link agar payload menyimpan full inviter wallet, token invite aman untuk URL, dan invite page bisa resolve wallet penuh dari deal untuk link lama sebelum fetch public stats.
- Files modified: `app/src/app/profile/page.tsx`, `app/src/app/invite/[token]/page.tsx`, `handoffs/HANDOFF_2026-05-19_main.md`
- Commit SHA: 803986f
- Test status: Frontend build pass (`npm.cmd run build`); targeted eslint pass untuk `src/app/invite/[token]/page.tsx`; full lint masih fail karena isu lama di file lain.
- Blocker (jika ada): Tidak ada.
- Next-action untuk agent berikutnya: Tidak ada untuk task invite stats; perubahan kode sudah commit di `803986f`.
- Do-Not tambahan: Jangan simpan wallet pendek (`abc...xyz`) di `InvitePayload.inviterWallet`; field ini harus full wallet untuk profile stats dan mirror auth.

### Update 2026-05-20 13:41 oleh Codex
- Status: done
- Yang dikerjakan: Menyamakan header invite page dengan header front page untuk logo Sealed Agent: ukuran `SealedMark`, label, container width, dan aria-label.
- Files modified: `app/src/app/invite/[token]/page.tsx`, `handoffs/HANDOFF_2026-05-19_main.md`
- Commit SHA: 803986f
- Test status: Targeted eslint pass (`npx.cmd eslint "src/app/invite/[token]/page.tsx"`).
- Blocker (jika ada): Tidak ada.
- Next-action untuk agent berikutnya: Tidak ada untuk task header invite; perubahan kode sudah commit di `803986f`.
- Do-Not tambahan: Jangan buat variasi logo/header baru untuk invite; pakai pola front page sebagai sumber tampilan brand.

### Update 2026-05-20 14:50 oleh Codex
- Status: done
- Yang dikerjakan: Menambahkan gate nama di invite page untuk counterparty yang belum punya akun Sealed. Setelah wallet connect, page cek public profile wallet tersebut; kalau belum ada akun, user wajib input nama, lalu profile minimal dibuat lewat `/api/users/[wallet]/profile` sebelum masuk negotiation room.
- Files modified: `app/src/app/invite/[token]/page.tsx`, `handoffs/HANDOFF_2026-05-19_main.md`
- Commit SHA: 8084104
- Test status: Targeted eslint pass (`npx.cmd eslint "src/app/invite/[token]/page.tsx"`); frontend build pass (`npm.cmd run build`).
- Blocker (jika ada): Tidak ada.
- Next-action untuk agent berikutnya: Tidak ada untuk task invitee name gate; perubahan kode sudah commit di `8084104`.
- Do-Not tambahan: Jangan bypass profile gate untuk wallet tanpa row `sealed_users`; tetap buat profile lewat API server, bukan akses Supabase langsung dari TSX.

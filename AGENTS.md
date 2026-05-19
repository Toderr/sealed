# AGENTS.md — Sealed

Cross-agent operating rules for this project. Read this **before** any code change. Applies to Claude Code, Codex CLI, and any other agent acting on this repo.

## Session Start Protocol (wajib dibaca sebelum mulai)

1. Baca `docs/ARCHITECTURE.md` untuk memahami core logic dan constraint terbaru.
2. Baca `ARCHITECTURE.md` (root) dan `SYSTEM_DESIGN.md` untuk system overview.
3. Cari file `handoffs/HANDOFF_*.md` dengan `status: active` dan branch yang relevan dengan branch git saat ini.
4. Jangan mulai koding sebelum baca bagian **Do-Not** di handoff file aktif.
5. Setelah task selesai, update `status: done` pada handoff dan isi bagian evidence (commit SHA, test result, file modified).

## Handoff Workflow

- Lokasi: `handoffs/HANDOFF_[YYYY-MM-DD]_[branch-atau-fitur].md`
- Wajib isi: status, branch, goal, next-action, context, do-not, files modified, test status.
- Generate ulang ketika: user ketik `/handoff`, sesi diakhiri, context window mendekati limit, atau task pindah area.
- Jangan hapus handoff lama — set `status: done` saja. Riwayat decision penting.

## Architecture Decision Log

- Lokasi: `docs/ARCHITECTURE.md`
- Append-only. Jangan hapus entry lama, hanya tambahkan.
- Format wajib per entry: Keputusan, Alasan, Constraint, Tanggal.
- Tambahkan entry baru setiap kali pilih library, ubah pola arsitektur, atau set constraint penting.

## Repo-Specific Constraints (ringkas)

- On-chain (Anchor program `programs/escrow/`) adalah sumber kebenaran untuk dana. Supabase hanya untuk konteks off-chain.
- Release dana **wajib** dual-sign (buyer + AI verifier). Jangan pakai istilah "auto-release".
- Target user: business owner non-crypto. Hindari istilah "pengusaha", "not crypto". Pakai "web2 wrapper".
- Git author email: `rednave2806@gmail.com` (Vercel block kalau dipakai email lain).
- Windows host: `anchor build`/`anchor test` jalan di WSL Ubuntu. Frontend native Windows.

## Rules of Engagement

Lihat `CLAUDE.md` (root) — 12 rules berlaku untuk semua agent. Highlight:
- Rule 3: Surgical Changes. Jangan refactor adjacent code.
- Rule 8: Read before write. Baca caller dan shared utilities dulu.
- Rule 11: Match codebase convention.
- Rule 12: Fail loud. Jangan diam kalau ada step di-skip.

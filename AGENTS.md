# AGENTS.md — Sealed

Cross-agent operating rules for this project. Read this **before** any code
change. Applies to Claude Code, Codex CLI, and any other agent acting on
this repo.

---

## Session Start Protocol (wajib, urutan tidak boleh dilewati)

1. Baca `docs/ARCHITECTURE.md` untuk memahami core logic dan constraint terbaru.
2. Baca `ARCHITECTURE.md` (root) dan `SYSTEM_DESIGN.md` untuk system overview.
3. Cari file `handoffs/HANDOFF_*.md` dengan `status: active` dan branch yang
   relevan dengan branch git saat ini.
4. Jangan mulai koding sebelum baca bagian **Do-Not** di handoff file aktif.
5. Konfirmasi ke user: sebutkan `next-action` yang kamu temukan dan minta
   persetujuan eksplisit sebelum mulai eksekusi.
6. Setelah task selesai, update `status: done` pada handoff dan isi bagian
   evidence (commit SHA, test result, files modified).

---

## Handoff Workflow

- Lokasi: `handoffs/HANDOFF_[YYYY-MM-DD]_[branch-atau-fitur].md`
- Wajib isi: `status`, `branch`, `goal`, `next-action`, `context`,
  `do-not`, `files-modified`, `test-status`.
- Generate/update handoff ketika:
  - User ketik `/handoff`
  - Sesi diakhiri atau user bilang "selesai untuk hari ini"
  - Context window mendekati limit
  - Task pindah ke area kode yang berbeda
- Jangan hapus handoff lama. Set `status: done` saja. Riwayat decision
  penting untuk semua agent.

### Format Update Setelah Task Selesai

Tambahkan section ini di bagian bawah handoff file aktif:

    ### Update [YYYY-MM-DD HH:MM] oleh [Agent]
    - Status: done | partial | blocked
    - Yang dikerjakan: [deskripsi singkat]
    - Files modified: [daftar file]
    - Commit SHA: [jika ada]
    - Test status: [per modul — pass / fail / belum ditest]
    - Blocker (jika ada): [deskripsi]
    - Next-action untuk agent berikutnya: [task konkret]
    - Do-Not tambahan: [pendekatan yang dicoba dan gagal, beserta alasannya]

Jika `status: partial` atau `blocked`, handoff tetap `status: active`.

---

## Architecture Decision Log

- Lokasi: `docs/ARCHITECTURE.md`
- **Append-only.** Jangan hapus entry lama, hanya tambahkan.
- Tambahkan entry baru setiap kali: memilih library, mengubah pola
  arsitektur, atau menetapkan constraint penting.

### Format Wajib Per Entry

    ### [Nama Keputusan]
    - Keputusan: [apa yang dipilih]
    - Alasan: [kenapa]
    - Constraint: [apa yang TIDAK boleh dilanggar]
    - Tanggal: [YYYY-MM-DD]

---

## Repo-Specific Constraints

- **On-chain is source of truth.** Anchor program `programs/escrow/` adalah
  sumber kebenaran untuk dana. Supabase hanya untuk konteks off-chain.
- **Dual-sign wajib.** Release dana harus dual-sign (buyer + AI verifier).
  Jangan gunakan istilah atau pola "auto-release" di kode maupun komentar.
- **Web2 wrapper framing.** Target user adalah business owner non-crypto.
  Hindari istilah teknis crypto di UI layer. Pakai bahasa "web2 wrapper".
- **Git author email:** `rednave2806@gmail.com` — Vercel akan block deploy
  jika menggunakan email lain.
- **Build environment split:**
  - `anchor build` dan `anchor test` harus dijalankan di WSL Ubuntu.
  - Frontend dijalankan native Windows.
  - Jangan mix environment untuk task yang salah domain.

---

## Rules of Engagement

Lihat `CLAUDE.md` (root) untuk 12 rules lengkap yang berlaku untuk semua
agent. Rules kritis yang paling sering dilanggar:

- **Rule 3 — Surgical Changes:** Jangan refactor kode adjacent yang tidak
  dalam scope task. Ubah hanya yang diminta.
- **Rule 8 — Read Before Write:** Baca caller dan shared utilities dulu
  sebelum modifikasi apapun.
- **Rule 11 — Match Convention:** Ikuti konvensi naming, struktur, dan
  pattern yang sudah ada di codebase.
- **Rule 12 — Fail Loud:** Jangan diam jika ada step yang di-skip atau
  ada ambiguitas. Tanyakan ke user, jangan asumsikan sendiri.

---

## Conflict Resolution

Jika ada instruksi yang bertentangan antara file-file ini:

1. Constraint di section **Repo-Specific Constraints** selalu menang.
2. `docs/ARCHITECTURE.md` menang atas asumsi pribadi agent.
3. Handoff `do-not` menang atas solusi yang "terlihat lebih baik".
4. Jika masih ambigu, **tanyakan ke user sebelum eksekusi.**
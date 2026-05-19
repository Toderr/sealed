# docs/ARCHITECTURE.md — Decision Log

Append-only log of architecture decisions for Sealed. Single source of truth for **why** things are built the way they are. For implementation detail see root `ARCHITECTURE.md` and `SYSTEM_DESIGN.md`.

Format per entry:

```
### [Nama Keputusan]
- Keputusan: [apa yang dipilih]
- Alasan: [kenapa]
- Constraint: [apa yang TIDAK boleh dilanggar]
- Tanggal: [YYYY-MM-DD]
```

Jangan hapus entry lama. Tambahkan saja.

---

### On-chain = source of truth untuk dana
- Keputusan: Anchor escrow program (`programs/escrow/`) memegang state otoritatif untuk balance, milestone release, refund, dispute. Supabase hanya mirror off-chain.
- Alasan: Tamper-proof + audit-able. Supabase service-role key kena breach tidak boleh menyebabkan kehilangan dana.
- Constraint: Jangan pernah trust Supabase untuk fund movement. Setiap operasi keuangan harus verifikasi state PDA on-chain.
- Tanggal: 2026-03 (initial design)

### Dual-sign milestone release
- Keputusan: Pembebasan dana harus disign buyer; AI Verifier hanya merekomendasikan.
- Alasan: Keep human-in-the-loop. Mencegah agent-driven loss.
- Constraint: Jangan pernah pakai bahasa "auto-release" di copy/UX. Verifier tidak boleh memiliki authority sign sendiri.
- Tanggal: 2026-03

### Tiga-agent product model
- Keputusan: Structurer (parse NL → deal params), Negotiator (counter-propose), Verifier (review proof).
- Alasan: Memisahkan concern + prompt budget per role. Memudahkan tambah Scout agent ke depan tanpa rewrite engine.
- Constraint: Role baru = prompt template baru + tool allowlist baru. Jangan inline role logic ke API route.
- Tanggal: 2026-04

### Dual LLM provider strategy
- Keputusan: Buyer agent pakai client-supplied LLM credential via headers; Seller/Verifier pakai server env (`ANTHROPIC_API_KEY`).
- Alasan: User bawa key sendiri untuk privacy + cost. Verifier butuh deterministic server identity.
- Constraint: Server jangan log client headers berisi API key. Verifier API key tidak boleh diekspos ke client.
- Tanggal: 2026-05

### Supabase off-chain schema dengan prefix `sealed_`
- Keputusan: 11 tabel, semua prefix `sealed_`. Akses lewat service-role client di server saja.
- Alasan: Isolasi project di shared Supabase instance. Memudahkan RLS migration ke depan.
- Constraint: Komponen TSX tidak boleh import `@supabase/supabase-js` langsung. Semua akses lewat `/api/*` route.
- Tanggal: 2026-04

### Reputation: hybrid on-chain anchor + Supabase aggregate
- Keputusan: `Reputation` PDA on-chain (tamper-proof anchor); `sealed_reputation` + `sealed_ratings` di Supabase untuk aggregate/query cepat.
- Alasan: PDA mahal untuk per-deal star; Supabase cepat untuk dashboard.
- Constraint: Score yang ditampilkan publik harus reconcile dengan PDA. Setiap mutation Supabase pakai atomic increment RPC.
- Tanggal: 2026-05

### Identity messaging untuk web2 user
- Keputusan: Sealed dipresentasikan sebagai "web2 wrapper" untuk business owner non-crypto, bukan "crypto product".
- Alasan: Target user = business owner non-crypto. Mereka lari kalau lihat istilah "crypto".
- Constraint: Hindari "pengusaha" (pakai "business owner"), "not crypto" (pakai "web2 wrapper"), "auto-release" (pakai "dual-sign").
- Tanggal: 2026-05

### Verifier multimodal proof
- Keputusan: Verifier menerima proof type `image | url | text`, dispatch ke multimodal LLM (Gemini/Claude vision).
- Alasan: Real-world deliverable = file/screenshot/link, bukan cuma text.
- Constraint: File upload wajib lewat `/api/upload` yang validasi magic bytes + strip EXIF.
- Tanggal: 2026-05

### Negotiator emit structured agreed terms
- Keputusan: Manual negotiation system prompt diperkuat agar emit JSON `agreed_terms` saat ada konsensus, lalu propagate ke Supabase `sealed_deals`.
- Alasan: Tanpa structured emit, terms hasil negosiasi tidak pernah update kontrak. Buyer lihat term lama.
- Constraint: Field yang boleh ditulis dari hasil negotiate terbatas (amount, milestones, deadline). Jangan terima field arbitrary dari LLM output.
- Tanggal: 2026-05-10

### Auth refinement untuk Deal PATCH
- Keputusan: Deal PATCH require caller authorization tapi izinkan seller join flow (seller_wallet nullable di awal, isi saat join).
- Alasan: Awal: seller belum tahu deal. Tetap perlu authorization setelah seller terikat.
- Constraint: PATCH body field whitelist. Jangan pernah pass arbitrary body ke `supabase.update()`.
- Tanggal: 2026-05-10

### OTP + ratings security baseline
- Keputusan: OTP pakai `crypto.randomInt`. Ratings API tolak self-rating dan verify rater identity dari session, bukan body.
- Alasan: `Math.random` predictable. Body-trusted rater = spoof identity.
- Constraint: Setiap endpoint yang mutate user-scoped state wajib derive identity dari auth header, bukan body.
- Tanggal: 2026-05-10

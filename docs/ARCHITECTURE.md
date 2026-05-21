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

### Avatar stored as base64 data URL in DB
- Keputusan: Avatar disimpan sebagai base64 JPEG data URL langsung di kolom `avatar_url` di `sealed_users`, bukan di Supabase Storage.
- Alasan: Menghindari signed URL complexity (expiry, proxy route). Sharp resize ke 256×256 JPEG quality 80 → ~10–20KB base64. Aman di JSON response.
- Constraint: Max upload 5MB. Strip metadata via Sharp. Jangan simpan raw upload — selalu resize dulu.
- Tanggal: 2026-05-19

### Profile fields di Supabase sealed_users
- Keputusan: display_name, bio, avatar_url, website, twitter_handle, linkedin_url, instagram_handle, telegram_handle, company_file_url, company_file_name ditambahkan ke `sealed_users`.
- Alasan: Profile harus tersedia di server untuk ditampilkan ke counterparty di invite page. localStorage saja tidak cukup.
- Constraint: Sync ke Supabase dilakukan saat `handleProfileContinue` onboarding (fire-and-forget). Source of truth untuk display tetap Supabase.
- Tanggal: 2026-05-19

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

### Completed deal reviews update public rating immediately
- Keputusan: Review bintang 1-5 hanya bisa dibuat oleh buyer/seller setelah deal completed, lalu langsung `revealed` dan masuk aggregate `avg_rating` ratee.
- Alasan: Profile dan invite page harus menampilkan rating yang baru diberikan tanpa menunggu counterparty ikut review.
- Constraint: Ratings API tetap derive rater dari `x-wallet`, menolak self-rating, memverifikasi caller adalah party deal, dan memverifikasi deal sudah completed sebelum insert.
- Tanggal: 2026-05-21

### Renegotiation request is prompt-scoped
- Keputusan: Tombol Renegotiate membuka dialog instruksi user dan mengirim `renegotiationRequest` ke `/api/negotiate` sebagai konteks prompt agent.
- Alasan: User perlu menyatakan target negosiasi ulang tanpa langsung menulis ulang terms secara arbitrary.
- Constraint: Terms final tetap hanya boleh berasal dari structured `Proposal.finalTerms`; instruksi renegotiate tidak boleh langsung mutate deal/fund state.
- Tanggal: 2026-05-21

### Escrow post-sign mirror is best-effort
- Keputusan: Setelah buyer sign deploy escrow, UI update local funded state setelah konfirmasi on-chain, lalu sync Supabase mirror via `/api/deals/mirror` dengan fallback PATCH.
- Alasan: On-chain adalah source of truth untuk dana; kegagalan mirror Supabase tidak boleh membuat user terlihat stuck setelah transaksi sukses.
- Constraint: Jangan pernah treat Supabase sebagai bukti dana terkunci; mirror hanya konteks off-chain dan harus bisa diretry.
- Tanggal: 2026-05-21

### Profile trust uses username display and verified banner
- Keputusan: Profile/friends/invite UI menampilkan display name/username dan public rating aggregate; self-profile menampilkan banner verified account ketika belum verified.
- Alasan: Target user business owner membutuhkan trust signal yang mudah dibaca, bukan wallet address sebagai identitas utama.
- Constraint: Wallet tetap identity primitive untuk auth dan on-chain instruction; verified account tidak memberi authority atas escrow funds.
- Tanggal: 2026-05-21

### Generated handle suffix hidden in display
- Keputusan: UI menampilkan handle invite-created seperti `@michael-hjwwnqcw` sebagai `@michael`, sementara DB tetap menyimpan handle unik dan lookup username tetap bisa resolve handle bersuffix.
- Alasan: Suffix dibuat untuk uniqueness teknis, bukan identitas publik yang harus dibaca counterparty.
- Constraint: Jangan menghapus uniqueness constraint `sealed_users.handle`; normalisasi display tidak boleh mengubah wallet identity atau stored handle.
- Tanggal: 2026-05-21

### Escalated renegotiation status
- Keputusan: Ketika user memilih Renegotiate, `sealed_deals.status` berubah menjadi `escalated` dan `/api/negotiate` mengembalikan proposal escalated ketika provider LLM rate-limited.
- Alasan: Kedua pihak perlu melihat state reopened terms yang sama tanpa menampilkan raw provider error 429 sebagai kegagalan produk.
- Constraint: `escalated` adalah konteks off-chain; tidak boleh dianggap state on-chain escrow atau bukti dana.
- Tanggal: 2026-05-21

### In-app notification menu from deal context
- Keputusan: `GET /api/notifications` menyintesis notifikasi dari `sealed_deals` dan menggabungkannya dengan `sealed_notification_queue`, lalu `NotificationMenu` dipasang di header utama/profile/negotiation.
- Alasan: User dan counterparty harus bisa melihat notification menu meski belum punya email/Telegram channel.
- Constraint: Notification bukan source of truth dana; semua fund movement tetap wallet-signed dan on-chain.
- Tanggal: 2026-05-21

### Funding precheck and SendTransactionError logs
- Keputusan: Frontend mengecek saldo USDC buyer sebelum deploy escrow dan `sendTx` menangkap `SendTransactionError` untuk memanggil `getLogs(connection)`.
- Alasan: SPL Token insufficient funds harus muncul sebagai pesan yang bisa ditindaklanjuti, bukan simulation failure mentah setelah sign.
- Constraint: Precheck hanya UX guard; on-chain program tetap otoritatif dan Supabase mirror tidak boleh ditulis funded sebelum transaksi confirmed.
- Tanggal: 2026-05-21

### Seller negotiation avoids free OpenRouter fallback
- Keputusan: `/api/negotiate` tidak memakai server-side OpenRouter model `:free` untuk simulated seller turn ketika buyer membawa own-key provider seperti OpenAI; seller turn memakai buyer provider dan retry ke buyer provider jika server seller LLM kena 429.
- Alasan: Error renegotiate terjadi di seller turn dari server OpenRouter/Gemma, bukan dari OpenAI user. Free upstream model tidak cukup stabil untuk flow negosiasi.
- Constraint: Jangan log API key. Log hanya provider/model. Fallback ini tidak mengubah escrow authority atau fund state.
- Tanggal: 2026-05-21

# Sealed app

Next.js frontend + API for the Sealed escrow platform (see repo root README).

```bash
npm run dev    # dev server on :3000
npm run build  # production build
npm run lint   # eslint
```

Env vars live in `.env.local` — see the Supabase section of the root `CLAUDE.md`
for the required keys. On-chain escrow state is authoritative; Supabase tables
(`sealed_*`) mirror off-chain context only.

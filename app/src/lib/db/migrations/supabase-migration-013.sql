-- Migration 013: Short invite links (`sealed_deals.invite_code`).
-- Run in Supabase SQL Editor before serving /i/{code} links.
--
-- Invite links used to base64-encode the whole deal payload into the URL
-- (title, milestones, bio, wallets), producing 800-1000+ char links that grow
-- unbounded with milestone text and break when pasted into chat apps. The link
-- is now `/i/{code}` where code is 8 random base62 chars (~48 bits), minted
-- server-side on first request and resolved back to the deal via this column.
--
-- Codes are minted lazily, so most rows stay NULL. That needs no special
-- handling: a Postgres UNIQUE constraint already permits many NULLs and only
-- constrains the non-NULL values. (An earlier draft added a `WHERE invite_code
-- IS NOT NULL` partial index alongside this — it enforced the identical rule,
-- so it was two indexes doing one index's job, paid for on every write.)
--
-- Old `/invite/{base64}` links keep working (the page still decodes the
-- payload), so this migration is additive and safe to re-run.

ALTER TABLE sealed_deals
  ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;

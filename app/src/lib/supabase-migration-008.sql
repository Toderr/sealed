-- Migration 008 — report a USER/ACCOUNT, not just a deal (Round 6, #12).
--
-- Apply in the Supabase SQL editor.
--
-- 1) reported_wallet — the wallet being reported. Nullable: existing complaints
--    are about a deal or general, and only account reports set this.
ALTER TABLE sealed_complaints ADD COLUMN IF NOT EXISTS reported_wallet TEXT;

-- 2) Allow the 'account' category (reporting a suspicious account). The base
--    schema's CHECK constraint enumerates the allowed categories, so widen it.
ALTER TABLE sealed_complaints DROP CONSTRAINT IF EXISTS sealed_complaints_category_check;
ALTER TABLE sealed_complaints ADD CONSTRAINT sealed_complaints_category_check
    CHECK (category IN ('non_delivery','quality','communication','payment','account','other'));

-- Index for looking up complaints filed against a given account.
CREATE INDEX IF NOT EXISTS sealed_complaints_reported_idx ON sealed_complaints (reported_wallet);

-- Migration 008 — complaints table (report a deal OR a suspicious account).
--
-- Apply in the Supabase SQL editor.
--
-- The sealed_complaints table was never created in the live DB (the earlier
-- complaints feature shipped without it), so this CREATES it fresh — already
-- including reported_wallet + the 'account' category for Round 6 #12. If the
-- table somehow already exists, IF NOT EXISTS makes this a no-op; in that case
-- run these two lines instead to add the account-report support:
--   ALTER TABLE sealed_complaints ADD COLUMN IF NOT EXISTS reported_wallet TEXT;
--   ALTER TABLE sealed_complaints DROP CONSTRAINT IF EXISTS sealed_complaints_category_check;
--   ALTER TABLE sealed_complaints ADD CONSTRAINT sealed_complaints_category_check
--       CHECK (category IN ('non_delivery','quality','communication','payment','account','other'));

CREATE TABLE IF NOT EXISTS sealed_complaints (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id         TEXT,                    -- optional; a complaint may be general
    reporter_wallet TEXT NOT NULL,
    reported_wallet TEXT,                    -- optional; the account being reported (category 'account')
    category        TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('non_delivery','quality','communication','payment','account','other')),
    message         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sealed_complaints_status_idx ON sealed_complaints (status, created_at);
CREATE INDEX IF NOT EXISTS sealed_complaints_deal_idx ON sealed_complaints (deal_id);
CREATE INDEX IF NOT EXISTS sealed_complaints_reported_idx ON sealed_complaints (reported_wallet);

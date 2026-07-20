-- Migration 011 — safety net: ensure every table in supabase-schema.sql exists.
--
-- Apply in the Supabase SQL editor. Safe to run repeatedly (all IF NOT EXISTS).
--
-- WHY: two production bugs came from tables that are defined in schema.sql but
-- were never applied to the live DB — sealed_complaints (every complaint 500'd)
-- and sealed_refund_requests (every "Request refund" 500'd, surfacing as
-- "Couldn't start the refund"). Migrations had only ever ALTERed existing tables,
-- so a table added to schema.sql after the initial setup silently never existed.
--
-- This re-runs the CREATE TABLE IF NOT EXISTS for the tables most likely to be
-- missing. Existing tables and data are untouched.

-- Mutual-refund handoff relay (see migration 010).
CREATE TABLE IF NOT EXISTS sealed_refund_requests (
    deal_id        TEXT PRIMARY KEY,
    requested_by   TEXT NOT NULL,
    partial_tx     TEXT NOT NULL,
    blockhash      TEXT,
    status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','cancelled')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User-reported problems / account reports (see migration 008).
CREATE TABLE IF NOT EXISTS sealed_complaints (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id         TEXT,
    reporter_wallet TEXT NOT NULL,
    reported_wallet TEXT,
    category        TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('non_delivery','quality','communication','payment','account','other')),
    message         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Friend graph (added in migration 006; re-asserted here for completeness).
CREATE TABLE IF NOT EXISTS sealed_friends (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet        TEXT NOT NULL,
    friend_wallet TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (wallet, friend_wallet)
);

CREATE INDEX IF NOT EXISTS sealed_complaints_status_idx ON sealed_complaints (status, created_at);
CREATE INDEX IF NOT EXISTS sealed_complaints_deal_idx ON sealed_complaints (deal_id);
CREATE INDEX IF NOT EXISTS sealed_complaints_reported_idx ON sealed_complaints (reported_wallet);

-- Verify afterwards — this should list every sealed_* table the app uses:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name LIKE 'sealed_%' ORDER BY table_name;
-- Expected: agent_memory, agent_templates, complaints, deals, deliverables,
--           friends, messages, notification_queue, ratings, refund_requests,
--           reputation, users

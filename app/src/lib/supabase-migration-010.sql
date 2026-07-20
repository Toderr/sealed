-- Migration 010 — create sealed_refund_requests (mutual-refund relay).
--
-- Apply in the Supabase SQL editor.
--
-- This table is defined in supabase-schema.sql but was never applied to the live
-- DB (same gap as sealed_complaints). Every "Request refund" POST therefore hit a
-- nonexistent table and 500'd, surfacing as "Couldn't start the refund" no matter
-- what the client did (Round 6 retest, #1).
--
-- It holds the initiator's partially-signed refund transaction so the counterparty
-- can co-sign from their own device. No keys are stored; nothing is signed here.
CREATE TABLE IF NOT EXISTS sealed_refund_requests (
    deal_id        TEXT PRIMARY KEY,        -- one active request per deal
    requested_by   TEXT NOT NULL,           -- wallet that initiated + partial-signed
    partial_tx     TEXT NOT NULL,           -- base64 partially-signed refund tx
    blockhash      TEXT,                    -- durable-nonce VALUE (does not expire)
    nonce_account  TEXT,                    -- the nonce account (to reclaim its rent)
    status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','cancelled')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- If an earlier version of the table already exists:
ALTER TABLE sealed_refund_requests ADD COLUMN IF NOT EXISTS nonce_account TEXT;

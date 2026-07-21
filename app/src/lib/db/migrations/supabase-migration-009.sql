-- Migration 009 — add the 'manual-chat' deal status (Round 6 fully-manual mode).
--
-- Apply in the Supabase SQL editor.
--
-- When the seller picks "Manual chat", the deal moves to 'manual-chat' so the
-- BUYER's room knows to render a manual chat panel (both parties type by hand;
-- no auto agent reply). Without a distinct status the buyer only saw a passive
-- "waiting" placeholder and couldn't reply.
--
-- The base schema's status CHECK enumerates allowed values, so widen it.
ALTER TABLE sealed_deals DROP CONSTRAINT IF EXISTS sealed_deals_status_check;
ALTER TABLE sealed_deals ADD CONSTRAINT sealed_deals_status_check
    CHECK (status IN (
        'draft',
        'seller-ready',
        'seller-agreed',
        'manual-chat',
        'escalated',
        'proposed',
        'funded',
        'in_progress',
        'completed',
        'refunded',
        'disputed'
    ));

-- Migration 007 — allow seller-created (inviter) deals + a funding timestamp.
--
-- Apply in the Supabase SQL editor.
--
-- 1) buyer_wallet must be nullable. The seller-as-inviter flow (a seller creates
--    a deal before a buyer has joined) writes buyer_wallet = NULL. Migration 001
--    dropped NOT NULL only on seller_wallet; buyer_wallet was left NOT NULL, so
--    every seller-created deal's mirror INSERT was rejected → the row never
--    persisted → the negotiation room showed "deal not found" (Round 6, #1).
ALTER TABLE sealed_deals ALTER COLUMN buyer_wallet DROP NOT NULL;

-- 2) funded_at — the wall-clock moment escrow was funded, so the buyer-timeout
--    reclaim UI can show WHEN the 30-day inactivity window elapses (Round 6, #9).
--    On-chain deal.funded_at is the source of truth; this mirrors it for display.
--    Nullable: unset until the deal is funded.
ALTER TABLE sealed_deals ADD COLUMN IF NOT EXISTS funded_at TIMESTAMPTZ;

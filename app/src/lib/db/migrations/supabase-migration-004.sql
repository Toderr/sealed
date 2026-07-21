-- Migration 004: Add escalated deal status.
-- Run in Supabase SQL Editor before enabling renegotiation escalation in prod.
--
-- The app sets sealed_deals.status = 'escalated' when either party reopens
-- terms through the Renegotiate flow. This is off-chain context only; escrow
-- fund custody remains on-chain.

ALTER TABLE sealed_deals
  DROP CONSTRAINT IF EXISTS sealed_deals_status_check;

ALTER TABLE sealed_deals
  ADD CONSTRAINT sealed_deals_status_check CHECK (status IN (
    'draft',
    'seller-ready',
    'seller-agreed',
    'escalated',
    'proposed',
    'funded',
    'in_progress',
    'completed',
    'refunded',
    'disputed'
  ));

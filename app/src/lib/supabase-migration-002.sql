-- Migration 002: Atomic deal increment RPC
-- Run in Supabase SQL Editor.
--
-- Replaces the read-then-write pattern in incrementDeal() with a single
-- atomic upsert so concurrent deal completions cannot clobber each other.

CREATE OR REPLACE FUNCTION increment_deal(p_wallet TEXT, p_outcome TEXT)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO sealed_reputation (wallet, deals_total, deals_successful, deals_failed, avg_rating, updated_at)
  VALUES (
    p_wallet,
    1,
    CASE WHEN p_outcome = 'success' THEN 1 ELSE 0 END,
    CASE WHEN p_outcome = 'failure' THEN 1 ELSE 0 END,
    0,
    NOW()
  )
  ON CONFLICT (wallet) DO UPDATE SET
    deals_total      = sealed_reputation.deals_total + 1,
    deals_successful = sealed_reputation.deals_successful + CASE WHEN p_outcome = 'success' THEN 1 ELSE 0 END,
    deals_failed     = sealed_reputation.deals_failed     + CASE WHEN p_outcome = 'failure' THEN 1 ELSE 0 END,
    updated_at       = NOW();
END;
$$;

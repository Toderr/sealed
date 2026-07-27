-- Migration 015: Record who created each deal (`sealed_deals.creator_role`).
-- Run in Supabase SQL Editor.
--
-- Phase 0 of per-user fee tiers (issue #49). The proposed SSS/SS/S tiers apply
-- ONLY when that user creates the contract ("hanya berlaku jika dia yang bikin
-- kontraknya") — and that fact is currently recorded NOWHERE.
--
-- The mirror route already RECEIVES creator_role: it uses it to decide which
-- slot the creator's wallet goes into, then discards it. Once written, a
-- seller-created and a buyer-created deal are byte-identical. On-chain is no
-- better: create_deal is always signed by the buyer regardless of who created
-- the deal, so the creator cannot be inferred there either.
--
-- Deliberately NULLABLE with no default, and existing rows are NOT backfilled.
-- The information was never recorded, so any backfill would be a guess:
-- defaulting to 'buyer' is right for the common case but silently wrong for
-- every seller-created deal, which would mean quiet mispricing once tiers read
-- this column. NULL honestly means "created before we tracked this".
--
-- Consequence worth knowing: deals predating this migration can never be
-- tiered retroactively. If tiers are meant to be EARNED through activity, the
-- clock starts here — which is why this ships ahead of the pricing decision.
--
-- Additive and safe to re-run. Nothing reads the column yet.

ALTER TABLE sealed_deals
  ADD COLUMN IF NOT EXISTS creator_role TEXT
    CHECK (creator_role IN ('buyer', 'seller'));

-- Tier resolution looks up "deals created by this wallet", which means filtering
-- on the creator's slot. Partial: only the tracked rows are of interest.
CREATE INDEX IF NOT EXISTS sealed_deals_creator_role_idx
  ON sealed_deals (creator_role)
  WHERE creator_role IS NOT NULL;

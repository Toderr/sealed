-- Migration 001: Fix sealed_deals schema
-- Run this in the Supabase SQL Editor (https://app.supabase.com → your project → SQL Editor)
--
-- Fixes two bugs that caused all deal writes to fail silently:
-- 1. seller_wallet was NOT NULL — deals now start with no seller (NULL until invite accepted)
-- 2. status CHECK constraint was missing 'seller-ready' and 'seller-agreed'

-- Step 1: Make seller_wallet nullable
ALTER TABLE sealed_deals
    ALTER COLUMN seller_wallet DROP NOT NULL;

-- Step 2: Drop the old status CHECK constraint
ALTER TABLE sealed_deals
    DROP CONSTRAINT IF EXISTS sealed_deals_status_check;

-- Step 3: Add the updated CHECK constraint with all valid statuses
ALTER TABLE sealed_deals
    ADD CONSTRAINT sealed_deals_status_check
    CHECK (status IN (
        'draft',
        'seller-ready',
        'seller-agreed',
        'proposed',
        'funded',
        'in_progress',
        'completed',
        'refunded',
        'disputed'
    ));

-- Verify: this query should return no errors
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'sealed_deals'
  AND column_name IN ('seller_wallet', 'status');

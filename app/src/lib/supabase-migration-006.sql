-- Migration 006: Friends table + user profile/KYC columns.
-- Run in the Supabase SQL Editor.
--
-- Two things were in supabase-schema.sql but never applied to this database:
--   1. sealed_friends did not exist at all → "Add a friend" failed with
--      PGRST205 "Could not find the table 'public.sealed_friends'".
--   2. sealed_users was created before the profile feature, so it's missing
--      display_name / bio / avatar / socials / KYC columns. The reviews API
--      selects (handle, display_name); with display_name absent the whole user
--      lookup errored, so reviewers rendered as a raw wallet instead of their
--      username.
-- Both use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS, so this is safe to re-run.

-- 1) Friend connections between wallets ------------------------------------
CREATE TABLE IF NOT EXISTS sealed_friends (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet        TEXT NOT NULL,           -- who sent the request
    friend_wallet TEXT NOT NULL,           -- who received it
    status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (wallet, friend_wallet)
);
CREATE INDEX IF NOT EXISTS sealed_friends_wallet_idx        ON sealed_friends (wallet);
CREATE INDEX IF NOT EXISTS sealed_friends_friend_wallet_idx ON sealed_friends (friend_wallet);

-- 2) Bring sealed_users up to the current schema ---------------------------
ALTER TABLE sealed_users
    ADD COLUMN IF NOT EXISTS email               TEXT,
    ADD COLUMN IF NOT EXISTS email_verified       BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS email_otp            TEXT,
    ADD COLUMN IF NOT EXISTS telegram_chat_id     TEXT,
    ADD COLUMN IF NOT EXISTS telegram_username    TEXT,
    ADD COLUMN IF NOT EXISTS kyc_status           TEXT NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS kyc_document_url     TEXT,
    ADD COLUMN IF NOT EXISTS kyc_submitted_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verified_at          TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verified_payment_tx  TEXT,
    ADD COLUMN IF NOT EXISTS display_name         TEXT,
    ADD COLUMN IF NOT EXISTS bio                  TEXT,
    ADD COLUMN IF NOT EXISTS avatar_url           TEXT,
    ADD COLUMN IF NOT EXISTS website              TEXT,
    ADD COLUMN IF NOT EXISTS twitter_handle       TEXT,
    ADD COLUMN IF NOT EXISTS linkedin_url         TEXT,
    ADD COLUMN IF NOT EXISTS instagram_handle     TEXT,
    ADD COLUMN IF NOT EXISTS telegram_handle      TEXT,
    ADD COLUMN IF NOT EXISTS company_file_url     TEXT,
    ADD COLUMN IF NOT EXISTS company_file_name    TEXT;

-- kyc_status has a CHECK in the schema; add it only if it isn't already there.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sealed_users_kyc_status_check'
  ) THEN
    ALTER TABLE sealed_users
      ADD CONSTRAINT sealed_users_kyc_status_check
      CHECK (kyc_status IN ('none','pending','approved','rejected'));
  END IF;
END $$;

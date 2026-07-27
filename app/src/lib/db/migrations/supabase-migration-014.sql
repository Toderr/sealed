-- Migration 014: Telegram account linking.
-- Run in Supabase SQL Editor before enabling Telegram notifications.
--
-- The queue already sends to sealed_users.telegram_chat_id, but nothing ever
-- set it — the UI was a disabled "coming soon" stub. A chat id isn't something
-- a user can look up, so they can't paste it: instead we mint a short-lived
-- code, they send it to the bot, and the webhook resolves code → wallet and
-- records the chat id it received the message from (which also proves they
-- control that chat).
--
-- One row per user, cleared on use, so no separate table and no cleanup job.

ALTER TABLE sealed_users
  ADD COLUMN IF NOT EXISTS telegram_link_code TEXT,
  ADD COLUMN IF NOT EXISTS telegram_link_expires_at TIMESTAMPTZ;

-- The webhook looks a user up BY code on every inbound message, so this index
-- carries the hot path. Partial: codes are cleared on use, so almost every row
-- is NULL and only live codes are worth indexing.
CREATE INDEX IF NOT EXISTS sealed_users_telegram_link_code_idx
  ON sealed_users (telegram_link_code)
  WHERE telegram_link_code IS NOT NULL;

-- Migration 012: Notify on friend requests.
-- Run in Supabase SQL Editor before relying on friend-request notifications.
--
-- The friends POST handler now calls queueNotification(recipient,
-- 'friend_request', ...) when a request is created, and
-- 'friend_request_accepted' when an incoming request is auto-accepted.
-- queueNotification gates on notify_on[eventType], so existing users (whose
-- notify_on predates these keys) would silently drop the notification. This:
--   1. updates the column DEFAULT for new users, and
--   2. backfills existing rows that don't already have the keys (preserving an
--      explicit opt-out — only adds where the key is absent).

ALTER TABLE sealed_users
  ALTER COLUMN notify_on SET DEFAULT
    '{"deal_review_needed":true,"milestone_due":true,"deal_accepted":true,"deal_declined":true,"new_deal_invite":true,"renegotiation_escalated":true,"friend_request":true,"friend_request_accepted":true}'::jsonb;

UPDATE sealed_users
  SET notify_on = notify_on || '{"friend_request":true}'::jsonb
  WHERE NOT (notify_on ? 'friend_request');

UPDATE sealed_users
  SET notify_on = notify_on || '{"friend_request_accepted":true}'::jsonb
  WHERE NOT (notify_on ? 'friend_request_accepted');

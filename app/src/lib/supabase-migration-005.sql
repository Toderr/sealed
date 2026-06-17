-- Migration 005: Notify on renegotiation escalation.
-- Run in Supabase SQL Editor before relying on renegotiation notifications.
--
-- The deal PATCH handler now calls queueNotification(counterparty,
-- 'renegotiation_escalated', ...) when a deal transitions to 'escalated'.
-- queueNotification gates on notify_on[eventType], so existing users (whose
-- notify_on predates this key) would silently drop the notification. This:
--   1. updates the column DEFAULT for new users, and
--   2. backfills existing rows that don't already have the key (preserving an
--      explicit opt-out — only adds where the key is absent).

ALTER TABLE sealed_users
  ALTER COLUMN notify_on SET DEFAULT
    '{"deal_review_needed":true,"milestone_due":true,"deal_accepted":true,"deal_declined":true,"new_deal_invite":true,"renegotiation_escalated":true}'::jsonb;

UPDATE sealed_users
  SET notify_on = notify_on || '{"renegotiation_escalated":true}'::jsonb
  WHERE NOT (notify_on ? 'renegotiation_escalated');

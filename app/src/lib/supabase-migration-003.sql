-- Migration 003: Enable Realtime on sealed_deals
-- Run in Supabase SQL Editor.
--
-- Allows browser clients to subscribe to live deal updates (status changes,
-- seller join) without polling. Required for the Supabase Realtime subscription
-- added to the negotiate room.

ALTER TABLE sealed_deals REPLICA IDENTITY FULL;

-- Add to the default Realtime publication (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'sealed_deals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sealed_deals;
  END IF;
END;
$$;

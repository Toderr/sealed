# Supabase migrations

Numbered SQL migrations, applied by hand in the **Supabase SQL Editor**
(dashboard → SQL Editor → paste → Run). There is no migration runner and no
tracking table: nothing records which of these have been applied, so the list
below is the record. Keep it current.

Apply in ascending order. Most are written to be safe to re-run (`IF NOT
EXISTS`, guarded `UPDATE`s), but that is a property of each file, not a
guarantee of the set — read one before re-running it.

`../supabase-schema.sql` holds the full current table definitions. It is the
destination, not the history: a fresh database is created from the schema file,
while these migrations bring an *existing* database up to it. When you add a
migration, update the schema file to match, or the two drift.

## Applied to the live (devnet) database

| # | What it does |
|---|---|
| 001 | Fix `sealed_deals` schema |
| 002 | Atomic deal increment RPC |
| 003 | Enable Realtime on `sealed_deals` |
| 004 | Add the `escalated` deal status |
| 005 | Notify on renegotiation escalation (`notify_on` keys) |
| 006 | Friends table + user profile/KYC columns |
| 007 | Allow seller-created (inviter) deals; add `funded_at` |
| 008 | `sealed_complaints` — report a deal or an account |
| 009 | Add the `manual-chat` deal status (fully-manual negotiation) |
| 010 | `sealed_refund_requests` — mutual-refund relay |
| 011 | Safety net: ensure every table in the schema file exists |
| 012 | Notify on friend requests (`notify_on` keys) |

## Why several of these exist

008, 010, and 011 all trace to the same failure: a table was added to
`supabase-schema.sql` but never applied to the live database, so the feature
500'd in production while the schema file claimed the table existed. 011 is the
backstop that re-asserts the whole set.

The lesson is in the note above — **editing the schema file does not change any
database.** Every schema change needs a migration here too.

## Notification migrations need care

005 and 012 add keys to `sealed_users.notify_on`. `queueNotification()` returns
early unless `notify_on[eventType]` is truthy, so shipping the code without the
migration silently drops those notifications for existing users — no error, no
log. Both migrations update the column `DEFAULT` (new users) *and* backfill
existing rows, adding the key only where absent so an explicit opt-out is
preserved.

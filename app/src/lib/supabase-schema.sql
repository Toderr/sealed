-- Sealed off-chain tables. Applied via the Supabase SQL editor.
-- Service-role key bypasses RLS, so no GRANT statements needed.
--
-- Convention: on-chain is source of truth for deal state and escrow balances.
-- Supabase holds off-chain context only: chat history, agent memory,
-- deliverable files, human-readable deal descriptions.

-- Deal rows mirror the on-chain Deal PDA by deal_id. Off-chain fields are
-- descriptive and auditable, never load-bearing for fund movement.
CREATE TABLE IF NOT EXISTS sealed_deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id TEXT NOT NULL UNIQUE,                   -- matches on-chain PDA seed
    buyer_wallet TEXT NOT NULL,
    seller_wallet TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    total_amount_usdc NUMERIC(20, 6) NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'proposed', 'funded', 'in_progress', 'completed', 'refunded', 'disputed')),
    milestones JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sealed_deals_buyer_idx ON sealed_deals (buyer_wallet);
CREATE INDEX IF NOT EXISTS sealed_deals_seller_idx ON sealed_deals (seller_wallet);
CREATE INDEX IF NOT EXISTS sealed_deals_status_idx ON sealed_deals (status);

-- AI agent chat turns for a deal negotiation. Replay-safe ordered log.
CREATE TABLE IF NOT EXISTS sealed_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL,
    wallet TEXT,                                     -- caller wallet if user role
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sealed_messages_deal_idx ON sealed_messages (deal_id, created_at);

-- Long-term agent memory across deals, keyed by wallet.
CREATE TABLE IF NOT EXISTS sealed_agent_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet TEXT NOT NULL,
    memory_type TEXT NOT NULL CHECK (memory_type IN ('preference', 'history', 'reputation', 'context')),
    content TEXT NOT NULL,
    source_deal_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sealed_agent_memory_wallet_idx ON sealed_agent_memory (wallet, memory_type);

-- Deliverable file metadata. Actual bytes live in Supabase Storage.
CREATE TABLE IF NOT EXISTS sealed_deliverables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id TEXT NOT NULL,
    milestone_index INT NOT NULL,
    submitter_wallet TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    filename TEXT NOT NULL,
    content_type TEXT,
    size_bytes BIGINT,
    scan_status TEXT DEFAULT 'clean' CHECK (scan_status IN ('clean', 'rejected', 'pending')),
    verified_at TIMESTAMPTZ,
    verification_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sealed_deliverables_deal_idx ON sealed_deliverables (deal_id, milestone_index);

-- Touch trigger to keep sealed_deals.updated_at fresh on updates.
CREATE OR REPLACE FUNCTION sealed_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sealed_deals_touch ON sealed_deals;
CREATE TRIGGER sealed_deals_touch
BEFORE UPDATE ON sealed_deals
FOR EACH ROW EXECUTE FUNCTION sealed_touch_updated_at();

-- Users
CREATE TABLE IF NOT EXISTS sealed_users (
    wallet            TEXT PRIMARY KEY,
    handle            TEXT UNIQUE NOT NULL,
    email             TEXT,
    email_verified    BOOLEAN NOT NULL DEFAULT FALSE,
    email_otp         TEXT,
    telegram_chat_id  TEXT,
    telegram_username TEXT,
    notify_on         JSONB NOT NULL DEFAULT '{"deal_review_needed":true,"milestone_due":true,"deal_accepted":true,"deal_declined":true,"new_deal_invite":true}'::jsonb,
    kyc_status        TEXT NOT NULL DEFAULT 'none' CHECK (kyc_status IN ('none','pending','approved','rejected')),
    kyc_document_url  TEXT,
    kyc_submitted_at  TIMESTAMPTZ,
    verified_at       TIMESTAMPTZ,
    verified_payment_tx TEXT,
    member_since      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Agent Templates
CREATE TABLE IF NOT EXISTS sealed_agent_templates (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet                TEXT NOT NULL,
    name                  TEXT NOT NULL,
    deal_types            TEXT[] NOT NULL DEFAULT '{}',
    negotiation_style     TEXT NOT NULL DEFAULT 'flexible' CHECK (negotiation_style IN ('firm','flexible','collaborative')),
    price_floor_pct       NUMERIC(5,2) NOT NULL DEFAULT 80,
    auto_approve_if       TEXT[] NOT NULL DEFAULT '{}',
    escalate_after_rounds INT NOT NULL DEFAULT 3,
    agent_intro_message   TEXT NOT NULL DEFAULT '',
    active                BOOLEAN NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sealed_agent_templates_wallet_idx ON sealed_agent_templates (wallet);
CREATE UNIQUE INDEX IF NOT EXISTS sealed_agent_templates_active_idx ON sealed_agent_templates (wallet) WHERE active = TRUE;

-- Reputation
CREATE TABLE IF NOT EXISTS sealed_reputation (
    wallet           TEXT PRIMARY KEY,
    deals_total      INT NOT NULL DEFAULT 0,
    deals_successful INT NOT NULL DEFAULT 0,
    deals_failed     INT NOT NULL DEFAULT 0,
    avg_rating       NUMERIC(3,2) NOT NULL DEFAULT 0,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-deal ratings
CREATE TABLE IF NOT EXISTS sealed_ratings (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id      TEXT NOT NULL,
    rater_wallet TEXT NOT NULL,
    ratee_wallet TEXT NOT NULL,
    stars        SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
    review_text  TEXT NOT NULL DEFAULT '',
    revealed     BOOLEAN NOT NULL DEFAULT FALSE,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (deal_id, rater_wallet, ratee_wallet)
);

CREATE INDEX IF NOT EXISTS sealed_ratings_ratee_idx ON sealed_ratings (ratee_wallet);

-- Notification queue
CREATE TABLE IF NOT EXISTS sealed_notification_queue (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_wallet TEXT NOT NULL,
    channel          TEXT NOT NULL CHECK (channel IN ('email','telegram')),
    event_type       TEXT NOT NULL,
    payload          JSONB NOT NULL DEFAULT '{}',
    status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS sealed_notif_queue_status_idx ON sealed_notification_queue (status, created_at);

-- Friend connections between wallets
CREATE TABLE IF NOT EXISTS sealed_friends (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet       TEXT NOT NULL,           -- who sent the request
    friend_wallet TEXT NOT NULL,          -- who received it
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (wallet, friend_wallet)
);
CREATE INDEX IF NOT EXISTS sealed_friends_wallet_idx ON sealed_friends (wallet);
CREATE INDEX IF NOT EXISTS sealed_friends_friend_wallet_idx ON sealed_friends (friend_wallet);

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS leads (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone               VARCHAR(15) UNIQUE NOT NULL,
    name                TEXT,
    source              TEXT,
    campaign            TEXT,
    adset               TEXT,
    ad                  TEXT,
    source_raw          JSONB,
    score               INTEGER DEFAULT 0,
    escalated           BOOLEAN DEFAULT FALSE,
    size_preference     TEXT,
    facing              TEXT,
    preferred_locations TEXT[],
    budget_min          NUMERIC,
    budget_max          NUMERIC,
    budget_estimate     NUMERIC,
    last_message_at     TIMESTAMPTZ DEFAULT NOW(),
    message_count       INTEGER DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id      UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    role         TEXT NOT NULL,
    message_text TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_lead_created ON messages(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);

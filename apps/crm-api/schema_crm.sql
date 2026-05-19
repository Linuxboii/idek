-- schema_crm.sql
-- Run AFTER schema.sql and schema_templates.sql

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'clerk' CHECK (role IN ('admin', 'clerk')),
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS ai_paused_until  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ai_paused_by     UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS assigned_to      UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS unread_count     INT NOT NULL DEFAULT 0;

ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS sent_by    UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS media_type TEXT,
    ADD COLUMN IF NOT EXISTS media_id   TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_ai_paused    ON leads(ai_paused_until) WHERE ai_paused_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_lead_time ON messages(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to  ON leads(assigned_to) WHERE assigned_to IS NOT NULL;

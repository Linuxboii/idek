CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS template_jobs (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    template_name  text NOT NULL,
    language_code  text NOT NULL,
    body_params    jsonb,
    total          integer NOT NULL DEFAULT 0,
    created_at     timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS template_sends (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id         uuid REFERENCES template_jobs(id) ON DELETE CASCADE,
    to_phone       text NOT NULL,
    wamid          text UNIQUE,
    status         text NOT NULL DEFAULT 'queued',   -- queued|accepted|sent|delivered|read|failed
    error_code     integer,
    error_title    text,
    error_message  text,
    sent_at        timestamptz,
    delivered_at   timestamptz,
    read_at        timestamptz,
    failed_at      timestamptz,
    created_at     timestamptz NOT NULL DEFAULT NOW(),
    updated_at     timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_sends_job ON template_sends(job_id);
CREATE INDEX IF NOT EXISTS idx_template_sends_wamid ON template_sends(wamid);

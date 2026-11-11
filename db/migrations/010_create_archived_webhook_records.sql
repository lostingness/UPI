-- 010_create_archived_webhook_records.sql — port of 2026_11_20_000001.
-- archived_webhook_logs preserves the source row's id (same 13 columns).
CREATE TABLE IF NOT EXISTS archived_webhook_logs (
  id BIGINT PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event VARCHAR(255) NOT NULL,
  event_id UUID NULL,
  url VARCHAR(500) NOT NULL,
  payload JSONB NOT NULL,
  response_code SMALLINT NULL,
  response_body TEXT NULL,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  attempt SMALLINT NOT NULL DEFAULT 1 CHECK (attempt >= 0),
  error_label VARCHAR(32) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS archived_webhook_payloads (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID NOT NULL UNIQUE,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

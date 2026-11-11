-- 004_create_webhook_logs.sql — port of 2026_09_25_000002 (base) +
-- 2026_11_06_000001 (error_label) + 2026_11_11_000001 (event_id).
-- response_body is kept for migration safety but is NEVER written by code.
CREATE TABLE IF NOT EXISTS webhook_logs (
  id BIGSERIAL PRIMARY KEY,
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
CREATE INDEX IF NOT EXISTS webhook_logs_order_event_success_idx ON webhook_logs (order_id, event, success);
CREATE INDEX IF NOT EXISTS webhook_logs_event_id_success_idx ON webhook_logs (event_id, success);

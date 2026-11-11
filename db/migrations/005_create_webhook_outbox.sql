-- 005_create_webhook_outbox.sql — port of 2026_11_11_000001 +
-- 2026_11_20_000001 (payload nullable after archive).
-- order_id is ON DELETE RESTRICT (deliberate, unlike webhook_logs).
-- Identity/snapshot fields (event_id, order_id, sequence, transition_key,
-- event, environment, payload) are immutable after insert — enforced in app code.
CREATE TABLE IF NOT EXISTS webhook_outbox (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID NOT NULL UNIQUE,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  transition_key VARCHAR(100) NOT NULL UNIQUE,
  event VARCHAR(64) NOT NULL,
  environment VARCHAR(16) NOT NULL,
  payload JSONB NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  available_at TIMESTAMPTZ NULL,
  claim_token UUID NULL,
  claimed_at TIMESTAMPTZ NULL,
  queued_at TIMESTAMPTZ NULL,
  delivered_at TIMESTAMPTZ NULL,
  dispatch_attempts INTEGER NOT NULL DEFAULT 0 CHECK (dispatch_attempts >= 0),
  delivery_attempts INTEGER NOT NULL DEFAULT 0 CHECK (delivery_attempts >= 0),
  last_error VARCHAR(64) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT webhook_outbox_order_sequence_unique UNIQUE (order_id, sequence)
);
CREATE INDEX IF NOT EXISTS outbox_dispatch_due ON webhook_outbox (available_at, id);

-- 003_create_orders.sql — port of 2026_09_25_000002 (base) +
-- 2026_09_25_000004 (customer_utr, utr_submitted_at, utr_attempts, review_note) +
-- 2026_09_25_000005 (provider_checkout) + 2026_11_09_000001 (environment,
-- sandbox_simulated_at, payment_account_id nullable, unique
-- (user_id, environment, client_order_id)) + 2026_11_09_000003 (expires_at
-- nullable) + 2026_11_13/14/15 (verification_* lease columns) +
-- 2026_11_16 (original_expires_at) + 2026_11_11 (webhook_event_sequence).
-- The verification lease on Vercel is token+generation+expiry only:
-- verification_pid / verification_node_id / verification_process_identity are
-- kept for schema compatibility but are NOT used for liveness (no PID/process
-- inspection exists on serverless — see lib/orders/check.ts).
CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  order_no VARCHAR(32) NOT NULL UNIQUE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_account_id BIGINT NULL REFERENCES payment_accounts(id) ON DELETE CASCADE,
  client_order_id VARCHAR(64) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  status VARCHAR(255) NOT NULL DEFAULT 'pending',
  environment VARCHAR(16) NOT NULL DEFAULT 'live',
  customer_name VARCHAR(255) NULL,
  customer_email VARCHAR(255) NULL,
  customer_mobile VARCHAR(20) NULL,
  note VARCHAR(255) NULL,
  redirect_url VARCHAR(500) NULL,
  utr VARCHAR(255) NULL,
  customer_utr VARCHAR(40) NULL,
  utr_submitted_at TIMESTAMPTZ NULL,
  utr_attempts SMALLINT NOT NULL DEFAULT 0 CHECK (utr_attempts >= 0),
  review_note TEXT NULL,
  provider_txn_id VARCHAR(255) NULL,
  provider_response JSONB NULL,
  provider_checkout JSONB NULL,
  verified_by VARCHAR(255) NULL,
  paid_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NULL,
  original_expires_at TIMESTAMPTZ NULL,
  last_checked_at TIMESTAMPTZ NULL,
  sandbox_simulated_at TIMESTAMPTZ NULL,
  webhook_event_sequence INTEGER NOT NULL DEFAULT 0 CHECK (webhook_event_sequence >= 0),
  verification_token VARCHAR(64) NULL,
  verification_generation BIGINT NOT NULL DEFAULT 0 CHECK (verification_generation >= 0),
  verification_expires_at TIMESTAMPTZ NULL,
  verification_pid BIGINT NULL,
  verification_started_at TIMESTAMPTZ NULL,
  verification_node_id VARCHAR(128) NULL,
  verification_node_instance_id VARCHAR(64) NULL,
  verification_process_identity VARCHAR(128) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT orders_user_environment_client_unique UNIQUE (user_id, environment, client_order_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS orders_user_id_utr_unique ON orders (user_id, utr) WHERE utr IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_status_expires_at_idx ON orders (status, expires_at);
CREATE INDEX IF NOT EXISTS orders_user_id_status_created_at_idx ON orders (user_id, status, created_at);
CREATE INDEX IF NOT EXISTS orders_payment_account_id_status_paid_at_idx ON orders (payment_account_id, status, paid_at);
CREATE INDEX IF NOT EXISTS orders_user_id_paid_at_idx ON orders (user_id, paid_at);
CREATE INDEX IF NOT EXISTS orders_user_id_customer_utr_idx ON orders (user_id, customer_utr);
CREATE INDEX IF NOT EXISTS orders_user_id_environment_status_created_at_idx ON orders (user_id, environment, status, created_at);

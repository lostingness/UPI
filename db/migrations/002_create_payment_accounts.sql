-- 002_create_payment_accounts.sql — port of 2026_09_25_000001 +
-- 2026_09_25_000003 (daily_limit) + 2026_09_25_000005 (upi_id nullable).
-- credentials: TEXT holding encrypted JSON (AES-256-GCM, lib/crypto.ts).
CREATE TABLE IF NOT EXISTS payment_accounts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(255) NOT NULL,
  label VARCHAR(255) NOT NULL,
  upi_id VARCHAR(255) NULL,
  payee_name VARCHAR(255) NOT NULL DEFAULT '',
  credentials TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  daily_limit NUMERIC(12,2) NULL DEFAULT 100000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS payment_accounts_user_id_idx ON payment_accounts (user_id);

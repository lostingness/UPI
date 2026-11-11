-- 001_create_users.sql — port of Laravel 0001_01_01_000000 + 2026_09_25_000003
-- (rotation_mode) + 2026_11_06_000002 (redirect_domains, api_last_used_*) +
-- 2026_11_09_000001 (sandbox_api_key/secret/webhook_url) + 2026_11_17_000001
-- (webhook_secret, sandbox_webhook_secret). MySQL→Postgres: id BIGSERIAL,
-- decimal→NUMERIC, json→JSONB, timestamp→TIMESTAMPTZ, text→TEXT.
-- Secrets are TEXT holding AES-256-GCM ciphertext (lib/crypto.ts), NOT Laravel Crypt.
-- Email lookups must use LOWER(email): MySQL utf8mb4_unicode_ci was
-- case-insensitive, Postgres is not.
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  email_verified_at TIMESTAMPTZ NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(255) NOT NULL DEFAULT 'merchant',
  business_name VARCHAR(255) NULL,
  phone VARCHAR(20) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  api_key VARCHAR(255) NULL UNIQUE,
  api_secret TEXT NULL,
  webhook_url VARCHAR(500) NULL,
  sandbox_api_key VARCHAR(255) NULL UNIQUE,
  sandbox_api_secret TEXT NULL,
  sandbox_webhook_url VARCHAR(500) NULL,
  webhook_secret TEXT NULL,
  sandbox_webhook_secret TEXT NULL,
  redirect_domains JSONB NULL,
  rotation_mode VARCHAR(255) NOT NULL DEFAULT 'random',
  api_last_used_at TIMESTAMPTZ NULL,
  api_last_used_ip VARCHAR(45) NULL,
  remember_token VARCHAR(100) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email));

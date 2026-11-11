-- 012_create_support_tables.sql — NEW tables for the serverless port
-- (no Laravel equivalent as tables; see INVENTORY §5.3).
-- upi_rate_limits: durable fixed-window counters for API-key / per-IP /
-- failed-auth rate limits (in-memory buckets are per-instance only on Vercel).
-- upi_idempotency_keys: idempotency-key storage for POST /api/v1/orders.
-- upi_login_attempts: login lockout counters (per email+IP, 5/min then 10
-- failures/15 min → 15-min lock, mirroring AuthController).
-- upi_cache: generic key/value cache with expiry (PhonePe token cache fallback,
-- scheduler locks) — used only if the in-memory cache is insufficient.
CREATE TABLE IF NOT EXISTS upi_rate_limits (
  bucket_key VARCHAR(255) PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 1 CHECK (count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS upi_idempotency_keys (
  key VARCHAR(255) PRIMARY KEY,
  payload_hash VARCHAR(64) NOT NULL,
  response_status INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS upi_login_attempts (
  lock_key VARCHAR(255) PRIMARY KEY,
  fails INTEGER NOT NULL DEFAULT 0 CHECK (fails >= 0),
  locked_until TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS upi_cache (
  key VARCHAR(255) PRIMARY KEY,
  value TEXT NOT NULL,
  expiration INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS upi_cache_expiration_idx ON upi_cache (expiration);
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 009_create_installation_guards.sql — port of 2026_11_09_000002.
-- `primary_admin` row records the first admin's id. "Installed" detection on
-- Neon = this row exists AND an admin user exists (see lib/install.ts).
CREATE TABLE IF NOT EXISTS installation_guards (
  name VARCHAR(64) PRIMARY KEY,
  user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NULL DEFAULT NOW()
);

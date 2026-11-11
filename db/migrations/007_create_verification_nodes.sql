-- 007_create_verification_nodes.sql — port of 2026_11_15_000001.
-- Kept for schema compatibility. On Vercel there is no stable node/boot id,
-- so rows are not actively maintained by the lease code (see lib/orders/check.ts).
CREATE TABLE IF NOT EXISTS verification_nodes (
  node_id VARCHAR(128) PRIMARY KEY,
  installation_id VARCHAR(128) NOT NULL,
  boot_id VARCHAR(128) NOT NULL,
  instance_id VARCHAR(64) NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

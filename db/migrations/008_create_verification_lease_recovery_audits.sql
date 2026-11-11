-- 008_create_verification_lease_recovery_audits.sql — port of 2026_11_15_000001.
-- Append-only (app code never updates/deletes). execution_token_hash is a
-- sha256 of the operator token — never the token itself.
CREATE TABLE IF NOT EXISTS verification_lease_recovery_audits (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL,
  order_no VARCHAR(32) NOT NULL,
  previous_generation BIGINT NOT NULL,
  previous_node_id VARCHAR(128) NULL,
  previous_node_instance_id VARCHAR(64) NULL,
  previous_pid BIGINT NULL,
  previous_process_identity VARCHAR(128) NULL,
  execution_token_hash VARCHAR(64) NOT NULL,
  operator_identity VARCHAR(190) NOT NULL,
  reason TEXT NOT NULL,
  outcome VARCHAR(32) NOT NULL,
  recovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS vlra_order_id_idx ON verification_lease_recovery_audits (order_id);

-- 006_create_admin_audit_logs.sql — port of 2026_11_06_000002 +
-- 2026_11_10_000001 (admin_id nullOnDelete) + 2026_11_12_000001 (actor_admin_id).
-- Append-only: app code never updates/deletes rows. actor_admin_id snapshots
-- admin_id at creation so history survives admin deletion. No updated_at.
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  admin_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  actor_admin_id BIGINT NULL,
  action VARCHAR(64) NOT NULL,
  subject_type VARCHAR(64) NULL,
  subject_id BIGINT NULL,
  meta JSONB NULL,
  ip VARCHAR(45) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_audit_logs_admin_created_idx ON admin_audit_logs (admin_id, created_at);
CREATE INDEX IF NOT EXISTS admin_audit_logs_subject_idx ON admin_audit_logs (subject_type, subject_id);

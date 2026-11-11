-- 014_audit_fixes.sql — audit follow-ups from the round-2 integration pass.
-- All statements are idempotent (IF NOT EXISTS guards), so re-running the
-- file or applying it on a database that already self-healed via lazy
-- code-side DDL is safe.
--
-- 1. Missing indexes (audit): the pending-order check scans
--    (status, last_checked_at); late-payment recovery reads
--    original_expires_at; webhook pruning scans webhook_logs.created_at;
--    outbox dispatch scans (status, available_at).
-- 2. Idempotency-key expiry (audit): upi_idempotency_keys.expires_at —
--    claim rows live 24 h; the prune cron deletes expired rows
--    (lib/idempotency.ts pruneIdempotencyKeys, wired into
--    runWebhooksPrune). The same column is lazy-ensured in code, like the
--    allocations table, so a deployed instance self-heals if `npm run
--    migrate` has not been run yet.

CREATE INDEX IF NOT EXISTS orders_status_last_checked_at_idx
  ON orders (status, last_checked_at);
CREATE INDEX IF NOT EXISTS orders_original_expires_at_idx
  ON orders (original_expires_at);
CREATE INDEX IF NOT EXISTS webhook_logs_created_at_idx
  ON webhook_logs (created_at);
CREATE INDEX IF NOT EXISTS webhook_outbox_status_available_at_idx
  ON webhook_outbox (status, available_at);

ALTER TABLE upi_idempotency_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS upi_idempotency_keys_expires_at_idx
  ON upi_idempotency_keys (expires_at);

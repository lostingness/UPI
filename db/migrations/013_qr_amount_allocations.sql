-- 013_qr_amount_allocations.sql — two QR generation methods (Unique Amount QR
-- + Same Amount QR). Canonical migration for fresh installs; the allocation
-- code (lib/orders/allocations.ts) also lazily creates this table on first
-- use, so a deployed instance self-heals if `npm run migrate` has not been
-- run yet. All statements are idempotent.
--
-- upi_amount_allocations: one row per Unique-Amount allocation. An allocation
-- is the ONLY mapping signal for manual (P2P) payments, whose UPI intent
-- omits `tr` (NPCI guidance) — see the Limitations note in db/README.md.
-- `orders.payable_amount` is the amount the customer must actually pay:
-- equals `amount` for Same-Amount QR, equals the unique allocated amount
-- for Unique-Amount QR. `users.qr_method` / `users.qr_increment_paise` are
-- the per-merchant QR settings (same users-table-columns pattern as
-- `rotation_mode`).

CREATE TABLE IF NOT EXISTS upi_amount_allocations (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_account_id BIGINT NULL REFERENCES payment_accounts(id) ON DELETE SET NULL,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_no VARCHAR(32) NOT NULL,
  base_amount NUMERIC(12,2) NOT NULL,
  payable_amount NUMERIC(12,2) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'consumed')),
  allocated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
-- No two ACTIVE allocations may share (user, payment account, payable amount).
-- payment_account_id can be NULL, so the NULL is normalised to -1 in the
-- index expression (a plain unique index would treat NULLs as distinct).
CREATE UNIQUE INDEX IF NOT EXISTS upi_amount_allocations_user_active_unique
  ON upi_amount_allocations (user_id, COALESCE(payment_account_id, -1), payable_amount)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS upi_amount_allocations_order_id_idx
  ON upi_amount_allocations (order_id);
CREATE INDEX IF NOT EXISTS upi_amount_allocations_user_status_expires_idx
  ON upi_amount_allocations (user_id, status, expires_at);

-- The amount the customer must actually pay (NULL on pre-013 orders, where
-- the code falls back to `amount`).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payable_amount NUMERIC(12,2) NULL;
-- Pre-existing orders keep their behaviour: payable = amount.
UPDATE orders SET payable_amount = amount WHERE payable_amount IS NULL;

-- Per-merchant QR settings (users-table columns, like rotation_mode).
ALTER TABLE users ADD COLUMN IF NOT EXISTS qr_method VARCHAR(16) NOT NULL DEFAULT 'same';
ALTER TABLE users ADD COLUMN IF NOT EXISTS qr_increment_paise SMALLINT NOT NULL DEFAULT 1 CHECK (qr_increment_paise BETWEEN 1 AND 99);

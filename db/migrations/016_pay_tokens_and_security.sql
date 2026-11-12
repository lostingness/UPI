-- 016_pay_tokens_and_security.sql — Round 7 security (Phase 1 findings).
-- Canonical migration for fresh installs; the pay-token table and the
-- checkout_starts column are also lazily ensured on first use
-- (lib/pay-token.ts), so a deployed instance self-heals if `npm run migrate`
-- has not been run yet (same pattern as migration 013).
--
-- 1. upi_pay_tokens — payer-binding tokens (H1/H2/M1). Only the SHA-256 hash
--    of a token is stored; the raw value is never persisted. See
--    lib/pay-token.ts for the issue / verify / consume design.
-- 2. users single-admin partial unique index (L5): at most one row with
--    role='admin' can exist, so two concurrent POST /api/setup calls cannot
--    create two admins (the loser gets a 23505 → 409). NOTE: if a deployed
--    DB already holds two admin rows this statement fails — delete the extra
--    admin row first, then re-run the migration.
-- 3. orders (user_id, customer_utr) partial unique index (G4): the DB
--    backstop for the duplicate-UTR check-then-act race in submit / approve
--    / admin-override. Only non-NULL customer_utr values are indexed.
--    NOTE: fails if duplicate (user_id, customer_utr) rows already exist —
--    clear the stale customer_utr values first, then re-run.
-- 4. orders.checkout_starts (M1): fresh hosted checkouts started per order
--    (budget 3); cached-checkout reuse does not count.

CREATE TABLE IF NOT EXISTS upi_pay_tokens (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  purpose VARCHAR(16) NOT NULL CHECK (purpose IN ('utr', 'start')),
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, purpose, token_hash)
);
CREATE INDEX IF NOT EXISTS upi_pay_tokens_order_idx ON upi_pay_tokens (order_id, purpose);
CREATE INDEX IF NOT EXISTS upi_pay_tokens_expiry_idx ON upi_pay_tokens (expires_at) WHERE used_at IS NULL;

-- L5: exactly one admin, enforced by the database (not just the app check).
CREATE UNIQUE INDEX IF NOT EXISTS users_single_admin_idx ON users (role) WHERE role = 'admin';

-- G4: duplicate customer_utr per merchant is impossible at the DB level.
CREATE UNIQUE INDEX IF NOT EXISTS orders_user_customer_utr_unique
  ON orders (user_id, customer_utr) WHERE customer_utr IS NOT NULL;

-- M1: per-order hosted-checkout start budget.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_starts INT NOT NULL DEFAULT 0;

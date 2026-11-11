-- 015_create_notifications.sql — merchant notification centre (Round 5).
-- Canonical migration for fresh installs; the notification code
-- (lib/notifications.ts) also lazily creates these tables on first use, so a
-- deployed instance self-heals if `npm run migrate` has not been run yet
-- (same pattern as migration 013 / lib/orders/allocations.ts).
-- All statements are idempotent (IF NOT EXISTS guards).
--
-- upi_notifications: one row per merchant-facing event. Notifications
-- OBSERVE status changes — they never cause them. A notification is created
-- best-effort (a failure never blocks the order transition that triggered
-- it) and is deduped by `dedupe_key` (ON CONFLICT DO NOTHING), so a
-- retried transition, an idempotency replay, or a double hook can never
-- produce a duplicate row for the same event.
--   types: payment_received (provider verification or UTR-review approval
--     marked the order paid), order_created, utr_submitted (customer
--     submitted a UTR for review — merchant action needed), order_expired.
--   No payer contact data is stored here beyond what the order already
--     holds; no SMS/email is ever sent from these rows.
--
-- upi_push_subscriptions: Web Push subscriptions for closed-tab delivery
-- (Round 5 ships the table only — see the note below). One row per
-- (merchant, browser endpoint); the endpoint is unique so re-subscribing
-- from the same browser upserts instead of duplicating.
--   WEB PUSH STATUS: NOT live. No VAPID keypair has been supplied and no
--   `web-push` sender is installed. To finish it: generate a pair
--   (`npx web-push generate-vapid-keys`), set Vercel env vars
--   NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT,
--   then add public/sw.js + a subscribe route + a send step on
--   payment_received. Do NOT commit keys — env vars only.

CREATE TABLE IF NOT EXISTS upi_notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id BIGINT NULL REFERENCES orders(id) ON DELETE SET NULL,
  order_no VARCHAR(32) NULL,
  type VARCHAR(32) NOT NULL CHECK (type IN ('payment_received', 'order_created', 'utr_submitted', 'order_expired')),
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  amount NUMERIC(12,2) NULL,
  dedupe_key VARCHAR(128) NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- One notification per event: replays / double hooks collapse to one row.
CREATE UNIQUE INDEX IF NOT EXISTS upi_notifications_dedupe_key_unique
  ON upi_notifications (dedupe_key) WHERE dedupe_key IS NOT NULL;
-- Bell list + unread badge: merchant's newest first, unread first.
CREATE INDEX IF NOT EXISTS upi_notifications_user_created_idx
  ON upi_notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS upi_notifications_user_unread_idx
  ON upi_notifications (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS upi_notifications_order_id_idx
  ON upi_notifications (order_id);

CREATE TABLE IF NOT EXISTS upi_push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS upi_push_subscriptions_endpoint_unique
  ON upi_push_subscriptions (endpoint);
CREATE INDEX IF NOT EXISTS upi_push_subscriptions_user_idx
  ON upi_push_subscriptions (user_id);

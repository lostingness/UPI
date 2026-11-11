# Database — Neon Postgres migrations

Plain SQL, numbered, in dependency order. Port of the 24 Laravel migrations
(18 tables) from INVENTORY.md §5, folded to final state, plus `012` support
tables that are new in the serverless port (rate limits, idempotency keys,
login lockout, generic cache, `schema_migrations` tracking).

## Tables created

| File | Tables |
|---|---|
| 001 | `users` |
| 002 | `payment_accounts` |
| 003 | `orders` (incl. all UTR + verification-lease columns) |
| 004 | `webhook_logs` |
| 005 | `webhook_outbox` |
| 006 | `admin_audit_logs` (append-only) |
| 007 | `verification_nodes` (kept for compat; not actively maintained on Vercel) |
| 008 | `verification_lease_recovery_audits` (append-only) |
| 009 | `installation_guards` (`primary_admin` row = "installed" marker) |
| 010 | `archived_webhook_logs`, `archived_webhook_payloads` |
| 011 | performance indexes (guard / future additions) |
| 012 | `upi_rate_limits`, `upi_idempotency_keys`, `upi_login_attempts`, `upi_cache`, `schema_migrations` |
| 013 | `upi_amount_allocations` (unique-amount QR), `orders.payable_amount`, `users.qr_method` + `users.qr_increment_paise` |
| 014 | audit fixes: `orders (status, last_checked_at)` + `(original_expires_at)`, `webhook_logs (created_at)`, `webhook_outbox (status, available_at)` indexes; `upi_idempotency_keys.expires_at` (24 h claim/response expiry, pruned by the prune cron) |

NOT migrated as tables (INVENTORY §5.3): Laravel `cache`/`cache_locks`,
`jobs`/`job_batches`/`failed_jobs`, `sessions`, `password_reset_tokens`.
Sessions are stateless signed JWT cookies (lib/auth.ts); the queue is replaced
by Vercel Cron + direct delivery (lib/webhooks/); no password-reset flow exists
in the source and none is invented here.

## How to run

The `DATABASE_URL` (Neon pooled connection string) is supplied by the user as
a **sensitive Vercel env var** and transiently in a gitignored `.env.local`
for local steps. It must never be written into any file in this repo.

Option A — psql (recommended):

```bash
psql "$DATABASE_URL" -f db/migrations/001_create_users.sql
# ... repeat 002–012 in order, or:
for f in db/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```

Option B — Neon SQL editor: paste each file in order and run it.

Option C — migration script (records applied versions in `schema_migrations`):

```bash
npm run migrate        # reads DATABASE_URL from .env.local / environment
```

All files are idempotent (`CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF
NOT EXISTS`), so re-running them is safe. The script skips already-recorded
versions.

## Conventions

- Money: `NUMERIC(12,2)`; timestamps: `TIMESTAMPTZ` (UTC in DB, IST at display).
- Strings stay plain `VARCHAR` (no Postgres enums — statuses/providers are
  plain strings, as in the source).
- Email lookups must use `LOWER(email)` (MySQL collation was case-insensitive).
- `orders` unique index names are preserved: `orders_user_environment_client_unique`
  and `orders_user_id_utr_unique` (code checks these names in error strings).
- `webhook_outbox.order_id` is `ON DELETE RESTRICT` (deliberate);
  `admin_audit_logs.admin_id` is `ON DELETE SET NULL`.

## QR amounts — Limitations (read before relying on Unique Amount QR)

Two QR methods exist (migration 013, `lib/orders/allocations.ts`):
Same Amount QR (every QR shows the order amount) and Unique Amount QR
(each live order gets a distinct payable amount a few paise above the order
amount, e.g. Rs 500.00 → Rs 500.01, Rs 500.02). The honest limits:

- (a) The UPI intent `am` field supports 2-decimal paise precision, so
  Rs 500.01 IS encodable in the QR code and in the intent URL. The unique
  amount is a real amount the customer pays, not a display trick.
- (b) For MANUAL (P2P) accounts the intent omits `tr` (NPCI guidance —
  consumer UPI apps reject it), so there is no provider-side order
  reference. The unique amount is the ONLY mapping signal for manual
  payments, and auto-confirmation is impossible without a provider status
  API or a merchant UTR approval: the gateway cannot see a manual payment
  on its own. A unique amount lets the merchant match a bank-statement
  entry to an order by amount; it does not confirm the payment by itself.
- (c) A customer can edit the amount in their UPI app before paying. If
  the paid amount differs from `payable_amount`, verification MUST reject
  it (amount mismatch) and the order stays pending/review — the gateway
  never marks paid on a wrong amount, and never silently accepts the
  order amount when a different amount was paid.
- (d) The Paytm Business status API is unofficial. If it does not return
  an exact amount, verification cannot confirm by amount and stays
  pending; the order is then resolved only by merchant UTR approval or
  admin override. The same applies to any provider response that omits
  the amount.
- (e) Uniqueness is scoped per merchant + payment account, and only while
  an allocation is active. A released allocation (order paid, expired, or
  failed) frees its amount for reuse. Two merchants can legitimately
  receive the same payable amount — amounts are only ever matched within
  one merchant's account.
- (f) Unique amounts are capped at Rs 1.00 above the base amount (and 100
  allocation attempts by default). When every candidate in that window is
  taken, order creation fails with 409 and no order row is left behind —
  it never silently falls back to a duplicate amount.

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

# UPI Gateway — Next.js + Neon Postgres

Multi-merchant UPI payment gateway for Indian merchants. Next.js 16 +
TypeScript (App Router) port of the Laravel 12 original (`mynkdev-21/upi-gateway`,
MIT, commit `7189511`), running serverless on Vercel with **Neon Postgres**.
No Supabase anywhere. No Laravel/PHP.

Each merchant configures payment accounts — a personal UPI ID (manual UTR
review), Paytm for Business (unofficial status API), or an official hosted PG
(PhonePe PG v2, Paytm PG) — and creates payment orders via the dashboard or a
`X-Api-Key` / `X-Api-Secret` REST API (`POST /api/v1/orders`). **Payment is
never trusted from the customer/browser/UTR alone**: only an exact
amount + order-ID + currency + timestamp-bound provider response marks an
order `paid`, or a merchant UTR-review approval, or an audited admin override.
Money never pools in the gateway: payments go directly to the merchant's own
UPI/PG account.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in real values (never commit .env.local)
npm run migrate              # applies db/migrations/*.sql to Neon DATABASE_URL
npm run dev                  # http://localhost:3000
```

First run: `POST /api/setup` with `{name, email, password, password_confirmation}`
creates the first admin (409 once installed). Or run
`DATABASE_URL=... npx tsx scripts/create-admin.ts admin@example.com "Admin"`.

## Migrations

Plain SQL in `db/migrations/` (001–012), runnable with psql, the Neon SQL
editor, or `npm run migrate` (records versions in `schema_migrations`).
See `db/README.md` for the table map and the MySQL→Postgres conversions.
All files are idempotent.

## Environment variables

See `.env.example` (placeholders only). The user must supply:

| Key | Notes |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection string (project `red-fog-62634170`, branch `production`). Sensitive Vercel env var; never in the repo. |
| `SESSION_SECRET` | Session JWT signing secret. Generate fresh at deploy: `openssl rand -base64 48`. |
| `ENCRYPTION_KEY` | 32-byte key (base64/hex) for stored credentials/secrets (AES-256-GCM). `openssl rand -base64 32`. |
| `CRON_SECRET` | Protects `/api/cron/*`. `openssl rand -hex 32`. |
| `APP_URL` | Public URL of the deployment. |
| `ALLOW_REGISTRATION` | `false` (default). Set `true` only to open merchant signups. |

Optional / provider: `PAYTM_STATUS_URL`, `PAYTM_PG_SANDBOX_URL`,
`PAYTM_PG_PRODUCTION_URL`, `GATEWAY_ENABLE_PAYTM_BUSINESS`,
`GATEWAY_*` / `WEBHOOK_*` tuning keys (see `.env.example`).
**Paytm MID / merchant key and PhonePe client_id / client_secret /
client_version are per payment account** (entered in the dashboard, encrypted
in the DB) — not env vars. Leave the provider env placeholders empty until the
user supplies real credentials; with no credentials configured the verifiers
return "provider not configured" / pending — **no fake payments, ever**.

## Tests

```bash
npm test            # vitest run
```

All tests in `tests/` are **mocked** (pure crypto/validation, injected fetch,
in-memory idempotency store) — see each file's header. They cover:
PaytmChecksum (incl. a fixed-salt known vector), webhook HMAC signature
(valid/tampered/stale), SafeUrl SSRF rules, UTR-alone-does-not-mark-paid +
evidence bindings, order-creation idempotency, authz boundary, and the three
verifiers (paid only on all bindings). **Live tests against the real Neon
database are still owed** (verification phase): create order → sandbox
simulate success → webhook delivered + signed → order paid; provider verify
rejects wrong amount; UTR approve/reject; admin override; rate limits
(401/403/429); installer blocked after install; outbox retry after failure.

## Vercel deploy notes

- Set `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET` as
  **sensitive** env vars (Production + Preview as needed).
- No persistent storage: no filesystem, no queue worker, no long-lived
  connections. The Neon HTTP driver is used (`@neondatabase/serverless`).
- Crons (`vercel.json`): order checks + webhook dispatch daily, offload 03:00,
  prune 04:00. **Hobby plan allows at most one cron run per day**, so the
  shipped schedules are once-daily (01:00 checks, 02:00 dispatch) — the source
  ran these every minute. On Hobby, pending-order checks and webhook delivery
  run once a day; upgrade to Pro to restore every-minute schedules
  (`* * * * *`). Webhooks can also be dispatched on demand via
  `POST /api/webhooks/outbox/dispatch` (admin/cron) or the admin UI retry.
- Cron endpoints are guarded by `CRON_SECRET` (`Authorization: Bearer …`).

## API surface (backend phase)

- `GET /api/health` — `{status, database_configured}` (no secrets).
- `POST /api/setup` / `GET /api/setup` — first-run admin + DB check.
- `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/register`
  (flag-gated), `POST /api/auth/confirm-password`.
- `POST /api/v1/orders` (API-key auth, idempotency via `Idempotency-Key`,
  per-key 1000/min + per-IP 600/min), `GET /api/v1/orders/[orderNo]`,
  `GET /api/v1/accounts`. Alias: `POST /api/orders`. Both POST order routes
  also accept a session cookie instead of API keys (no key header present):
  the logged-in merchant creates a live order for themselves only, with
  the same `createOrder()` logic, idempotency and rate limits; a
  `payment_account_id` belonging to another merchant is 403.
- Session-authenticated merchant reads (merchant-scoped, never another
  merchant's data): `GET /api/orders` (list, `status`/`q`/`environment`/`page`,
  20/page + status counts), `GET /api/orders/[orderNo]` (full detail incl.
  webhook history), `GET /api/dashboard/stats` (`?environment=live|sandbox`,
  IST stats), `GET /api/settings` (current settings, no secrets). The
  dashboard pages fetch these routes server-side (cookie forwarded).
- `GET /api/orders/[orderNo]/status`, `POST /api/orders/[orderNo]/verify`
  (server-side re-check), `POST /api/orders/[orderNo]/recheck`,
  `.../approve-utr`, `.../reject-utr`, `.../mark-paid` (**disabled stub** —
  always returns the source's error message).
- `GET/POST /api/accounts` and `/api/payment-accounts` (merchant-scoped),
  `POST /api/accounts/[id]/{limit,toggle,default}`, `DELETE /api/accounts/[id]`.
- Settings: `POST /api/settings/{profile,webhook,sandbox/webhook,rotation,
  redirect-domains,regenerate-keys,sandbox/regenerate-keys,
  sandbox/revoke-keys,regenerate-webhook-secret,
  sandbox/regenerate-webhook-secret}`, `PUT /api/settings/password`.
- Checkout (public): `GET /api/pay/[orderNo]/status`,
  `POST /api/pay/[orderNo]/utr`, `POST /api/pay/[orderNo]/start`,
  `GET+POST /api/pay/[orderNo]/return` (ignores PG-posted data, re-checks),
  `GET /api/pay/[orderNo]/qr` (PNG, `private, max-age=600`).
  `GET /api/pay/[orderNo]/status` returns `redirect` only when the order is
  paid AND its `redirect_url` passes the merchant's allowlist (same check
  as the return route); otherwise `redirect` is null.
  Sandbox: `POST /api/sandbox/pay/[orderNo]/simulate`.
- Admin (session + role=admin + password confirmed within 900 s):
  `GET /api/admin/orders`, `GET /api/admin/orders/[orderNo]`,
  `POST /api/admin/orders/[orderNo]/manual-payment-override`,
  `GET /api/admin/merchants`, `POST /api/admin/merchants/[id]/toggle`,
  `GET /api/admin/accounts`, `GET /api/admin/webhooks`,
  `POST /api/admin/webhooks/[eventId]/retry`,
  `POST /api/admin/webhooks/[eventId]/restore-payload`,
  `GET /api/admin/audit-logs`, `GET /api/admin/transaction-debugger[/[orderNo]]`,
  `POST /api/admin/verification-lease/recover`.
- `POST /api/webhooks/outbox/dispatch` (admin/cron).
  `POST /api/webhooks/inbound/[provider]` — **410**: no inbound webhooks
  exist in the source; provider callbacks land on the pay return URL only.
- Crons: `GET /api/cron/{orders-check-pending,webhooks-dispatch,
  webhooks-offload,webhooks-prune}`.

Response envelope: `{success:true, data:…}`; errors `{message, errors?}`;
every API response carries `X-Request-Id`. Order shape is `toApiArray()`
(`order_id`, `client_order_id`, `amount` 2dp string, `currency:'INR'`,
`status`, `verified_by`, `environment`, `test`, `utr`, `payment_url`,
`upi_intent`, `customer:{…}`, `paid_at/expires_at/original_expires_at/
created_at` ISO-8601). Public URLs carry `order_no` (`ORD…` live, `TST…`
sandbox), never the numeric id.

Session cookie: `upi-gateway-session` (httpOnly, Secure in prod,
SameSite=lax, 120 min). It embeds a prefix of the password hash, so a
password change invalidates all sessions.

## Design decisions (open questions resolved)

- **Sessions (§5.3/§7):** stateless signed JWT (jose HS256) in an httpOnly
  cookie — no Neon `sessions` table.
- **Cache/locks (§5.3):** in-memory buckets (best-effort per instance) +
  durable Neon tables (`upi_rate_limits`, `upi_cache`, migration 012). No
  Upstash/Vercel KV required for a first deploy.
- **Transactions (§5.4 Q1):** the Neon HTTP driver does not hold a
  connection across awaits, so atomicity comes from single-statement
  conditional UPDATEs (status guard in `WHERE`, affected-row check) plus
  idempotent outbox INSERTs (unique `transition_key`,
  `ON CONFLICT DO NOTHING`) — not multi-statement `FOR UPDATE` transactions.
- **Verification lease (§8):** token+generation+expiry only. No PID/process
  identity exists on Vercel; `VerificationProcessInspector` (`ps`) is NOT
  MIGRATABLE. An expired lease may be taken by any invocation; operator
  recovery is an admin API route that audits to
  `verification_lease_recovery_audits`.
- **Webhook delivery (§10/§12):** no queue worker on Vercel — the dispatcher
  cron delivers directly inside the cron invocation, with the same
  claim/lease, generation fencing, retry backoff and reconciliation as the
  source. **Residual DNS-rebind risk:** PHP pinned the socket with
  `CURLOPT_RESOLVE`; `fetch` has no equivalent. This port re-validates the
  URL (fresh DNS, all answers public) immediately before sending — see
  `lib/webhooks/send.ts`.
- **Installed detection (§7):** `installation_guards.primary_admin` row +
  an admin user in Neon (no filesystem markers, no `.env` writes on Vercel).
- **mark-paid route (§1):** kept as a disabled stub returning the source's
  exact error message.
- **Storage (§1/§15):** `/storage/{path}` has no backend on Vercel — not
  built; public assets go in `public/`, uploads would need Vercel Blob
  (frontend phase / parent decision).
- **Password reset (§5.3/§7):** does not exist in the source; none invented.

## What the frontend phase should know

- Backend owns: `package.json`, `tsconfig.json`, `next.config.*`,
  `.env.example`, `vercel.json`, `lib/`, `db/`, `app/api/`,
  `middleware.ts`, `tests/`. Frontend owns: `app/(pages)/`,
  `components/`, `app/globals.css`, `public/`. Only the minimal root layout
  + health/status page exist so far (`app/layout.tsx`, `app/page.tsx`,
  `app/globals.css` — Tailwind v4 import only).
- Session cookie name: `upi-gateway-session`. Middleware protects
  `/dashboard/*`, `/admin/*`, `/orders/*`, `/accounts/*`, `/settings/*`
  (redirect to `/login?next=…`); admin pages additionally need role=admin.
- API response shapes: see "API surface" above; `toApiArray()` in
  `lib/orders/serialize.ts` is canonical for orders and webhook payloads.
- Webhook payload envelope: `{event_id, event_sequence, occurred_at,
  event, data: toApiArray()}`; signature header `t=…,v1=…` (HMAC-SHA256,
  5-min tolerance; migration deadline 31 Mar 2027 per source docs).
- Checkout polling: `GET /api/pay/[orderNo]/status` every 4 s
  (pending/review) or 30 s (expired/recovering); QR from
  `GET /api/pay/[orderNo]/qr`.

## License

MIT — Copyright (c) 2026 Mayank Singh; Copyright (c) 2026 Mohsin Khan.
See `LICENSE`.

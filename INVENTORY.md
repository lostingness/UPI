# UPI Gateway — Laravel → Next.js / Vercel Migration: Feature Inventory

> **Source:** `~/workspace/upi-gateway-copy/` — cleaned copy of `mynkdev-21/upi-gateway`
> (Laravel 12 / PHP 8.2+ / MySQL, MIT, upstream commit `7189511`), 313 files.
> Cross-checked against uncleaned original at `/tmp/upi-gateway` (see §17).
> **Target:** Next.js 16 + TypeScript (App Router) + **Neon Postgres**, serverless on
> Vercel. Data layer: **Neon Postgres via `@neondatabase/serverless`** (HTTP driver,
> serverless-safe), `DATABASE_URL` from env only (never in the repo, never recorded,
> never invented). Ship plain SQL migrations in **`/db/migrations/`** porting every
> MySQL table (see §5).
>
> ### Database decision — FINAL (2026-11-11 ~12:04 IST, "Ya neon hi krdo")
> - **Neon Postgres is the database. Supabase is NOT used for this app.** Do not
>   touch the AdiMusic Supabase project or `together_rooms` or any AdiMusic/Mochy
>   table. Do not write any Supabase key/URL anywhere in this repo or inventory
>   (an earlier 12:03 IST Supabase direction was superseded and has been reverted;
>   the only Supabase mentions in this file are this "do not use" notice).
> - **The Neon `DATABASE_URL` (pooled) has been SUPPLIED by the user (2026-11-11
>   ~12:09 IST). Its value is NOT recorded in this inventory, in any file, in
>   MEMORY, or in any report — it is a credential, used transiently only (a
>   gitignored `.env.local` if a step must read it). Do NOT invent, reconstruct,
>   or repeat it.** Known non-secret identifiers for the target: pooled endpoint
>   `ep-lively-brook` in `us-east-2`; Neon org `red-pond-54540257`, project `red-fog-62634170`,
>   branch `production` (via the supplied `neon init` command for that org /
>   project / branch). There is no Neon connector/API key here, so the build
>   cannot create or re-provision the project — it uses the supplied database.
>   The build must still work (typecheck/build) with `DATABASE_URL` absent —
>   lazy-init the Neon client so `next build` does not fail without a DB.
> - **Final build scope (2026-11-11): migrations run against the REAL Neon
>   database (not a mock); API smoke tests run against the real DB; then a
>   GitHub push attempt to `lostingness/UPI`; then a Vercel deploy with
>   `DATABASE_URL` set as a sensitive env var. `SESSION_SECRET` is generated
>   fresh at deploy time. Paytm / PhonePe provider keys stay as empty
>   placeholders (env only, for the user to supply later) — no fake payments,
>   no invented credentials.**
> - Migrations are plain SQL files in `/db/migrations/` (numbered, e.g.
>   `001_create_users.sql`, `002_create_payment_accounts.sql`, …), runnable with
>   `psql "$DATABASE_URL" -f db/migrations/001_….sql` or the Neon SQL editor.
>   No ORM migration runner is assumed; if the backend builder adds one, record it.
> - `@neondatabase/serverless` is an HTTP driver: **no long-lived TCP connections,
>   no `pg` pooling, no `LISTEN/NOTIFY`, and transactions are via Neon's
>   `transaction()` helper, not `node-postgres` `BEGIN/COMMIT` over a held
>   connection — see OPEN QUESTION in §5.4.** Row locking (`SELECT … FOR UPDATE`)
>   and advisory locks must be re-checked against the HTTP driver's transaction
>   semantics before the builders rely on them — the Laravel code leans heavily on
>   both (see §8).
> - Laravel framework tables (`cache`, `cache_locks`, `jobs`, `job_batches`,
>   `failed_jobs`, `sessions`, `password_reset_tokens`) have **no Neon equivalent
>   as tables** — see §5.3 for what replaces each (Vercel KV/Upstash, cron, etc.).
> - There is no RLS / PostgREST layer (Neon is plain Postgres); access control is
>   enforced in the Next.js server code only — never expose `DATABASE_URL` to the
>   browser, never query Neon from client components.

## Summary

UPI Gateway is a **self-hosted, multi-merchant UPI payment gateway for Indian merchants**.
Each merchant (role `merchant`, plus one or more `admin`s) configures their own payment
accounts — a personal UPI ID (manual verification), Paytm for Business (unofficial status
API), or an official hosted PG (PhonePe PG v2, Paytm PG) — and creates payment orders
via a dashboard form or a `X-Api-Key`/`X-Api-Secret` REST API (`POST /api/v1/orders`).
The customer pays on a hosted checkout page (`/pay/{order_no}`) that shows a dynamic
UPI QR code (BaconQrCode SVG) and a UPI intent deep-link (`upi://pay?pa=…&am=…&tr=…`),
or is redirected to the PG's own checkout. Payment is **never** trusted from the
customer/browser/UTR alone: a provider status API is polled (checkout page every 4 s,
API `GET /api/v1/orders/{id}`, and a 1-minute scheduler), and only an exact
amount + order-ID + currency + timestamp-bound provider response marks an order `paid`
(`OrderService::markPaid`, `lib/orders/mark-paid.ts` equivalent — see §8). Manual UPI
accounts use a customer-submitted 12-digit UTR → merchant review flow (max 3 attempts).
Sandbox is a fully separate environment (`test_key_`/`test_sec_` credentials, `TST…`
order numbers, simulated outcomes, separate webhook URL/secret). Every paid/expired/
review/failed transition is recorded **transactionally** in a webhook outbox
(`webhook_outbox`, exactly-once-ish, sequenced, claim/lease, 6-attempt queue job with
backoff) and delivered as an HMAC-SHA256 timestamped webhook (`t=…,v1=…`, 5-min
tolerance, SSRF-hardened via `SafeUrl` + `CURLOPT_RESOLVE` pinning). A first-run
browser installer (`/install`, plus standalone native `install.php` for cPanel where
Laravel cannot boot) writes `.env`, runs migrations and creates the first admin, then
locks itself. Admins manage merchants, view all orders, run a transaction debugger,
and can do an audited manual-payment override. Money never pools in the gateway:
payments go directly to the merchant's own UPI/PG account.

**Stack (source):** Laravel 12, PHP ≥8.2, MySQL 8 (utf8mb4), Blade + Tailwind v4 + Vite,
`bacon/bacon-qr-code ^3.1`, DB queue + DB cache/sessions, PHPUnit 11 (SQLite in-memory
for tests). No mail sending in practice (`MAIL_MAILER=log`), no email verification flow
wired, no password-reset routes (table exists, unused — see §7).

### Total counts (verified by file listing / grep)

| Area | Count |
|---|---|
| Files in cleaned copy | 313 |
| Web routes (`routes/web.php`, `Route::` occurrences incl. groups) | 71 occurrences → **~66 distinct endpoints** (see §1) |
| API routes (`routes/api.php`) | 3 endpoints (`GET /api/v1/accounts`, `GET /api/v1/orders/{orderNo}`, `POST /api/v1/orders`) + `GET /up` health (from `bootstrap/app.php`) |
| Console/scheduled | 5 Artisan commands defined in `routes/console.php` + 4 scheduled jobs; 4 standalone `app/Console/Commands/*` classes |
| Blade views | **41** `.blade.php` files (incl. 7 components, 4 layouts, 8 installer views) |
| Controllers | **16 files** (12 top-level + 2 Admin + 2 Api), ~70 public methods |
| Models | **8** (`User`, `Order`, `PaymentAccount`, `WebhookLog`, `WebhookOutbox`, `AdminAuditLog`, `VerificationNode`, `VerificationLeaseRecoveryAudit`) |
| Migrations | **24 files** → **18 tables** (incl. Laravel `cache`, `jobs`, `sessions`, `password_reset_tokens`) |
| Seeders / factories | 1 seeder (`DatabaseSeeder`, 1 test user), 1 factory (`UserFactory`) |
| Middleware | 8 custom + Laravel `AuthenticateSession`, CSRF, throttle |
| Services | 9 in `app/Services/` (+ 7 verifiers) |
| Support classes | 9 in `app/Support/` |
| Jobs | 1 (`SendWebhook`, `$tries=6`) |
| Config files | 14 in `config/` |
| Env keys in `.env.example` | ~70 (see §14) |
| Tests | **46 Feature files, 15,360 lines, ~490 `test*` methods** + 4 Hosting scripts (Playwright/nginx/MySQL) |
| Docs | 5 guides in `docs/` (1,009 lines total incl. `SECURITY.md`), `README.md` (~660 lines), 27 icons, 6 installer screenshots, 9 product screenshots |

---

## 1. Routes

Global: `bootstrap/app.php` — web group prepends `RedirectToInstall`, appends
`AuthenticateSession` + `SecurityHeaders`; api group prepends `RedirectToInstall`;
CSRF exempt: `pay/*/return`, `install.php`, `*/install.php`; JSON errors when
`api/*` or `expectsJson`; health `GET /up` (Laravel default). Global prepend:
`SetDeploymentBasePath` (subdirectory installs — 404s outside `APP_URL` path prefix);
`TrustProxies` replaced by `TrustConfiguredProxies`. `redirectUsersTo` → `dashboard`.
All `{order}` route-model bindings use `Order::getRouteKeyName()` = `order_no`
(not numeric id) — **preserve this in Next.js: public URLs carry `order_no`.**

### 1.1 `routes/web.php` (197 lines)

| Method | Path | Middleware / gate | Handler | Purpose | New architecture |
|---|---|---|---|---|---|
| GET | `/__upi_deployment_check` | web | closure | Diagnostic JSON: `application, routing, runtime=laravel, base_path, cookie_path, csrf_token, probe, diagnostic_token, secure, php_fpm, php_handler, login_url, dashboard_url, installed`; stores random `deployment.probe`/`diagnostic` in session. No-store. | `app/api/_health/route.ts` (GET) — return equivalent JSON minus PHP fields; keep probe/CSRF round-trip semantics or mark OPEN QUESTION |
| POST | `/__upi_deployment_check` | web | closure | If `diagnostic_report=true` + installed → 403; else validates `diagnostic_token` vs session (hash_equals) and logs `Installer browser readiness check failed` (stage ≤40 chars `[a-z_]`, message ≤500, control chars stripped). Else validates `probe` vs session → `{session:true, csrf:true}`. | Same route, POST — log to Vercel logs; OPEN QUESTION: keep at all on Vercel? (cPanel diagnostic only) |
| ANY | `/install.php` | — (bypasses Laravel middleware; native file) | closure requiring `install.php` | Compatibility shim so `/install.php` works when routed through Laravel; forwards `Location/Content-Type/Cache-Control` headers, `$GLOBALS['__installer_location']`. | NOT MIGRATABLE — no PHP on Vercel. Replace with `app/install/page.tsx` wizard (see §7) |
| GET | `/install` | `RedirectIfInstalled` | `InstallController@index` | Requirements overview page | `app/install/page.tsx` |
| POST | `/install/recheck` | `RedirectIfInstalled` | `InstallController@recheck` | Re-run requirements check, JSON `{ready, summary, groups, requirements}`; manual CSRF check vs session token | `app/api/install/recheck/route.ts` (POST) |
| GET/POST | `/install/database` | `RedirectIfInstalled` | `InstallController@database` / `databaseSave` | DB + app URL/name form; save writes `.env`, tests connection, consumes setup token | `app/install/database/page.tsx` + `app/api/install/database/route.ts` |
| GET/POST | `/install/migrate` | `RedirectIfInstalled` | `InstallController@migrate` / `migrateRun` | Run `migrate --force` (JSON `{success, output}`) | `app/api/install/migrate/route.ts` — applies `db/migrations/*.sql` against Neon `DATABASE_URL` (psql / Neon SQL editor); OPEN QUESTION: run at deploy time vs wizard vs manual step |
| GET/POST | `/install/admin` | `RedirectIfInstalled` | `InstallController@admin` / `adminSave` | Create first admin (name/email/password ≥10), then `markInstalled()` | `app/install/admin/page.tsx` + API route |
| GET | `/install/done` | `RedirectIfInstalled` | `InstallController@done` | Success page; only if session `installer.completed` else → home | `app/install/done/page.tsx` |
| GET | `/` | — | `Route::view('welcome')` | Marketing landing page | `app/page.tsx` |
| GET | `/docs` | — | `Route::view('docs')` | Public API docs (583 lines, see §2) | `app/docs/page.tsx` |
| GET | `/storage/{path}` | — | `PublicStorageController` (invokable) | Serves `storage/app/public` files; blocks control chars, dot-segments, `.php/.sql/.log/.zip…`, path-traversal via `realpath` prefix check; `X-Content-Type-Options: nosniff`; non-image/pdf/txt → attachment | `app/api/storage/[...path]/route.ts` or Vercel Blob — OPEN QUESTION: storage backend (Neon has no filesystem; public assets in `public/`, uploads → Vercel Blob) |
| GET | `/pay/{order}` | — | `CheckoutController@show` | Live checkout page; if pending+expired or recoverable → `OrderService::check()` first | `app/pay/[orderNo]/page.tsx` |
| GET | `/pay/{order}/status` | `throttle:40,1` | `CheckoutController@status` | Poll JSON `{status, redirect}`; redirect only when paid/expired and allowlisted | `app/api/pay/[orderNo]/status/route.ts` (GET) |
| POST | `/pay/{order}/start` | `throttle:20,1` | `CheckoutController@start` | Start hosted PG checkout; caches `provider_checkout` in `orders.provider_checkout` until `expires_at-30s` | `app/api/pay/[orderNo]/start/route.ts` (POST) |
| GET+POST | `/pay/{order}/return` | `throttle:30,1`, CSRF-exempt | `CheckoutController@return` | PG return URL; **ignores PG-posted data**, forces `check(force:true)`, redirects to merchant `redirect_url` (with `?order_id&client_order_id&status`) if paid | `app/api/pay/[orderNo]/return/route.ts` (GET+POST) |
| POST | `/pay/{order}/utr` | `throttle:10,1` | `CheckoutController@submitUtr` | Customer submits 12-digit UTR (manual accounts only) | `app/api/pay/[orderNo]/utr/route.ts` (POST) |
| GET | `/pay/{order}/qr.svg` | — | `CheckoutController@qr` | 320px SVG QR of `upiIntentUrl()`; 404 unless pending + non-hosted; `Cache-Control: private, max-age=600` | `app/api/pay/[orderNo]/qr/route.ts` (GET, `image/svg+xml`) — generate with a JS QR lib (e.g. `qrcode`) |
| GET | `/sandbox/pay/{order}` | `throttle:60,1` | `SandboxCheckoutController@show` | Sandbox checkout page | `app/sandbox/pay/[orderNo]/page.tsx` |
| POST | `/sandbox/pay/{order}/simulate` | `throttle:20,1` | `SandboxCheckoutController@simulate` | Simulate outcome; `timeout` → 504 (JSON or view) | `app/api/sandbox/pay/[orderNo]/simulate/route.ts` (POST) |
| GET/POST | `/login` | `guest`, POST `throttle:10,1` | `AuthController@showLogin` / `login` | Session login | `app/(auth)/login/page.tsx` + `app/api/auth/login/route.ts` (or Auth.js — OPEN QUESTION, see §7) |
| GET/POST | `/register` | `guest`, POST `throttle:10,1` | `AuthController@showRegister` / `register` | **404 unless `ALLOW_REGISTRATION=true`** (default `false`) | `app/(auth)/register/page.tsx` — keep flag-gated |
| GET/POST | `/confirm-password` | `auth` (no `active` check) | `ConfirmPasswordController@show` / `confirm` | Re-confirm password; sets `auth.password_confirmed_at`; regenerates session | `app/(auth)/confirm-password/page.tsx` + API route |
| POST | `/logout` | `auth, active` | `AuthController@logout` | Logout + session invalidate + CSRF rotate | `app/api/auth/logout/route.ts` (POST) |
| GET | `/dashboard` | `auth, active` | `DashboardController` (invokable) | Merchant dashboard, `?environment=live\|sandbox` | `app/(dashboard)/dashboard/page.tsx` |
| GET | `/accounts` | `auth, active` | `PaymentAccountController@index` | List payment accounts + usage today | `app/(dashboard)/accounts/page.tsx` |
| GET | `/accounts/create` | `auth, active` | `PaymentAccountController@create` | Add-account form | `app/(dashboard)/accounts/new/page.tsx` |
| POST | `/accounts` | `auth, active` | `PaymentAccountController@store` | Create account (credentials encrypted) | `app/api/accounts/route.ts` (POST) |
| POST | `/accounts/{account}/limit` | `auth, active`, `can:update,account` | `PaymentAccountController@updateLimit` | Set/clear daily limit | `app/api/accounts/[id]/limit/route.ts` (POST) |
| POST | `/accounts/{account}/toggle` | `auth, active`, `can:update,account` | `PaymentAccountController@toggle` | Enable/disable | `app/api/accounts/[id]/toggle/route.ts` (POST) |
| POST | `/accounts/{account}/default` | `auth, active`, `can:update,account` | `PaymentAccountController@makeDefault` | Set default (clears others in txn) | `app/api/accounts/[id]/default/route.ts` (POST) |
| DELETE | `/accounts/{account}` | `auth, active`, `can:delete,account` | `PaymentAccountController@destroy` | Delete; refused (error) if any orders exist — disable instead | `app/api/accounts/[id]/route.ts` (DELETE) |
| GET | `/orders` | `auth, active` | `OrderController@index` | Order list, `?environment&status&q`, 20/page | `app/(dashboard)/orders/page.tsx` |
| GET | `/orders/create` | `auth, active` | `OrderController@create` | Manual payment-link form | `app/(dashboard)/orders/new/page.tsx` |
| POST | `/orders` | `auth, active` | `OrderController@store` | Create live order from dashboard (no customer_email/redirect_url fields — see §3) | `app/api/orders/route.ts` (POST, dashboard variant) |
| GET | `/orders/{order}` | `auth, active` | `OrderController@show` | Order detail + unified webhook history; admin read-only view, sandbox read-only | `app/(dashboard)/orders/[orderNo]/page.tsx` |
| POST | `/orders/{order}/recheck` | `auth, active` | `OrderController@recheck` | Force provider re-check; flash `Status: {status}` | `app/api/orders/[orderNo]/recheck/route.ts` (POST) |
| POST | `/orders/{order}/approve-utr` | `auth, active` | `OrderController@approveUtr` | Merchant approves customer UTR with bank UTR + exact amount | `app/api/orders/[orderNo]/approve-utr/route.ts` (POST) |
| POST | `/orders/{order}/reject-utr` | `auth, active` | `OrderController@rejectUtr` | Reject UTR (reason ≤150); re-pends with fresh expiry or expires if attempts exhausted | `app/api/orders/[orderNo]/reject-utr/route.ts` (POST) |
| POST | `/orders/{order}/mark-paid` | `auth, active` | `OrderController@markPaid` | **Deliberately disabled** — always returns error "Merchant-side manual payment confirmation is disabled. Use provider verification or administrator review." | Keep as disabled stub (same error) or omit — OPEN QUESTION (keep route returning 422/error to avoid silent behaviour change) |
| GET | `/settings` | `auth, active` | `SettingsController@index` | API & Webhooks settings page | `app/(dashboard)/settings/page.tsx` |
| POST | `/settings/profile` | `auth, active` | `SettingsController@updateProfile` | name/business_name/phone | `app/api/settings/profile/route.ts` (POST) |
| POST | `/settings/webhook` | `auth, active` | `SettingsController@updateWebhook` | Live webhook URL (SafeUrl-validated) | `app/api/settings/webhook/route.ts` (POST) |
| POST | `/settings/sandbox/webhook` | `auth, active` | `SettingsController@updateSandboxWebhook` | Sandbox webhook URL; must differ from live URL | `app/api/settings/sandbox/webhook/route.ts` (POST) |
| POST | `/settings/sandbox/regenerate-keys` | `auth, active` | `SettingsController@regenerateSandboxKeys` | New `test_key_`/`test_sec_`; secret shown once (encrypted in flash session) | `app/api/settings/sandbox/regenerate-keys/route.ts` (POST) |
| POST | `/settings/sandbox/revoke-keys` | `auth, active` | `SettingsController@revokeSandboxKeys` | Null sandbox key/secret | `app/api/settings/sandbox/revoke-keys/route.ts` (POST) |
| POST | `/settings/rotation` | `auth, active` | `SettingsController@updateRotation` | `rotation_mode` random/default | `app/api/settings/rotation/route.ts` (POST) |
| POST | `/settings/redirect-domains` | `auth, active` | `SettingsController@updateRedirectDomains` | Newline/comma host list, scheme stripped, `[a-z0-9.-]` only | `app/api/settings/redirect-domains/route.ts` (POST) |
| POST | `/settings/regenerate-keys` | `auth, active` | `SettingsController@regenerateKeys` | New live `key_`/`sec_`; secret once only | `app/api/settings/regenerate-keys/route.ts` (POST) |
| POST | `/settings/regenerate-webhook-secret` | `auth, active` | `SettingsController@regenerateWebhookSecret` | New live `whsec_…` | `app/api/settings/regenerate-webhook-secret/route.ts` (POST) |
| POST | `/settings/sandbox/regenerate-webhook-secret` | `auth, active` | `SettingsController@regenerateSandboxWebhookSecret` | New sandbox `test_whsec_…` | `app/api/settings/sandbox/regenerate-webhook-secret/route.ts` (POST) |
| GET | `/settings/password` | `auth, active` | `ChangePasswordController@show` | Change-password form | `app/(dashboard)/settings/password/page.tsx` |
| PUT | `/settings/password` | `auth, active` | `ChangePasswordController@update` | Change password + `logoutOtherDevices` | `app/api/settings/password/route.ts` (PUT) |
| GET | `/admin/merchants` | `auth, active, admin, password.confirm:,900` | `AdminController@merchants` | Merchant list (live order counts, paid totals), 25/page | `app/(admin)/merchants/page.tsx` |
| POST | `/admin/merchants/{user}/toggle` | same | `AdminController@toggleMerchant` | Enable/disable merchant (admins excluded, 403); audit-logged | `app/api/admin/merchants/[id]/toggle/route.ts` (POST) |
| GET | `/admin/orders` | same | `AdminController@orders` | All orders, `?status`, 30/page | `app/(admin)/orders/page.tsx` |
| GET | `/admin/orders/{order}` | same | `AdminController@showOrder` | Admin read-only order view; audit-logs `order_viewed` | `app/(admin)/orders/[orderNo]/page.tsx` |
| POST | `/admin/orders/{order}/manual-payment-override` | same + Gate `manual-payment-override` | `AdminController@manualPaymentOverride` | Admin marks paid with reference+reason (see §8/§11) | `app/api/admin/orders/[orderNo]/manual-payment-override/route.ts` (POST) |
| GET | `/admin/transaction-debugger` | same | `TransactionDebuggerController@index` | Filterable all-orders debugger, 25/page | `app/(admin)/transaction-debugger/page.tsx` |
| GET | `/admin/transaction-debugger/{order}` | same | `TransactionDebuggerController@show` | Order timeline + masked PII + sanitised provider error; audit-logs `transaction_debugger_viewed` | `app/(admin)/transaction-debugger/[orderNo]/page.tsx` |

Notes: admin group requires password re-confirmation within **900 s (15 min)**
(`password.confirm:,900`); `password_timeout` config default is 10800 s (3 h) — the
route overrides it to 900 s. Route-model binding for `{account}`/`{user}` is by
numeric id; `{order}` is by `order_no`. No `password.request`/`password.reset`
routes exist (see §7).

### 1.2 `routes/api.php` (17 lines) — prefix `/api/v1`

| Method | Path | Middleware | Handler | Purpose | New architecture |
|---|---|---|---|---|---|
| GET | `/api/v1/accounts` | `api.key` (default scope) | `AccountApiController@index` | Merchant's live UPI accounts + `used_today`/`remaining_today`; sandbox creds → `{environment:sandbox, rotation_mode:null, data:[]}` | `app/api/v1/accounts/route.ts` (GET) |
| GET | `/api/v1/orders/{orderNo}` | `api.key` | `OrderApiController@show` | Order status; accepts `order_no` **or** `client_order_id` (order_no first); triggers `OrderService::check()` (live provider poll) before responding | `app/api/v1/orders/[orderNo]/route.ts` (GET) |
| POST | `/api/v1/orders` | `api.key:order_create` | `OrderApiController@store` | Create order; 201 `{success:true, data: toApiArray()}`; separate per-key bucket 1000/min + shared per-IP 600/min | `app/api/v1/orders/route.ts` (POST) |

Response envelope: `{success:true, data:…}`; errors JSON `{message, errors?}` (422
validation includes `errors` object). Every API response carries `X-Request-Id`
(UUID). Auth errors: 401 invalid key/secret, 403 disabled merchant, 429 rate limit
(with `Retry-After`, `X-RateLimit-Limit/Remaining`).

### 1.3 `routes/console.php` (377 lines) — Artisan commands + schedule

| Command / schedule | Frequency | Purpose | New architecture |
|---|---|---|---|
| `orders:check-pending` (closure, `OrderService`) | `Schedule::command(...)->everyMinute()->withoutOverlapping()` | **Phase 1:** pending orders due for check (`last_checked_at` null or ≥`check_interval_seconds`=3 s old, or expired), fair order (null `last_checked_at` first, then oldest), batch ≤`pending_verification_batch_size` (100). **Phase 2:** late-payment recovery on `recoverableExpired()` orders, interval ≥120 s (default 300 s), batch ≤100. Distributed cache lock `scheduler:orders:check-pending` (60–3600 s, default 300 s); per-order errors isolated, `last_checked_at` advanced so a bad account cannot starve others; metrics logged. | Vercel Cron `GET /api/cron/orders-check-pending` every minute + `lib/cron/orders-check.ts`; lock via Neon `pg_try_advisory_xact_lock` (single HTTP-driver transaction — verify semantics first) or Upstash / Vercel KV — OPEN QUESTION (no shared cache on Vercel by default) |
| `orders:recover-verification-lease {order} {execution} {generation} {operator} {reason} {--confirm-stopped} {--confirm-node-shutdown}` | manual (operator CLI) | Recover an expired verification lease **only after** the recorded owner process is conclusively stopped; checks token+generation+expiry, liveness via `VerificationProcessInspector` (ALIVE → refuse; UNKNOWN/different-node → needs `--confirm-node-shutdown`); clears lease fields; writes `VerificationLeaseRecoveryAudit` (hashed execution token, operator, reason). | `app/api/admin/verification-lease/recover/route.ts` (POST, admin-only) **or** a Vercel CLI/script — OPEN QUESTION: operator tooling on serverless. On Vercel there is no PID/process identity — lease model itself is an OPEN QUESTION (§8) |
| `app:create-admin {email} {--name=Admin}` | manual | `updateOrCreate` admin by email; prompts secret password (min 10); generates API creds if missing | Seed/admin script `scripts/create-admin.ts` (run via `vercel env` / local) — NOT a web route |
| `webhooks:dispatch` | `everyMinute()->withoutOverlapping(5)` | `WebhookOutboxDispatcher::dispatchDue()` — bounded batch (default 100) of due outbox events → queue | Vercel Cron `GET /api/cron/webhooks-dispatch` every minute |
| `webhooks:retry {eventId}` | manual | Reset undelivered outbox event to `pending`, `available_at=now`, `dispatch_attempts=0`, `last_error=null`; refuses delivered events, offloaded payloads (restore first), and actively-claimed events | `app/api/admin/webhooks/[eventId]/retry/route.ts` (POST, admin-only) or admin UI button |
| `webhooks:offload-payloads` (`--chunk=100`) | `daily()->withoutOverlapping(10)` | `WebhookRetentionService::offloadDeliveredPayloads()` — see §10 | Vercel Cron daily `GET /api/cron/webhooks-offload` |
| `webhooks:prune-logs` (`--chunk=100`) | `daily()->withoutOverlapping(10)` | `WebhookRetentionService::pruneEligibleLogs()` — archive `webhook_logs` → `archived_webhook_logs` | Vercel Cron daily `GET /api/cron/webhooks-prune` |
| `webhooks:restore-payload {eventId}` | manual | Restore one offloaded payload from `archived_webhook_payloads` → `webhook_outbox.payload` (status untouched) | Admin API route (see above) |
| `webhooks:rollback-payloads {--chunk=100} {--purge-archive}` | manual | Restore all offloaded payloads in chunks; optionally purge archive rows | Admin API route / script — OPEN QUESTION |

No `schedule:work` daemon on Vercel: all four scheduled entries must become Vercel
Crons (max 1-min frequency on paid plans; Hobby is daily — **plan constraint, flag to
parent**). Queue worker (`queue:listen`) has no Vercel equivalent — see §10/§12.


---

## 2. Pages / Blade views (41 files)

Layout chain: `layouts/base.blade.php` (HTML shell, `<title>@yield('title') · {app.name}`,
CSRF meta, Vite `resources/css/app.css` + `resources/js/app.js`, Google Fonts Inter /
JetBrains Mono) → `layouts/app.blade.php` (authed sidebar + topbar, logout form,
avatar, flash status/errors) / `layouts/guest.blade.php` (auth pages, marketing
tagline "Accept UPI payments straight into your bank account") / `layouts/public-nav.blade.php`
(public nav for `/` and `/docs`) / `install/layout.blade.php` (installer shell, step
indicator). Shared components (`resources/views/components/`): `avatar`, `copy`
(clipboard button, `data-copy`), `empty` (empty-state), `icon` (named SVG set),
`input` (labelled input + error), `logo`, `status` (status pill). All pages use
Tailwind v4 (`@theme` brand indigo tokens in `resources/css/app.css`); `resources/js/app.js`
is only: `data-copy` clipboard, `data-confirm` confirm dialogs, `data-href` row
navigation, sidebar toggle, `data-toggle-secret` show/hide, `data-reload-page`,
`data-submit-on-change`, `data-amount-preview` (₹ preview). No framework JS.

| View | Shows / data needed | Forms / inputs | New architecture |
|---|---|---|---|
| `welcome.blade.php` (473 lines) | Marketing landing: hero "Accept UPI payments directly in your bank account", feature grid, gateway-vs-aggregator comparison, testimonials, "Live in four simple steps", pricing ("Simple and transparent"), FAQ, CTA. Footer: "Built with ♥ for Indian merchants by Mayank Singh" linking `github.com/mynkdev-21` (see §17 — attribution, keep or repoint per parent). | CTA links to `/login`, `/docs` | `app/page.tsx` |
| `docs.blade.php` (583 lines) + `docs/_code.blade.php` | Full public API docs: intro, Live vs Sandbox auth, `POST /api/v1/orders` (fields table: amount, client_order_id, payment_account_id, customer_*, note, redirect_url), `GET /api/v1/orders/{id}`, response-field table (`toApiArray()` shape), `GET /api/v1/accounts`, rotation & daily limits, webhook events table (`order.paid/expired/under_review/failed/pending/timeout`), signature verification (HMAC-SHA256 `t=…,v1=…`, 5-min tolerance, dedupe `event_id`, `event_sequence`, migration deadline **31 Mar 2027** for timestamped signature; legacy `X-Signature-Legacy` retired), error-code table (401/403/404/422/429/500), PHP + Node code examples. | — (code-copy buttons) | `app/docs/page.tsx` — port verbatim content; keep the 31 Mar 2027 deadline note |
| `dashboard.blade.php` (124 lines) | Greeting + env switcher (Live/Sandbox), stat cards (today amount/count, total amount, paid/pending/review counts, success rate = paid/closed), 7-day paid chart (label/date/amount/count), setup checklist (Live: add UPI account, webhook URL, first payment; Sandbox: sandbox creds, sandbox webhook, first TEST payment), recent 6 orders | Env toggle via `?environment=` | `app/(dashboard)/dashboard/page.tsx` |
| `accounts/index.blade.php` (133) | Account cards: label, provider label, UPI ID (copy), payee, active/default badges, `used_today`/`remaining_today` vs `daily_limit`, order count; rotation-mode form (`random`/`default`) | Rotation form; per-account: limit form (`daily_limit`), default, toggle, delete (`data-confirm`) | `app/(dashboard)/accounts/page.tsx` |
| `accounts/create.blade.php` (199) | Provider picker (4 providers, Paytm Business hidden if flag off), per-provider credential fields (see §3), env radio sandbox/production for hosted PGs, daily limit, UPI ID + payee name | POST `accounts.store`: `provider, label, upi_id, payee_name, daily_limit, mid, merchant_key, website_name, client_id, client_secret, client_version, environment` | `app/(dashboard)/accounts/new/page.tsx` |
| `orders/index.blade.php` (48) + `orders/_table.blade.php` (48) | Order table (order_no, client_order_id, amount, status pill, account, customer, created), status-count chips, search `q` (order_no/client_order_id/UTR), status filter, env toggle, 20/page pagination | GET search form (`q, status, environment`) | `app/(dashboard)/orders/page.tsx` + `components/orders-table.tsx` |
| `orders/create.blade.php` (70) | Manual payment-link form + live ₹ amount preview + account picker (active accounts only) | POST `orders.store`: `amount, payment_account_id, customer_name, customer_mobile, note` | `app/(dashboard)/orders/new/page.tsx` |
| `orders/show.blade.php` (253) | Order detail: amount, status, customer, account, UPI intent/QR, payment URL (copy), expiry, UTR/review state, provider response (hidden/sanitised), webhook history (unified active+archive, 25/page via `WebhookHistoryService`), admin-override form (admin only), UTR approve/reject forms (owner only, REVIEW only), recheck button; `readOnly` when admin-viewing-others' order or sandbox | approve-utr (`bank_utr, received_amount`), reject-utr (`reason`), recheck | `app/(dashboard)/orders/[orderNo]/page.tsx` (shared by admin read-only view) |
| `pay.blade.php` (282) | **The checkout page.** States: pending (QR 320px SVG from `pay.qr`, UPI app buttons BHIM/GPay/PhonePe/Paytm deep-links `upi://pay`, copy UPI ID, countdown to `expires_at`, "Waiting for payment…" + poll), paid ("Payment successful", auto-redirect), review (UTR submitted, waiting on merchant), expired ("Payment link expired" + late-recovery note: "We can still check the provider until {expires+24h}"), hosted PG ("Pay securely with {PhonePe/Paytm}" + Start button POST `pay.start`). Inline JS: 1-s countdown tick; poll `GET pay.status` every **4 s** (pending/review) or **30 s** (expired/recovering); on status change → redirect. UTR form (manual accounts only) included via `pay/_utr-form.blade.php`. | `pay.start` form; `pay.utr` form (`utr`, 12 digits) | `app/pay/[orderNo]/page.tsx` (client component for countdown+poll; QR via `app/api/pay/[orderNo]/qr/route.ts`) |
| `pay/_utr-form.blade.php` (19) | UTR submission box (manual accounts, `acceptsCustomerUtr()` only) | POST `pay.utr`: `utr` | component in pay page |
| `pay-redirect.blade.php` (26) | "Redirecting to secure checkout…" + auto-submit POST form to PG URL with hidden fields (`mid, orderId, txnToken` for Paytm PG); CSP nonce on inline script | PG form (fields from `provider_checkout`) | `app/pay/[orderNo]/redirect/page.tsx` — or render from `pay.start` API response; keep auto-submit + nonce-equivalent CSP |
| `sandbox-pay.blade.php` (62) | Sandbox checkout: "Payment simulator", TEST badge, order summary, outcome buttons | POST `sandbox.pay.simulate`: `outcome` ∈ success/failed/pending/expired/timeout/invalid_reference | `app/sandbox/pay/[orderNo]/page.tsx` |
| `settings.blade.php` (194) | Sections: API credentials (live `key_…`, secret shown once), Sandbox credentials (`test_key_…`, revoke), Webhook (live URL + `whsec_…` regenerate), Sandbox webhook (URL + `test_whsec_…`), Business profile (name/business_name/phone), rotation + redirect domains are on accounts/settings forms (see §3) | 9 forms (see §1 settings rows) | `app/(dashboard)/settings/page.tsx` |
| `auth/login.blade.php` (24) | "Welcome back", email/password/remember | POST `login` | `app/(auth)/login/page.tsx` |
| `auth/register.blade.php` (22) | "Create your account": name, business_name, email, phone, password+confirm | POST `register` | `app/(auth)/register/page.tsx` (flag-gated) |
| `auth/change-password.blade.php` (36) | current_password, password, password_confirmation | PUT `password.change` | `app/(dashboard)/settings/password/page.tsx` |
| `auth/confirm-password.blade.php` (22) | "Confirm your password" | POST `password.confirm` | `app/(auth)/confirm-password/page.tsx` |
| `admin/merchants.blade.php` (59) | Merchant table: avatar, display name, email, live order count, paid count, paid amount, active toggle | POST toggle per merchant | `app/(admin)/merchants/page.tsx` |
| `admin/orders.blade.php` (20) | All-orders table (thin wrapper over `orders._table`), status filter | GET filter | `app/(admin)/orders/page.tsx` |
| `admin/transactions/index.blade.php` | Debugger list: search `q`, status, provider (incl. `sandbox`), environment, date_from/to; `webhookLogs` count per order | GET filter form | `app/(admin)/transaction-debugger/page.tsx` |
| `admin/transactions/show.blade.php` | Debugger detail: masked email/mobile/name, timeline (created → checkout initiated → provider response → verification attempted → UTR submitted → sandbox simulated → webhook attempts → current status), sanitised provider error | — | `app/(admin)/transaction-debugger/[orderNo]/page.tsx` |
| `install/index.blade.php` (27) + `install/requirements-overview.blade.php` (287) + `install/hosting-check.blade.php` (174) | Requirements & readiness: PHP ≥8.2, PHP-FPM handler, memory ≥128M, extensions (openssl, mbstring, tokenizer, json, curl, fileinfo, xml, ctype, bcmath, iconv, pdo, pdo_mysql, pdo_sqlite optional), writable dirs, server diagnostics (SAPI, Cloudflare visitor, trusted proxies); browser deployment-check probe (POST `/__upi_deployment_check`) | recheck (AJAX) | `app/install/page.tsx` — **most checks are NOT MIGRATABLE** on Vercel (no PHP/extensions/writable dirs); replace with: Neon `DATABASE_URL` present and reachable? (pooled connection string), `db/migrations` applied?, env vars present? |
| `install/database.blade.php` (66) | DB form: `db_connection` (=mysql only), host, port, database, username, password, `app_url`, `app_name`; setup_token hidden field | POST `install.database.save` | `app/install/database/page.tsx` — fields become: Neon `DATABASE_URL` (pooled connection string, pasted by the user — never stored in the repo), app URL, app name |
| `install/migrate.blade.php` (61) | "Prepare the application" — run migrations (AJAX, shows output) | POST `install.migrate.run` | `app/install/migrate/page.tsx` |
| `install/admin.blade.php` (40) | Create admin: name, email, password+confirm | POST `install.admin.save` | `app/install/admin/page.tsx` |
| `install/done.blade.php` (40) | "You're ready to go" + dashboard link | — | `app/install/done/page.tsx` |
| `install/layout.blade.php` (129) | Installer shell + 5-step indicator (Ready → Database → Set up → Account → Complete) | — | `app/install/layout.tsx` |

---

## 3. Controllers (16 files, ~70 public methods)

Base: `Controller.php` (8 lines, empty abstract). All dashboard/admin routes are
`auth + active` unless noted; ownership enforced per-method (404 on чужой order/account —
deliberately 404, not 403, to avoid leaking existence).

| Controller | Method | Auth | What it does (validation / side-effects) | New architecture |
|---|---|---|---|---|
| `AuthController` (160) | `showLogin()` | guest | Renders login | `app/(auth)/login/page.tsx` |
| | `login(Request)` | guest, throttle 10/min | Validates email+password; per-email+IP: 5 attempts/min (`RateLimiter`), then 10 failures/15 min → cache lock 15 min (`login:sha1(email\|ip)`, `login_fails:…`, `login_lock:…`); generic error (no user-enumeration); disabled account → logout + "account disabled"; success clears counters, regenerates session, `redirect()->intended(dashboard)` | `app/api/auth/login/route.ts` — replicate lockout keys in a Neon table or Upstash; OPEN QUESTION: session store (see §7) |
| | `showRegister()` / `register(Request)` | guest, throttle 10/min; **404 unless `ALLOW_REGISTRATION`** | name/business_name/email/phone/password (min 10, `uncompromised` in prod only); creates `merchant`, generates API creds, logs in, → `accounts.create` with "Welcome! Add your first UPI account…" | Same, flag-gated |
| | `logout(Request)` | auth+active | `Auth::logout`, session invalidate + token regenerate → login | `app/api/auth/logout/route.ts` |
| `ChangePasswordController` (55) | `show()` / `update(Request)` | auth+active | Validates current_password + new (min 10, confirmed, uncompromised in prod); verifies current password via guard; `Auth::logoutOtherDevices(current)` (rotates remember_token, kills other sessions) + saves new password + session regenerate | `app/api/settings/password/route.ts` (PUT) |
| `ConfirmPasswordController` (46) | `show()` / `confirm(Request)` | auth (no active check) | 5 attempts/min per user (`confirm-password:{userId}`); `Hash::check`; sets `auth.password_confirmed_at=time()`; regenerates session (fixation defence); → intended/dashboard | `app/api/auth/confirm-password/route.ts` (POST) |
| `DashboardController` (85, invokable) | `__invoke(Request)` | auth+active | `?environment` live/sandbox; **one grouped SQL aggregation** for paid/pending/review/closed counts, total + today amount/count, success rate; 7-day paid chart grouped by `DATE(paid_at)`; checklist (live vs sandbox variants); recent 6 orders with account | `app/(dashboard)/dashboard/page.tsx` + `lib/dashboard/stats.ts` (single Neon SQL aggregation via `@neondatabase/serverless`) |
| `PaymentAccountController` (147) | `index(Request)` | auth+active | Accounts oldest-first with order count + `withUsageToday()` | `app/(dashboard)/accounts/page.tsx` |
| | `create()` | auth+active | Providers list; Paytm Business omitted if `GATEWAY_ENABLE_PAYTM_BUSINESS=false` | same page |
| | `store(Request)` | auth+active | Validates per provider (see credential table below); `upi_id` regex `^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$`, required unless hosted; `mid` required for paytm_business/paytm_pg (`^[A-Za-z0-9]+$`, ≤40); `merchant_key` required paytm_pg (≤100); `website_name` ≤40 (`^[A-Za-z0-9_]+$`, default `DEFAULT` prod / `WEBSTAGING` sandbox); `client_id`/`client_secret`/`client_version` required phonepe_pg (≤150/200/10); `environment` required for hosted (sandbox/production); `daily_limit` 1–10,000,000; first account becomes `is_default`; credentials stored as **encrypted JSON** (`encrypted:array` cast) | `app/api/accounts/route.ts` (POST) — encrypt credentials with `ENCRYPTION_KEY` (AES-256-GCM via Node `crypto`; **not** Laravel `Crypt` — keys are not portable) |
| | `updateLimit(Request, account)` | owner only (`PaymentAccountPolicy::update`) | `daily_limit` nullable 1–10,000,000 | `app/api/accounts/[id]/limit/route.ts` |
| | `toggle(Request, account)` | owner | Flips `is_active` | `.../toggle/route.ts` |
| | `makeDefault(Request, account)` | owner | Txn: all user's accounts `is_default=false`, then this one true | `.../default/route.ts` |
| | `destroy(Request, account)` | owner (`Policy::delete`) | Refused if any orders exist; else delete | `app/api/accounts/[id]/route.ts` (DELETE) |
| `OrderController` (150) | `index(Request)` | auth+active | Own orders, env filter, `?status`, `?q` (order_no/client_order_id/UTR exact), status counts, 20/page | `app/(dashboard)/orders/page.tsx` |
| | `create(Request)` | auth+active | Form data: active accounts | `app/(dashboard)/orders/new/page.tsx` |
| | `store(Request)` | auth+active | amount 1–100,000; `payment_account_id` nullable; customer_name ≤100, mobile ≤20, note ≤50; `OrderService::create(live)` → redirect to order page | `app/api/orders/route.ts` (POST) |
| | `show(Request, order)` | auth+active; owner **or admin** (read-only) | Loads account + unified webhook history (`WebhookHistoryService::getAllLogsForOrder`); `readOnly` if admin-viewing-other or sandbox | `app/(dashboard)/orders/[orderNo]/page.tsx` |
| | `recheck(Request, order)` | owner only | `OrderService::check()` (force=false); flash status | `app/api/orders/[orderNo]/recheck/route.ts` |
| | `markPaid(Request, order)` | owner only | **Disabled by design** — always error (see §1) | Keep disabled |
| | `approveUtr(Request, order)` | owner only | `bank_utr` 12 digits (whitespace stripped), `received_amount` ≥0.01; `OrderService::approveCustomerUtr()` | `app/api/orders/[orderNo]/approve-utr/route.ts` |
| | `rejectUtr(Request, order)` | owner only | `reason` ≤150; `OrderService::rejectCustomerUtr()` | `app/api/orders/[orderNo]/reject-utr/route.ts` |
| `CheckoutController` (208) | `show(Order)` | public (live only, account must exist+match) | If pending+expired **or** recoverable → `check()` first; renders `pay` | `app/pay/[orderNo]/page.tsx` |
| | `status(Order)` | public, throttle 40/min | `check()` then JSON `{status, redirect}` | `app/api/pay/[orderNo]/status/route.ts` |
| | `submitUtr(Request, Order)` | public, throttle 10/min | `utr` regex `^\s*\d{12}\s*$`; `OrderService::submitCustomerUtr()` | `app/api/pay/[orderNo]/utr/route.ts` |
| | `start(Order)` | public, throttle 20/min | Hosted only (404 otherwise); if pending + null expiry → `check()`; row-locked txn reuses cached `provider_checkout` if `expires_at > now+30s` and same account/env/provider, else `verifier->startCheckout()`; validates checkout (`type` redirect\|form, https URL, form ⇒ fields array); redirect → away URL, form → `pay-redirect` view | `app/api/pay/[orderNo]/start/route.ts` |
| | `return(Order)` | public, throttle 30/min, CSRF-exempt, GET+POST | **Ignores PG-posted data**; `check(force:true)`; if paid + redirect_url → allowlisted redirect with query params, else back to pay page | `app/api/pay/[orderNo]/return/route.ts` |
| | `qr(Order)` | public | 404 unless pending + non-hosted; BaconQrCode SVG 320px of `upiIntentUrl()` | `app/api/pay/[orderNo]/qr/route.ts` |
| `SandboxCheckoutController` (67) | `show(Order)` / `simulate(Request, Order)` | public, sandbox only (404 otherwise); throttle 60/20 | `outcome` ∈ success/failed/pending/expired/timeout/invalid_reference; `OrderService::simulateSandbox()`; `timeout` → 504 JSON or view; JSON if `expectsJson` else redirect | `app/sandbox/pay/[orderNo]/page.tsx` + `app/api/sandbox/pay/[orderNo]/simulate/route.ts` |
| `SettingsController` (152) | `index(Request)` | auth+active | Settings page with user | `app/(dashboard)/settings/page.tsx` |
| | `updateProfile` / `updateWebhook` / `updateSandboxWebhook` | auth+active | Profile fields; webhook URLs via `SafeUrl::validate()`; sandbox URL must differ from live URL | `app/api/settings/*/route.ts` |
| | `regenerateSandboxKeys` / `revokeSandboxKeys` | auth+active | New/revoked sandbox creds; secret returned once, encrypted in flash (`Crypt::encryptString`) | same — one-time secret display via encrypted server-side flash / single-use token |
| | `updateRotation` | auth+active | `rotation_mode` ∈ random/default | `app/api/settings/rotation/route.ts` |
| | `updateRedirectDomains` | auth+active | Newline/comma host list → array, scheme stripped, `[a-z0-9.-]` only, stored as JSON | `app/api/settings/redirect-domains/route.ts` |
| | `regenerateKeys` / `regenerateWebhookSecret` / `regenerateSandboxWebhookSecret` | auth+active | New live/sandbox creds/secrets, once-only display | `app/api/settings/regenerate-*/route.ts` |
| `InstallController` (306) | `index/recheck/database/databaseSave/migrate/migrateRun/admin/adminSave/done` | `RedirectIfInstalled` | See §1 installer rows + §7; `databaseSave` validates db_* + app_url/app_name, requires HTTPS prod URL (`DeploymentUrl::isAllowedProductionUrl`), local DB host only unless `INSTALLER_ALLOW_REMOTE_DB`, tests connection, writes `.env`, consumes one-time setup token; `migrateRun` runs `migrate --force` (JSON); `adminSave` creates admin (409 if exists), `markInstalled()`, invalidates session | `app/install/*` + `app/api/install/*/route.ts` — **DB fields become a Neon `DATABASE_URL` field** (see §2 installer rows) |
| `PublicStorageController` (27, invokable) | `__invoke(path)` | public | See §1 `/storage/{path}` | Vercel Blob — OPEN QUESTION |
| `Admin/AdminController` (104) | `manualPaymentOverride(Request, order, OrderService)` | admin + password-confirm 900 s + Gate `manual-payment-override` | amount (decimal 0,2, ≥0.01, must equal order amount), `verification_reference` 6–80 chars `[A-Za-z0-9_-]`, `reason` 20–500 chars; `OrderService::adminOverridePaid()` | `app/api/admin/orders/[orderNo]/manual-payment-override/route.ts` |
| | `merchants()` | admin | Merchants with live order/paid counts + paid sum, 25/page | `app/(admin)/merchants/page.tsx` |
| | `toggleMerchant(Request, user)` | admin | 403 for admins; flips `is_active`; audit `merchant_enabled/disabled` with email + IP | `app/api/admin/merchants/[id]/toggle/route.ts` |
| | `orders(Request)` | admin | All orders with user+account, `?status`, 30/page | `app/(admin)/orders/page.tsx` |
| | `showOrder(Request, order)` | admin | Audit `order_viewed`; read-only `orders.show` view | `app/(admin)/orders/[orderNo]/page.tsx` |
| `Admin/TransactionDebuggerController` (176) | `index(Request)` | admin | Filters: `q` (≤100, unicode letters/numbers/@._- space), status ∈ 5, provider ∈ providers+sandbox, environment, date_from/to `Y-m-d`; orders with user+account (id/name/email, id/label/provider) + `webhookLogs` count, 25/page | `app/(admin)/transaction-debugger/page.tsx` |
| | `show(Request, order)` | admin | Timeline + provider error (sanitised: tags/URLs/credentials/emails/long numbers redacted, ≤240 chars) + masked PII (email `a***@domain`, mobile `******1234`, name `A***`); audit `transaction_debugger_viewed` | `app/(admin)/transaction-debugger/[orderNo]/page.tsx` |
| `Api/AccountApiController` (45) | `index(Request)` | `api.key` | See §1.2 | `app/api/v1/accounts/route.ts` |
| `Api/OrderApiController` (86) | `store(Request)` | `api.key:order_create` | amount 1–100,000 (decimal 0,2); `client_order_id` required, ≤64, `[A-Za-z0-9_-]`, unique per (user, environment); `payment_account_id` prohibited in sandbox; customer_name ≤100, email ≤255, mobile ≤20, note ≤50; `redirect_url` nullable `url:https` ≤500 + allowlist check (empty allowlist ⇒ 422 "Redirect URLs are not enabled…"); `OrderService::create(merchant, data, environment)`; 201 | `app/api/v1/orders/route.ts` (POST) |
| | `show(Request, orderNo)` | `api.key` | order_no first, else client_order_id, scoped to merchant+environment; `check()` then `toApiArray()` | `app/api/v1/orders/[orderNo]/route.ts` (GET) |

**Provider credential shapes** (stored encrypted JSON in `payment_accounts.credentials`):

| Provider | `credentials` JSON | `upi_id` | Hosted? |
|---|---|---|---|
| `paytm_business` | `{mid}` | required | No |
| `paytm_pg` | `{mid, merchant_key, website_name, environment}` | null | Yes |
| `phonepe_pg` | `{client_id, client_secret, client_version, environment}` | null | Yes |
| `manual` | `null` | required | No |


---

## 4. Models (8 files, `app/Models/`)

All timestamps are Laravel `created_at`/`updated_at` (`timestamp`); Postgres:
`TIMESTAMPTZ`. Money: MySQL `DECIMAL(12,2)` → Postgres `NUMERIC(12,2)`. All
`$hidden` fields must never be serialized to the browser in Next.js either.
Encryption: Laravel `encrypted`/`encrypted:array` casts use `APP_KEY` (AES-256-CBC
via Laravel `Crypt`) — **not portable to Node**; the new build must pick its own
envelope encryption (`ENCRYPTION_KEY` env, AES-256-GCM, Node `crypto`) and treat
stored values as opaque. There is no migration path for existing encrypted rows
(no production data exists yet — fresh install).

| Model | Table | Fields (type / notes) | Relations / methods | New architecture |
|---|---|---|---|---|
| `User` (209) | `users` | id bigint PK; name string; email string unique; email_verified_at timestamp nullable (**never set/used by any flow** — no verification mail); password string (bcrypt, `hashed` cast, BCRYPT_ROUNDS=12); role string default `merchant` (`admin`\|`merchant`, plain string, no enum); business_name nullable; phone varchar(20) nullable; is_active boolean default true; api_key string nullable unique (`key_`+24 random); api_secret text nullable **encrypted** (`sec_`+40); webhook_url nullable; sandbox_api_key nullable unique (`test_key_`+24); sandbox_api_secret text nullable encrypted (`test_sec_`+40); sandbox_webhook_url varchar(500) nullable; webhook_secret text nullable encrypted (`whsec_`+40); sandbox_webhook_secret text nullable encrypted (`test_whsec_`+40); redirect_domains JSON nullable (array of hosts); rotation_mode string default `random` (`random`\|`default`); api_last_used_at timestamp nullable; api_last_used_ip varchar(45) nullable; remember_token; timestamps | hasMany paymentAccounts, orders, adminAuditLogs(admin_id); `isAdmin()`, `displayName()` (business_name ?: name); `regenerateApiCredentials()` / `regenerateSandboxApiCredentials()` / `revokeSandboxApiCredentials()` / `regenerateWebhookSecret()` / `regenerateSandboxWebhookSecret()` (each returns the **plaintext secret once** — caller must display once); `getLiveWebhookSigningSecret()` = webhook_secret ?: api_secret; `getSandboxWebhookSigningSecret()` = sandbox_webhook_secret ?: sandbox_api_secret; `allowedRedirectDomains()`, `isRedirectUrlAllowed(url)` (exact or subdomain match, case-insensitive). `created` hook: first admin inserts `installation_guards` row `primary_admin` (insertOrIgnore). Defaults: role merchant, is_active true, rotation random. | `db/migrations/001_create_users.sql` → Neon table `users` (same columns; `redirect_domains JSONB`, secrets `TEXT` encrypted with `ENCRYPTION_KEY`); `lib/auth/users.ts`, `lib/api-keys.ts` |
| `Order` (222) | `orders` | id; order_no varchar(32) unique (**route key**, `ORD`+16 random upper for live, `TST`+16 for sandbox); user_id FK cascade; payment_account_id FK cascade, **nullable after sandbox migration** (was NOT NULL originally); client_order_id varchar(64) (merchant's id; defaults to order_no if omitted); amount DECIMAL(12,2); status string default `pending` (`pending`\|`paid`\|`expired`\|`review`\|`failed`); environment varchar(16) default `live` (`live`\|`sandbox`); customer_name/email nullable; customer_mobile varchar(20) nullable; note nullable; redirect_url varchar(500) nullable; utr nullable (confirmed UTR); customer_utr varchar(40) nullable; utr_submitted_at timestamp nullable; utr_attempts tinyint unsigned default 0; review_note nullable; provider_txn_id nullable; provider_response JSON nullable; provider_checkout JSON nullable; verified_by nullable (`provider`\|`manual`→`utr_review`\|`sandbox`\|`admin_override`); paid_at nullable; expires_at nullable; original_expires_at nullable; last_checked_at nullable; sandbox_simulated_at nullable; webhook_event_sequence unsigned int default 0; verification_token varchar(64) nullable; verification_generation bigint unsigned default 0; verification_expires_at nullable; verification_pid bigint unsigned nullable; verification_started_at nullable; verification_node_id varchar(128) nullable; verification_node_instance_id varchar(64) nullable; verification_process_identity varchar(128) nullable; timestamps. Unique: `(user_id, environment, client_order_id)`; `(user_id, utr)`; indexes: `(status, expires_at)`, `(user_id, status, created_at)`, `(payment_account_id, status, paid_at)`, `(user_id, paid_at)`, `(user_id, customer_utr)`, `(user_id, environment, status, created_at)`. Casts: amount decimal:2, provider_response/provider_checkout array, datetimes, verification_generation integer. Constants: MAX_UTR_ATTEMPTS=3, UTR_GRACE_MINUTES=60. | belongsTo user, paymentAccount; hasMany webhookLogs; `isPending()`, `acceptsCustomerUtr()` (live + manual account + attempts<3 + pending **or** expired-within-60-min), `isPastExpiry()`, `originalExpiryDeadline()`, `isWithinLatePaymentGrace()` (grace hours, default 24), `canRecoverLatePayment()` (expired + live + in grace + account supports verification + account env live), `scopeRecoverableExpired()`; `upiIntentUrl(scheme='upi://pay')` — see §8; `paymentUrl()` (sandbox vs live route); `toApiArray()` — the canonical API/webhook shape (see §8). `creating` hook: fills expires_at/original_expires_at = now+expiry minutes if null. | `db/migrations/002_create_orders.sql` (+ alter migrations folded in) → Neon `orders` (`NUMERIC(12,2)`, `JSONB`, `TIMESTAMPTZ`, same uniques/indexes); `lib/orders/types.ts`, `lib/orders/intent.ts`, `lib/orders/serialize.ts` |
| `PaymentAccount` (161) | `payment_accounts` | id; user_id FK cascade; provider string (`paytm_business`\|`phonepe_pg`\|`paytm_pg`\|`manual`); label string; upi_id string nullable (NULL for hosted PGs); payee_name string; credentials text nullable **encrypted JSON**; is_active boolean default true; is_default boolean default false; daily_limit DECIMAL(12,2) nullable default 100000 (₹1,00,000); timestamps. Casts: credentials `encrypted:array`, booleans, daily_limit decimal:2. Hidden: credentials. | belongsTo user; hasMany orders; `PROVIDERS` map (label/verifier/hosted — see §3); `STATUS_VERIFIABLE_PROVIDERS = [paytm_business, paytm_pg, phonepe_pg]`; `supportsStatusVerification()`, `providerLabel()`, `isHosted()`, `environment()` (hosted: credential env else null), `paymentEnvironment()` (PGs: credential env → live/sandbox, unknown → null/fail-closed; paytm_business/manual → live), `scopeWithUsageToday()` (used_today = paid-today sum + open pending + review), `usedToday()`, `remainingToday()`, `canAccept(amount)`, `assertCompatibleWithOrder(order)`, `assertLiveProviderOrder(order, provider)` (both throw ValidationException), `verifier()` (instantiates mapped verifier), `credential(key)` | `db/migrations/003_create_payment_accounts.sql` → Neon `payment_accounts`; `lib/accounts.ts` |
| `WebhookLog` (35) | `webhook_logs` | id; order_id FK cascade; event string; event_id UUID nullable; url varchar(500); payload JSON; response_code smallint unsigned nullable; response_body text nullable (**always NULL by code — kept for migration safety, never written**); success boolean default false; attempt tinyint unsigned default 1; error_label varchar(32) nullable; timestamps. Indexes: `(order_id, event, success)`, `(event_id, success)`. Fillable includes response_body (legacy). | belongsTo order | `db/migrations/004_create_webhook_logs.sql` → Neon `webhook_logs` (`JSONB`, keep `response_body` column for compat but never write it) |
| `WebhookOutbox` (40) | `webhook_outbox` | id; event_id UUID **unique**; order_id FK **restrictOnDelete** (NOT cascade — deliberate); sequence unsigned int; transition_key varchar(100) **unique** (`paid:{orderId}` or `transition:{orderId}:{seq}`); event varchar(64); environment varchar(16); payload JSON **nullable after archive migration** (was NOT NULL); status varchar(16) default `pending` (`pending`\|`queued`\|`delivered`\|`failed`\|`blocked`); available_at nullable; claim_token UUID nullable; claimed_at nullable; queued_at nullable; delivered_at nullable; dispatch_attempts unsigned int default 0; delivery_attempts unsigned int default 0; last_error varchar(64) nullable; timestamps. Unique: (order_id, sequence); index `outbox_dispatch_due (available_at, id)`. `updating` hook throws if identity/snapshot fields change (immutable). `$guarded=['id']`. | belongsTo order | `db/migrations/005_create_webhook_outbox.sql` → Neon `webhook_outbox` (same uniques; `event_id UUID`, `payload JSONB`) |
| `AdminAuditLog` (48) | `admin_audit_logs` | id; admin_id bigint nullable, FK → users **nullOnDelete** (history survives admin deletion); actor_admin_id bigint nullable (snapshot of admin_id at creation — preserved even if the users row is gone; see migrations 2026-11-10/12); action varchar(64); subject_type varchar(64) nullable; subject_id bigint nullable; meta JSON nullable; ip varchar(45) nullable; created_at only (`UPDATED_AT=null`). Indexes: (admin_id, created_at), (subject_type, subject_id). Append-only: update/delete throw LogicException; creating hook copies admin_id → actor_admin_id. | belongsTo admin (User, admin_id) | `db/migrations/006_create_admin_audit_logs.sql` → Neon `admin_audit_logs` |
| `VerificationNode` (24) | `verification_nodes` | node_id varchar(128) **PK (string, non-incrementing)**; installation_id varchar(128); boot_id varchar(128); instance_id varchar(64); registered_at timestamp useCurrent; last_seen_at timestamp useCurrent; timestamps | No relations; `$guarded=[]` | `db/migrations/007_create_verification_nodes.sql` → Neon `verification_nodes` |
| `VerificationLeaseRecoveryAudit` (22) | `verification_lease_recovery_audits` | id; order_id bigint indexed (no FK); order_no varchar(32); previous_generation bigint; previous_node_id varchar(128) nullable; previous_node_instance_id varchar(64) nullable; previous_pid bigint nullable; previous_process_identity varchar(128) nullable; execution_token_hash varchar(64) (sha256, never the token); operator_identity varchar(190); reason text; outcome varchar(32); recovered_at timestamp useCurrent; timestamps. Append-only (update/delete throw). | None | `db/migrations/008_create_verification_lease_recovery_audits.sql` → Neon table of same name |

Plus archived tables (created by migration 2026-11-20, §5): `archived_webhook_logs`
(same 13 columns as webhook_logs, `id` bigint PK **preserved from source row**),
`archived_webhook_payloads` (id, event_id UUID unique, order_id FK cascade, payload
JSON, archived_at).

### 4.1 Policies / providers

- `app/Policies/PaymentAccountPolicy.php` — `update`/`delete`: `account.user_id === user.id`.
  Registered in `AppServiceProvider::boot` via `Gate::policy()`. Gate
  `manual-payment-override`: `user->isAdmin()`.
- `app/Providers/AppServiceProvider.php` — production hardening: forces
  `app.debug=false`, insecure webhooks/redirects off, **throws unless DB is MySQL**
  (must change: Neon Postgres), forces HTTPS + `URL::forceScheme('https')` when
  APP_URL is https or non-local; queue lifecycle logging (before/after/exception/failing).
  New: `lib/bootstrap.ts` / `middleware.ts` — enforce HTTPS + security headers,
  drop the MySQL-only throw.
- No other policies; order/account ownership is enforced inline in controllers
  (404 on mismatch) — port as helper `lib/auth/ownership.ts`.

---

## 5. Database — migrations, seeders, factories

**Target mapping (all tables):** plain SQL in `/db/migrations/`, Neon Postgres,
`@neondatabase/serverless` (`DATABASE_URL` env, pooled connection string supplied
by the user — never invented). File naming: fold the 24 Laravel migrations into
numbered SQL files in dependency order (`001_…` users, `002_…` payment_accounts,
`003_…` orders, `004_…` webhook_logs, `005_…` webhook_outbox,
`006_…` admin_audit_logs, `007_…` verification_nodes,
`008_…` verification_lease_recovery_audits, `009_…` installation_guards,
`010_…` archived_webhook_logs + archived_webhook_payloads, `011_…` indexes).
Keep a `schema_migrations` tracking table if the builder adds a runner (OPEN QUESTION).

### 5.1 Every migration (source file → final schema)

| # | Laravel migration | Effect (final state) | Postgres conversion notes | New file |
|---|---|---|---|---|
| 1 | `0001_01_01_000000_create_users_table.php` | `users` (see §4), `password_reset_tokens` (email PK, token, created_at), `sessions` (id PK string, user_id nullable indexed, ip_address varchar(45), user_agent text, payload longText, last_activity int indexed) | `users`: `id BIGSERIAL`, `role VARCHAR DEFAULT 'merchant'`, `api_secret TEXT` (encrypted), `redirect_domains JSONB`; `password_reset_tokens`/`sessions` — see §5.3 (no direct port) | `001_create_users.sql` |
| 2 | `0001_01_01_000001_create_cache_table.php` | `cache` (key PK, value mediumText, expiration int indexed), `cache_locks` (key PK, owner, expiration indexed) | NOT MIGRATABLE as tables — see §5.3 (Upstash/Vercel KV or Neon table `upi_cache` — OPEN QUESTION) | — |
| 3 | `0001_01_01_000002_create_jobs_table.php` | `jobs` (id, queue indexed, payload longText, attempts tinyint, reserved_at/available_at/created_at unsigned int), `job_batches`, `failed_jobs` (id, uuid unique, connection, queue, payload, exception longText, failed_at) | NOT MIGRATABLE as tables — queue becomes Vercel Cron + direct HTTP delivery (§10/§12); `failed_jobs` → Neon `upi_failed_jobs` only if the builder wants a dead-letter record (OPEN QUESTION) | — |
| 4 | `2026_09_25_000001_create_payment_accounts_table.php` | `payment_accounts` (see §4; `credentials` encrypted JSON text) | `credentials TEXT` (encrypted JSON string) or `BYTEA`; `daily_limit NUMERIC(12,2)` | `002_create_payment_accounts.sql` |
| 5 | `2026_09_25_000002_create_orders_table.php` | `orders` (base columns, see §4) + `webhook_logs` (base columns) | `amount NUMERIC(12,2)`, `provider_response/provider_checkout JSONB`, `order_no VARCHAR(32) UNIQUE`, `client_order_id VARCHAR(64)`, unique `(user_id, client_order_id)` (later replaced — see #12) | `003_create_orders.sql`, `004_create_webhook_logs.sql` |
| 6 | `2026_09_25_000003_add_rotation_and_daily_limits.php` | `users.rotation_mode` string default `random`; `payment_accounts.daily_limit` DECIMAL(12,2) nullable default 100000 | Fold into 001/002 | folded |
| 7 | `2026_09_25_000004_add_utr_review_to_orders.php` | `orders.customer_utr` varchar(40) nullable, `utr_submitted_at` nullable, `utr_attempts` tinyint default 0, `review_note` nullable; unique `(user_id, utr)`; index `(user_id, customer_utr)` | Fold into 003; Postgres unique index name `orders_user_id_utr_unique` (code checks this name in error strings — keep the name) | folded |
| 8 | `2026_09_25_000005_add_hosted_checkout_support.php` | `payment_accounts.upi_id` nullable; `orders.provider_checkout` JSON nullable | Fold into 002/003 | folded |
| 9 | `2026_11_06_000001_add_error_label_to_webhook_logs.php` | `webhook_logs.error_label` varchar(32) nullable | Fold into 004 | folded |
| 10 | `2026_11_06_000002_add_security_hardening_columns.php` | `users.redirect_domains` JSON nullable, `api_last_used_at` nullable, `api_last_used_ip` varchar(45) nullable; creates `admin_audit_logs` (see §4) | Fold into 001/006 | folded |
| 11 | `2026_11_08_000001_add_performance_indexes.php` | Indexes: orders `(user_id,status,created_at)`, `(payment_account_id,status,paid_at)`, `(user_id,paid_at)`; webhook_logs `(order_id,event,success)` | Postgres `CREATE INDEX` (same names where possible) | `011_indexes.sql` |
| 12 | `2026_11_09_000001_add_sandbox_environment.php` | `users.sandbox_api_key` unique nullable, `sandbox_api_secret` nullable, `sandbox_webhook_url` varchar(500) nullable; `orders.payment_account_id` nullable; `orders.environment` varchar(16) default `live`; `orders.sandbox_simulated_at` nullable; unique `(user_id, environment, client_order_id)` **replaces** `(user_id, client_order_id)`; index `(user_id, environment, status, created_at)` | Fold into 001/003 | folded |
| 13 | `2026_11_09_000002_create_installation_guards_table.php` | `installation_guards` (name varchar(64) PK, user_id bigint nullable, created_at nullable) — used for `primary_admin` guard | Neon table `installation_guards` (same shape) | `009_create_installation_guards.sql` |
| 14 | `2026_11_09_000003_make_orders_expires_at_nullable.php` | `orders.expires_at` nullable (was NOT NULL) | Fold into 003 | folded |
| 15 | `2026_11_10_000001_preserve_admin_audit_actor_history.php` | `admin_audit_logs.admin_id` nullable, FK → users **nullOnDelete** (was cascadeOnDelete) | Fold into 006 | folded |
| 16 | `2026_11_11_000001_create_webhook_outbox.php` | `orders.webhook_event_sequence` unsigned int default 0; `webhook_outbox` (see §4) with unique `event_id`, unique `transition_key`, unique `(order_id, sequence)`, index `outbox_dispatch_due (available_at, id)`, FK order_id **restrictOnDelete**; `webhook_logs.event_id` UUID nullable + index `(event_id, success)`. Migration is **idempotent/resumable** (checks `hasTable/hasColumn`, throws on unexpected schema — MySQL DDL commits per statement) | Neon: same uniques/indexes; `event_id UUID`, `payload JSONB`; keep the guard logic in the SQL comments, not as runtime code | `005_create_webhook_outbox.sql` |
| 17 | `2026_11_12_000001_preserve_admin_audit_actor_identifier.php` | `admin_audit_logs.actor_admin_id` bigint nullable | Fold into 006 | folded |
| 18 | `2026_11_13_000001_add_verification_concurrency_lock_to_orders.php` | `orders.verification_token` varchar(64) nullable, `verification_generation` bigint default 0, `verification_expires_at` nullable, `verification_pid` bigint nullable, `verification_started_at` nullable | Fold into 003 | folded |
| 19 | `2026_11_14_000001_bind_verification_lease_to_process_identity.php` | `orders.verification_node_id` varchar(128) nullable, `verification_process_identity` varchar(128) nullable | Fold into 003 | folded |
| 20 | `2026_11_15_000001_register_verification_nodes_and_recoveries.php` | `orders.verification_node_instance_id` varchar(64) nullable; creates `verification_nodes`, `verification_lease_recovery_audits` (see §4) | Fold into 003/007/008 | folded |
| 21 | `2026_11_16_000001_add_original_expires_at_to_orders.php` | `orders.original_expires_at` timestamp nullable | Fold into 003 | folded |
| 22 | `2026_11_17_000001_add_webhook_signing_secrets_to_users.php` | `users.webhook_secret` text nullable (encrypted), `users.sandbox_webhook_secret` text nullable (encrypted) | Fold into 001 | folded |
| 23 | `2026_11_20_000001_create_archived_webhook_records.php` | Creates `archived_webhook_logs` + `archived_webhook_payloads` (see §4); makes `webhook_outbox.payload` nullable | Neon tables `archived_webhook_logs` / `archived_webhook_payloads` | `010_create_archived_webhook_records.sql` |

Final table list (Neon, 12 business tables): `users`, `payment_accounts`, `orders`,
`webhook_logs`, `webhook_outbox`, `admin_audit_logs`, `verification_nodes`,
`verification_lease_recovery_audits`, `installation_guards`,
`archived_webhook_logs`, `archived_webhook_payloads` (+ optionally
`password_reset_tokens` — see §5.3 — and `upi_login_attempts` if the builder
chooses a Neon table for login lockout).

### 5.2 MySQL → Postgres conversions (checklist for the backend builder)

- `id()` (bigint unsigned auto-increment) → `BIGSERIAL PRIMARY KEY` (or
  `BIGINT GENERATED ALWAYS AS IDENTITY`).
- `string` (varchar 255 default) → `VARCHAR(n)` with the same lengths; `text` /
  `mediumText` / `longText` → `TEXT` (Postgres has no medium/long distinction).
- `decimal(12,2)` → `NUMERIC(12,2)`; `unsignedTinyInteger`/`unsignedInteger`/
  `unsignedBigInteger` → `SMALLINT`/`INTEGER`/`BIGINT` with `CHECK (>= 0)` if the
  builder wants the unsigned guarantee (Postgres has no unsigned ints).
- `json` → `JSONB`; `boolean` → `BOOLEAN`; `timestamp` → `TIMESTAMPTZ`
  (Laravel stores UTC; app timezone is `Asia/Kolkata` — keep UTC in DB, convert
  at display; `DATE(paid_at)` grouping in the dashboard must use IST day
  boundaries — see §11).
- `foreignId()->constrained()->cascadeOnDelete()` → `BIGINT REFERENCES … ON DELETE CASCADE`;
  `webhook_outbox.order_id` is `ON DELETE RESTRICT` (deliberate); `admin_audit_logs.admin_id`
  is `ON DELETE SET NULL`.
- `rememberToken()` → `VARCHAR(100)` nullable (only if sessions are kept — see §5.3).
- `unique(['user_id','environment','client_order_id'])` — Postgres unique index,
  name it `orders_user_environment_client_unique`; keep `orders_user_id_utr_unique`.
- `Schema::table()->change()` (e.g. `upi_id` nullable, `expires_at` nullable) has
  no meaning in fresh SQL — fold the final nullability in.
- MySQL `utf8mb4_unicode_ci` collation → Postgres default collation; case-insensitive
  email lookups must use `LOWER(email)` / `citext` if the builder wants exact parity
  (Laravel MySQL `where('email', …)` is case-insensitive by collation; Postgres is not).
- `DB::raw('COALESCE(original_expires_at, …)')`, `orderByRaw('CASE WHEN …')`,
  `whereRaw('1 = 0')` — rewrite as plain SQL in Neon queries.
- No MySQL `ENUM` is used (status/provider/environment are plain strings) — keep
  them strings in Postgres; do not introduce enums (new statuses would need DDL).

### 5.3 Laravel framework tables — what replaces them (NOT MIGRATABLE as tables)

| Laravel table | Used for | Neon / Vercel replacement | New architecture |
|---|---|---|---|
| `sessions` | DB session driver (`SESSION_DRIVER=database`, `SESSION_ENCRYPT=true`, 120-min lifetime) | No server-side session table in Neon by default. Options: (a) stateless JWT/session cookie (iron-session / Auth.js) — OPEN QUESTION; (b) Neon `sessions` table with same columns (payload encrypted) — only if the builder chooses DB sessions | OPEN QUESTION — decide in backend build; see §7 |
| `cache` / `cache_locks` | `CACHE_STORE=database`, `CACHE_LIMITER=database`; locks for scheduler (`scheduler:orders:check-pending`), verification (`order-verification:{id}`), webhook delivery (`webhook-delivery:{event_id}`), login lockout/fail counters, API `api_track:{merchant}` (1-min), PhonePe token cache (`phonepe_token:…`) | Upstash Redis / Vercel KV (recommended — locks need TTL + atomicity) or a Neon `upi_cache` table (key PK, value TEXT, expiration INT) — OPEN QUESTION. **PhonePe OAuth token cache must survive across invocations** (15-min TTL, keyed by hash of client_id+secret — see §9) | `lib/cache.ts` (Upstash) or `db/migrations/012_create_cache.sql` |
| `jobs` / `job_batches` / `failed_jobs` | DB queue (`QUEUE_CONNECTION=database`): only job is `SendWebhook` (§10) | No queue worker on Vercel. Webhook delivery becomes: outbox dispatcher cron → direct HTTP POST in the cron invocation (with the same retry/backoff accounting in `webhook_outbox`), or Vercel Queue / QStash — OPEN QUESTION | `lib/webhooks/dispatch.ts` + Vercel Cron |
| `password_reset_tokens` | Password-reset broker (`auth.passwords.users`, table `password_reset_tokens`) | **No reset flow exists in the app** (no routes, no mail). Do NOT invent one. If a reset is added later, it needs its own table + mail provider. | NOT MIGRATABLE — no equivalent; do not create the table unless a reset flow is separately approved |

### 5.4 Data-layer OPEN QUESTIONS (backend builder must answer before building)

1. **Transactions over the Neon HTTP driver.** Laravel relies on `DB::transaction`
   + `lockForUpdate()` in `OrderService::markPaid/expire/adminOverridePaid`,
   `submitCustomerUtr/approveCustomerUtr/rejectCustomerUtr`, `simulateSandbox`,
   `WebhookOutboxService::record` (must run inside the order transaction),
   `CheckoutController::start`, and `PaymentAccountController::makeDefault`.
   `@neondatabase/serverless` `transaction()` runs multiple statements in one
   HTTP request but does **not** hold a connection across awaits the way
   `node-postgres` does. The builder must prove (with a test) that
   `SELECT … FOR UPDATE` + conditional `UPDATE` + outbox `INSERT` is atomic under
   the HTTP driver, or redesign those flows as single-statement conditional
   updates / Postgres functions. **This is the highest-risk item in the migration.**
2. **Cache/lock backend** (§5.3) — Upstash vs Neon table vs Vercel KV.
3. **Session store** (§7) — stateless vs Neon `sessions` table.
4. **Migration runner** — RESOLVED in scope (2026-11-11): migrations in
   `/db/migrations/` run against the **real** Neon database (branch `production`)
   before/during the build, via `psql` / a `scripts/migrate.ts` using the
   supplied `DATABASE_URL` (transient `.env.local`, never committed). Remaining
   detail for the backend builder: exact command + whether it also runs on
   Vercel deploy (deploy hook) or is a manual pre-deploy step.

### 5.5 Seeders / factories

- `database/seeders/DatabaseSeeder.php` (25 lines) — creates **one** user:
  `Test User <test@example.com>` (factory password `password`). Everything else
  commented out. New: `db/seed.sql` (optional, dev only) — same single test user
  with a bcrypt hash; **never run in production**.
- `database/factories/UserFactory.php` (45 lines) — Faker name/unique safe email,
  `email_verified_at=now()`, password `password` (cached hash), `remember_token`
  random 10, `unverified()` state (email_verified_at null). New: `db/seed.ts` /
  test fixtures in `tests/` — only for tests, not shipped.


---

## 6. Middleware (8 custom files, `app/Http/Middleware/` + `bootstrap/app.php`)

| Middleware | What it checks / does | Where applied | New architecture |
|---|---|---|---|
| `AuthenticateApiKey` (116) — alias `api.key` | Headers `X-Api-Key`/`X-Api-Secret`; env from key prefix (`test_key_` → sandbox, else live); looks up `api_key`/`sandbox_api_key`; `hash_equals` on the (decrypted) secret — **constant-time**; 401 invalid, 403 disabled merchant; per-key limit (default 120/min, order-create 1000/min via `api.key:order_create` scope) + per-IP limit 600/min + failed-auth per-IP limit 30/min (429 with `Retry-After`, `X-RateLimit-Limit/Remaining`); sets `X-Request-Id` (UUID) on every response; updates `api_last_used_at/ip` at most once/min (cache-gated); sets request user + `payment_environment` attribute | `routes/api.php` v1 group | `middleware.ts` (route matcher `/api/v1/*`) + `lib/api-auth.ts` — rate-limit state in Upstash/Neon (see §5.3); keep header names, buckets, limits, and `X-Request-Id` |
| `EnsureActive` — alias `active` | Logged-out + session invalidated + redirected to login with "Your account has been disabled" if `!user.is_active` | All authed web routes | Server-component guard / `middleware.ts` — check `is_active` on every authed page + API route |
| `EnsureAdmin` — alias `admin` | 403 unless `user.isAdmin()` | `/admin/*` | Same guard in admin layout + API routes |
| `RedirectToInstall` | Web+API prepend; skips `__upi_deployment_check`; installer paths use **file sessions** (DB sessions table may not exist yet); if not installed → redirect `install.index` (or 503 JSON if `expectsJson`) | Global web+api | `middleware.ts` — if Neon `installation_guards`/`users` check says not installed → redirect `/install`; OPEN QUESTION: how "installed" is detected on Neon (a `upi_meta` / `installation_guards` row vs env flag `INSTALLED=true`) |
| `RedirectIfInstalled` | If installed (and not `install.done` with `installer.completed` in session) → redirect home | `/install/*` group | Same logic in `app/install/*` layout |
| `SecurityHeaders` (122) | Per-request CSP nonce (shared as `csp_nonce`); HSTS (if secure, `max-age=31536000; includeSubDomains`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`; CSP: `default-src 'self'; script-src 'self' 'nonce-…'; style-src 'self' 'unsafe-inline' fonts.googleapis.com; font-src 'self' fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; form-action 'self' + PG hosts (Paytm sandbox+prod, PhonePe api-preprod + api.phonepe.com); frame-ancestors 'none'; base-uri 'self'; object-src 'none'`; enforcing vs report-only via `GATEWAY_CSP_ENFORCE` | Appended to web group | `next.config.ts` `headers()` + per-route nonce in `middleware.ts` — keep the same directives; form-action hosts must include the PG checkout hosts |
| `SetDeploymentBasePath` (36, global prepend) | Subdirectory installs: base path from `APP_URL` path (or `SCRIPT_NAME` pre-install); 404s any request outside the base; rewrites `SCRIPT_NAME/PHP_SELF/SCRIPT_FILENAME` to `index.php` | Global | NOT MIGRATABLE — Vercel serves at the deployment URL / custom domain; no subdirectory mount. If a sub-path deploy is needed, use Next.js `basePath` — OPEN QUESTION |
| `TrustConfiguredProxies` (21) | Sets trusted proxies from `TRUSTED_PROXIES` env (comma IPs/CIDRs, never `*`); trusts `X-Forwarded-For` + `X-Forwarded-Proto` | Replaces Laravel `TrustProxies` globally | NOT MIGRATABLE as code — Vercel's proxy is trusted by the platform; `x-forwarded-for` handling is in `lib/rate-limit.ts` / `getClientIp()`; keep the "never trust `*`" rule in docs |
| Laravel built-ins (via `bootstrap/app.php`) | `AuthenticateSession` (web append, **after** StartSession+Auth): invalidates sessions whose stored password hash differs from DB — covers password change **and** API-key regeneration (which bumps the password column); `ThrottleRequests` (route `throttle:X,1`); CSRF (`validateCsrfTokens`, except `pay/*/return`, `install.php`) | Global | Session invalidation on password change must be re-implemented in the chosen session design (§7); CSRF: Next.js Server Actions have built-in CSRF origin checks — keep the `pay/*/return` exemption equivalent (PG POSTs from its own domain, no CSRF token possible) |

---

## 7. Auth flows

| Flow | Source behaviour | New architecture |
|---|---|---|
| **Login** | Session (cookie) auth, `Auth::attempt(email, password, remember)`; bcrypt; lockout per §3; session regenerate on success; `redirect()->intended(dashboard)`; disabled account rejected after auth | `app/(auth)/login/page.tsx` + `app/api/auth/login/route.ts`; session mechanism OPEN QUESTION (§5.3): iron-session / Auth.js credentials provider / Neon `sessions` table. Must preserve: lockout counters, generic error, disabled-account rejection, session regeneration |
| **Logout** | POST `/logout`; invalidate + CSRF rotate → login | `app/api/auth/logout/route.ts` (POST) |
| **Registration** | **OFF by default** (`ALLOW_REGISTRATION=false`, `config/auth.php: allow_registration`); route 404s when off; when on: merchant role only, API creds auto-generated, → `accounts.create` | Keep the flag (`ALLOW_REGISTRATION` env, default false); `app/(auth)/register/page.tsx` 404s when off |
| **Password change** | `PUT /settings/password`; min 10, confirmed, uncompromised-in-prod; current password verified; `logoutOtherDevices` kills other sessions + rotates remember_token; session regenerate | `app/api/settings/password/route.ts` (PUT) — must invalidate other sessions under the chosen session design |
| **Password reset** | **Does not exist.** `password_reset_tokens` table exists, `auth.passwords` broker configured, but **no routes, no controller, no mail is wired** (`MAIL_MAILER=log`). | NOT MIGRATABLE — do not invent a reset flow. If the user later asks, it needs a mail provider + new routes (separate approval) |
| **Confirm password** | `GET/POST /confirm-password`; 5/min per user; sets `auth.password_confirmed_at`; session regenerate; gates `/admin/*` for 900 s | `app/(auth)/confirm-password/page.tsx` + API route; store `passwordConfirmedAt` in the session |
| **Session handling** | DB sessions, `SESSION_DRIVER=database`, `SESSION_LIFETIME=120` min, `SESSION_ENCRYPT=true` (encrypt at rest), `SESSION_SECURE_COOKIE=true`, `SESSION_HTTP_ONLY=true`, `SESSION_SAME_SITE=lax`, `SESSION_PATH=/` (or sub-path), cookie name `slug(APP_NAME)-session`; `AuthenticateSession` hash check (see §6) | OPEN QUESTION (§5.3). Whatever is chosen must provide: HttpOnly + Secure + SameSite=lax cookies, 120-min lifetime, encryption at rest if DB-backed, invalidation on password change |
| **API-key auth** | `X-Api-Key` + `X-Api-Secret` headers (§6); key prefix selects env; `key_`/`sec_` live, `test_key_`/`test_sec_` sandbox; secrets stored **encrypted** in `users.api_secret`/`sandbox_api_secret`; regeneration invalidates the old pair immediately; `api_last_used_at/ip` tracked | `lib/api-auth.ts` — same header names, same prefixes, same constant-time compare, same rate limits |
| **Roles** | `users.role`: `admin` \| `merchant` (string, default merchant). Admins: manage merchants, view all orders (read-only), transaction debugger, manual-payment override (Gate `manual-payment-override`), create-admin CLI. Merchants: only their own accounts/orders (404 otherwise); **admins cannot mutate merchant orders** (owner-only writes). First admin created by installer / `app:create-admin`; `installation_guards.primary_admin` records the first admin's id | Same two roles in Neon `users.role`; enforce in `middleware.ts` + per-route checks; `lib/auth/roles.ts` |
| **First-run / install wizard** | Two entry points: (a) Laravel wizard `GET /install…` (`InstallController`, §1/§3) — requirements → database → migrate → admin → done, gated by `RedirectIfInstalled`/`RedirectToInstall`, one-time setup token (`storage/installer-setup-token`, TTL 3600 s, `sha256(token):timestamp` record), setup lock file, `storage/installed` marker file, file-based sessions during install; (b) standalone native `install.php` (886 lines, no Laravel boot) for cPanel — same 5 steps (`?step=requirements|database|migrate|admin|done`), own CSRF (`$_SESSION['_installer_csrf']`), own diagnostic token, renders `install.hosting-check` + inline forms, writes `.env` itself. `InstallationManager` (1,660 lines, 40+ methods — see §13) does: requirements checks (PHP/extensions/dirs — §2), server-readiness (PHP handler classification: FPM/CLI/built-in/LSAPI/CGI/mod_php/phpdbg/embed), env detection (Cloudflare `HTTP_CF_VISITOR`, trusted proxies), URL detection, setup-token create/validate/consume (single-use), DB connection test, `.env` write (atomic via temp file), `migrate --force`, admin creation, `markInstalled()` (writes `storage/installed` + `installation_guards.primary_admin`), `isInstalled()` (marker file + migrated + admin exists). `config/installer.php`: env_path, installed_path, setup_lock_path, in_progress_path, setup_token_path, setup_token_ttl 3600, allow_remote_db (default false — DB host must be local unless `INSTALLER_ALLOW_REMOTE_DB=true`). | `app/install/*` wizard (see §1/§2) + `lib/install/manager.ts`. **NOT MIGRATABLE:** PHP requirements checks, `.env` file writes, `storage/*` marker/lock/token files, native `install.php` (no PHP on Vercel). Replace "installed" detection with a Neon check (e.g. `installation_guards` row / `users` admin exists) or an env flag — OPEN QUESTION. Setup-token single-use semantics must be preserved (store token hash + expiry in Neon, not the filesystem). The installer must not be reachable after install. |

---

## 8. Payment flows (`app/Services/OrderService.php`, 951 lines — the core)

**Order number:** live `ORD` + 16 random uppercase alphanumerics; sandbox `TST` + 16.
`client_order_id` defaults to `order_no` if omitted. Expiry: `now() + GATEWAY_ORDER_EXPIRY_MINUTES`
(default 15 min), stored in both `expires_at` and `original_expires_at` at creation.

| Flow / method | Behaviour (exact) | New architecture |
|---|---|---|
| `create(merchant, data, env=live)` | Sandbox → `createSandbox()` (rejects `payment_account_id`, no account). Live: txn locks the merchant row (`lockForUpdate`) → `resolveAccount()` → locks account row → `createFor()` (saves order, `assertCompatibleWithOrder`). | `lib/orders/create.ts` — Neon txn (see §5.4 Q1) |
| `resolveAccount(merchant, amount, accountId?)` | Explicit id: must exist, be live-compatible, active, within daily limit, Paytm Business not disabled — **never silently falls back**. No id: active accounts with live env + room today; `rotation_mode=random` → random pick; `default` → default account first, then lowest id. Errors: "Add an active Live payment account…", "All UPI accounts have reached their daily limit…". | `lib/orders/resolve-account.ts` |
| Account rotation + daily limits | `used_today` = paid-today sum + open pending + review (see §4); `canAccept(amount)` = daily_limit null OR used+amount ≤ limit; default limit ₹1,00,000 per account | Same SQL in `lib/accounts/usage.ts` (Neon aggregation; IST day boundary — see §11) |
| `upiIntentUrl()` (`Order` model) | `upi://pay?pa={upi_id}&pn={payee_name}&am={amount 2dp}&cu=INR` + `tr={order_no}` **only for non-manual accounts** (manual/P2P omits `tr` per NPCI guidance — consumer UPI apps reject it) + `tn={note ?: order_no}`; RFC3986 encoding | `lib/orders/intent.ts` — byte-identical params/order |
| Dynamic QR | `GET /pay/{order}/qr.svg` — BaconQrCode SVG 320px of the intent URL; pending + non-hosted only | `app/api/pay/[orderNo]/qr/route.ts` (JS QR lib, same 320px, `image/svg+xml`, `private, max-age=600`) |
| Hosted checkout (`CheckoutController::start` + `HostedCheckout::startCheckout`) | PG accounts only; cached `provider_checkout` JSON on the order reused while `expires_at > now+30s` and same account/env/provider; else provider `startCheckout(order, returnUrl)`; PhonePe → `{type:redirect, url, expires_at}`; Paytm PG → `{type:form, url, fields:{mid,orderId,txnToken}, expires_at: now+14min}`; checkout URL must be https, form must have fields array, else RuntimeException → back to pay page with error | `lib/checkout/start.ts` + `app/api/pay/[orderNo]/start/route.ts` |
| `check(order, force=false)` | Cache lock `order-verification:{id}` (lease seconds, default 120) → `acquireVerificationLease()` (DB lease, see below) → `checkWithoutOverlap()`. Throttle: at most once per `check_interval_seconds` (3 s) per order unless forced. Sandbox: no provider call — expire if past expiry, else return. Live: validate account; if past expiry **and** outside late grace → `expire()` without a provider call; else claim (lease token+generation+node+pid+identity + status pending + throttle window) → `verifier->check()` → if paid `markPaid()`; if past expiry → `expire()`. Expired orders → `checkLatePayment()`. Null `expires_at` (legacy rows) → `repairNullExpiry()` (fresh expiry, `COALESCE(original_expires_at, …)`). | `lib/orders/check.ts` — same state machine; cache lock via §5.3 backend |
| Verification lease (`acquire/release/ownsVerificationLease`, `VerificationLease` value object) | DB lease on the order row: `verification_token` (UUID), `verification_generation` (+1), `verification_started_at`, `verification_expires_at` (+`verification_lease_seconds`, default 120), `verification_pid` (PHP `getmypid()`), `verification_node_id`, `verification_node_instance_id`, `verification_process_identity`. Takeover of an expired lease only if `VerificationProcessInspector` says the owner is DEAD (same-node `ps` check; cross-node liveness is **not guessed** — operator recovery via `orders:recover-verification-lease`). `markPaid`/`expire` require owning the lease (token+generation+node+instance+pid+identity all match) or they no-op/log "Stale verification owner". | **OPEN QUESTION — highest risk after §5.4 Q1.** Serverless has no stable PID/process identity and no long-lived process. Options: (a) drop PID/process-identity, keep token+generation+expiry in Neon and treat any expired lease as takeable; (b) replace with a Neon advisory lock / Upstash lock. The `orders:recover-verification-lease` operator flow and `verification_lease_recovery_audits` table must be re-decided with it. Do not silently keep `verification_pid` semantics that cannot exist on Vercel. |
| `markPaid(order, verification, lease)` — **the security core** | Requires a lease + `verification.paid`. Inside a txn (locks user row + order row + account row): re-validates **everything** — provider ∈ {paytm_business, paytm_pg, phonepe_pg} and matches account, `verification.paymentAccountId === account.id`, env live on both sides, `orderId/orderNumber` match, currency INR, `verifiedAt` present and not future, UTR or txnId present, **verified amount string-equals order amount** (`number_format 2dp`), `originalExpiresAt` timestamp-equals the order's `originalExpiryDeadline()`, timestamp required if `evidence_require_timestamp` (default true), `occurredAt` not future beyond clock-skew (300 s), not older than `evidence_max_age_seconds` (86,400 s / 24 h), not before order `created_at` − skew, not after `originalExpiresAt + late_grace_hours (24) + skew`; status must be pending/expired (paid → idempotent no-op); UTR uniqueness via `ensureUtrUnused()` + unique `(user_id, utr)` index (race → ValidationException "This UTR is already used…"); sets status paid, utr, provider_txn_id, provider_response (raw), verified_by=`provider`, paid_at = `occurredAt` (provider time, not now), review_note null, clears all lease fields; records `order.paid` outbox event **in the same txn**. | `lib/orders/mark-paid.ts` — port every check, in the same order, as Neon txn / conditional SQL. **Never mark paid on frontend/UTR alone** (user requirement). |
| `expire(order, lease)` | Requires lease; txn locks order row; only from pending; clears lease; records `order.expired` outbox event in-txn | `lib/orders/expire.ts` |
| Late-payment recovery (`checkLatePayment`, `Order::canRecoverLatePayment`, `scopeRecoverableExpired`) | Expired orders within `late_payment_grace_hours` (default 24, 0 disables) are re-checked (throttled ≥120 s, default 300 s) by the scheduler and by checkout-page visits; only if the account `supportsStatusVerification()` and is live; same `markPaid` evidence binding applies (occurredAt must be ≤ original expiry + grace + skew). Expired + outside grace → `expire()` without a provider call. | `lib/orders/late-payment.ts` — same windows; scheduler phase 2 (§1.3) |
| Order expiry | Pending + past `expires_at` → expired on next `check()` (poll/scheduler/return); `original_expires_at` is never extended (reject-UTR grants a **fresh `expires_at`** but keeps the original deadline for evidence binding) | Same |
| UTR review flow (`submitCustomerUtr` / `approveCustomerUtr` / `rejectCustomerUtr`) | Customer: only live + manual account + attempts < 3 + pending or expired-within-60-min (`acceptsCustomerUtr()`); UTR normalised (whitespace stripped, uppercased); `ensureUtrUnused()`; txn locks user+order rows; status → `review`, `customer_utr`, `utr_submitted_at=now`, `utr_attempts+1`, review_note null; records `order.under_review`. Merchant approve: only from `review`; `received_amount` must equal order amount exactly; `bank_utr` must `hash_equals` the submitted `customer_utr` (matching UTR alone is **not** proof — the merchant must have verified it in their bank app); `ensureUtrUnused()`; status → paid, `verified_by=utr_review`, `paid_at=now`; records `order.paid`. Merchant reject: only from `review`; if attempts remain → status pending + **fresh expiry** + review_note (default "UTR … was not found in the merchant's account."); if exhausted → expired + records `order.expired`. Approve/reject race prevented by row lock. | `lib/orders/utr.ts` — same rules; `hash_equals` → Node `crypto.timingSafeEqual` |
| Admin override (`adminOverridePaid`) | Live orders only; not already paid; submitted amount must equal order amount; `ensureUtrUnused(reference)`; status → paid, utr = provider_txn_id = reference (uppercased), `verified_by=admin_override`, paid_at now; `AdminAuditLog` row (`order_manual_payment_override`, order_no, merchant_id, amount, verification_reference, reason, admin id, IP); records `order.paid` | `lib/orders/admin-override.ts` |
| Sandbox (`createSandbox`, `simulateSandbox`) | Sandbox orders have **no payment account**; order_no `TST…`; `simulateSandbox(outcome)` — one simulation only (`sandbox_simulated_at` must be null, else 422); outcomes: success → paid, utr `TEST`+16 random, provider_txn_id `TEST_TXN_`+12, paid_at now, `verified_by=sandbox`, event `order.paid`; failed → status failed, event `order.failed`; expired → expired, `order.expired`; timeout → status unchanged (stays pending), event `order.timeout` (HTTP 504 to the caller); pending → unchanged, event `order.pending`; `invalid_reference` → 422 "The simulated transaction reference is invalid." (no state change). `provider_response = {simulated:true, environment:sandbox, outcome}`. Sandbox orders never contact a provider and never use live `markPaid`. | `lib/orders/sandbox.ts` — same outcomes, same one-shot rule, same fake `TEST…` refs |
| `toApiArray()` (canonical shape) | `{order_id, client_order_id, amount (decimal string), currency:'INR', status, verified_by, environment, test (env==sandbox), utr, submitted_utr (only when review), payment_url, upi_intent (null for sandbox or hosted), customer:{name,email,mobile}, paid_at/expires_at/original_expires_at/created_at (ISO-8601)}` — used by API responses **and** webhook payloads (`data` field) | `lib/orders/serialize.ts` — byte-compatible shape |
| Redirect after payment | `redirect_url` (if set) + `?order_id&client_order_id&status`; host re-validated against the merchant's allowlist **at redirect time**; http only if `GATEWAY_ALLOW_INSECURE_REDIRECTS` (forced false in production) | `lib/orders/redirect.ts` |


---

## 9. Verifiers (`app/Services/Verifiers/`, 7 files)

Common contract — `Verifier` interface: `check(Order): VerificationResult`;
**must never throw for "not paid yet"** — return `VerificationResult::pending(raw?)`.
`VerificationResult` (171 lines): `paid` bool, `utr`, `txnId`, `raw`, `provider`,
`orderId`, `orderNumber`, `amount` (2dp string), `currency`, `verifiedAt`,
`paymentAccountId`, `environment`, `originalExpiresAt`, `occurredAt`. Provider-bound
factories only (`fromPaytmBusiness` / `fromPaytmPg` / `fromPhonePePg` — no generic
success factory, by design); success **requires** a UTR or txnId (else
InvalidArgumentException); `occurredAt` is extracted from the raw provider payload
if not passed, else `verifiedAt`/now. Timestamp parsing (`parseProviderTimestamp`):
≥12-digit all-numeric → milliseconds epoch; 10-digit → seconds epoch; trailing
`Z`/offset → parse as UTC; else `Y-m-d H:i:s` in `provider_timezone` (default
`Asia/Kolkata`) → UTC; strip fractional seconds first. Per-provider raw-timestamp
keys: Paytm Business `TXNDATE`/`TXNDATETIME`/`txnDate`; Paytm PG `txnDate`/`TXNDATE`/
`body.txnDate`; PhonePe first `COMPLETED` entry in `paymentDetails` → `completedAt`/
`timestamp`, else top-level `completedAt`/`timestamp`. All three verifiers apply the
same post-checks before returning paid: response order-id == our `order_no`,
**amount in paise exactly equals order amount** (`toPaise = round(amount*100)`,
Paytm amounts also regex `^\d+(\.\d{1,2})?$`; PhonePe amount must be `ctype_digit`
paise), currency INR, UTR-or-txnId present, `occurredAt` present if
`evidence_require_timestamp` (else pending with code `invalid_timestamp`).
Errors are **never thrown for not-paid**; transport errors → `pending({error, code})`
with a categorised code and no credentials in logs (MID/secret/full body never logged).

| Verifier | Provider endpoints called | Credentials needed (per-account `credentials` JSON, encrypted) | How it verifies | Paid vs not-paid | New architecture |
|---|---|---|---|---|---|
| `ManualVerifier` (17) | None | None | Always pending — merchant confirms via UTR review (§8) | Never paid by itself | `lib/verifiers/manual.ts` |
| `PaytmBusinessVerifier` (187) | `GET {PAYTM_STATUS_URL}` — default `https://securegw.paytm.in/merchant-status/getTxnStatus`, query `JsonData=json_encode({MID, ORDERID: order_no})`, timeout 10 s, `Accept: application/json`. **Unofficial endpoint** — may change without notice; feature-flagged by `GATEWAY_ENABLE_PAYTM_BUSINESS` (default true; when false, new accounts + verifications blocked with code `disabled`). | `mid` only | Response JSON: `STATUS === 'TXN_SUCCESS'` **and** `ORDERID === order_no` **and** `TXNAMOUNT` paise == order **and** `CURRENCY` (default INR) === INR **and** `BANKTXNID` or `TXNID` non-empty **and** timestamp present (`TXNDATE`/`TXNDATETIME`) if required → `fromPaytmBusiness(amount: TXNAMOUNT, utr: BANKTXNID, txnId: TXNID, raw: data minus MID/mid)`. Anything else → pending (codes: `missing_mid`, `order_id_mismatch`, `amount_mismatch`, `currency_mismatch`, `missing_reference`, `invalid_timestamp`; transport: `timeout`, `connection_failed`, `http_error`, `verification_error`). | Paid only on all checks passing; every failure mode is pending, never an exception | `lib/verifiers/paytm-business.ts` |
| `PaytmPgVerifier` (169) + `HostedCheckout` | Base URL from `gateway.paytm_pg.{sandbox\|production}` (defaults `https://securestage.paytmpayments.com` / `https://secure.paytmpayments.com`, overridable `PAYTM_PG_SANDBOX_URL` / `PAYTM_PG_PRODUCTION_URL`). `startCheckout`: `POST {base}/theia/api/v1/initiateTransaction?mid=…&orderId=…` (signed, see below) body `{requestType:'Payment', mid, websiteName (default DEFAULT/WEBSTAGING), orderId, callbackUrl: returnUrl, txnAmount:{value 2dp, currency:'INR'}, userInfo:{custId:'CUST{userId}X{orderId}', mobile?, email?}}` → needs `body.txnToken` + `body.resultInfo.resultStatus === 'S'` else RuntimeException; returns `{type:'form', url:'{base}/theia/api/v1/showPaymentPage?mid=…&orderId=…', fields:{mid, orderId, txnToken}, expires_at: now+14min}`. `check`: `POST {base}/v3/order/status` signed body `{mid, orderId}` → `body.resultInfo.resultStatus === 'TXN_SUCCESS'`, `body.orderId === order_no`, `body.txnAmount` paise == order, currency INR, `body.bankTxnId` or `body.txnId` present, timestamp (`body.txnDate`) if required → `fromPaytmPg(amount: txnAmount, utr: bankTxnId, txnId, raw: body)`. HTTP timeout 15 s. | `mid`, `merchant_key`, `website_name`, `environment` (`sandbox`\|`production`) | Signed POST (see PaytmChecksum below); response checks as in the table intro | Paid only on `TXN_SUCCESS` + all bindings; else pending (raw `body` as pending payload) | `lib/verifiers/paytm-pg.ts` |
| `PhonePePgVerifier` (205) + `HostedCheckout` | URLs from `gateway.phonepe_pg`: sandbox token `https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token`, base `https://api-preprod.phonepe.com/apis/pg-sandbox`; production token `https://api.phonepe.com/apis/identity-manager/v1/oauth/token`, base `https://api.phonepe.com/apis/pg`. `startCheckout`: `POST {base}/checkout/v2/pay` (OAuth `O-Bearer` token) body `{merchantOrderId: order_no, amount: paise (int), expireAfter: clamp(secondsLeft, 300, 3600), paymentFlow:{type:'PG_CHECKOUT', message: note ?: 'Payment for {client_order_id}', merchantUrls:{redirectUrl: returnUrl}}, metaInfo:{udf1: client_order_id}}` → needs `redirectUrl` else RuntimeException; returns `{type:'redirect', url: redirectUrl, expires_at: expireAt/1000 ?: now+15min}`. `check`: `GET {base}/checkout/v2/order/{order_no}/status?details=false` → `state === 'COMPLETED'`, `merchantOrderId === order_no` (**not** `orderId` — that's PhonePe's internal id), `amount` (paise int) == order paise, currency INR, first COMPLETED `paymentDetails` entry's `rail.utr` or `transactionId`/`orderId` present, timestamp if required → `fromPhonePePg(amount: amount/100, utr: rail.utr, txnId: transactionId ?: orderId, raw: data)`. OAuth: `POST {token_url}` form `{client_id, client_version, client_secret, grant_type:'client_credentials'}` → `access_token`; cached (key `phonepe_token:{sha256(client_id+client_secret)}`, TTL `expires_at - now - 60`, min 60 s); on 401 refresh once and retry. HTTP timeout 15 s. | `client_id`, `client_secret`, `client_version`, `environment` | OAuth client-credentials + `O-Bearer` header; response checks as in the table intro | Paid only on `COMPLETED` + all bindings; else pending | `lib/verifiers/phonepe-pg.ts` |
| `HostedCheckout` (21, interface) | — | — | `startCheckout(Order, returnUrl): {type:'redirect'\|'form', url, fields?, expires_at: int}`; throws RuntimeException when the provider refuses | — | `lib/verifiers/hosted-checkout.ts` (TS interface) |

### 9.1 `PaytmChecksum` (`app/Support/PaytmChecksum.php`, 41 lines) — port faithfully

Port of Paytm's official checksum library (`paytm/Paytm_PHP_Checksum` v2.0.2).
**Algorithm:** `signature = AES-128-CBC( SHA256(payload + "|" + salt) + salt )`,
fixed IV `@@@@&&&&####$$$$` (16 chars), key = merchant key (`html_entity_decode`
applied first in PHP — preserve: decode HTML entities on the key before use).
**Generate:** salt = 4 chars drawn uniformly at random from
`9876543210ZYXWVUTSRQPONMLKJIHGFEDCBAabcdefghijklmnopqrstuvwxyz!@#$&_`
(72 chars); hash input = `SHA256_hex(payload + "|" + salt) + salt` (68 chars);
encrypt that ASCII string with AES-128-CBC, key = merchant key, IV as above,
OpenSSL default options (base64 output, PKCS#7 padding — in Node use
`crypto.createCipheriv('aes-128-cbc', key, iv)` with a 16-byte key; **if the
merchant key is not 16 bytes, PHP/OpenSSL silently truncates/pads — the Node port
must reproduce the exact key handling and be verified against a known vector in
tests, see §16**). **Verify:** `decrypt(signature)` → must be ≥4 chars; recompute
`SHA256(payload + "|" + last4chars) + last4chars` and `hash_equals` against the
decrypted value. **Signed POST envelope** (`PaytmPgVerifier::signedPost`):
`bodyJson = JSON.stringify(body)` with **unescaped slashes** (PHP
`JSON_UNESCAPED_SLASHES` — Node `JSON.stringify` does not escape `/` by default,
so this matches); `signature = generate(bodyJson, merchant_key)`; POST body is
the literal string `{"body":<bodyJson>,"head":{"signature":<json-encoded signature>}}`
with `Content-Type: application/json`. New: `lib/verifiers/paytm-checksum.ts`
(`generate(payload, key)`, `verify(payload, key, signature)`).

---

## 10. Webhooks

Events (from `WebhookOutboxService::record` + `docs.blade.php`): `order.paid`,
`order.expired`, `order.under_review`, `order.failed` (sandbox), `order.pending`
(sandbox), `order.timeout` (sandbox). Payload envelope (snapshot at record time):
`{event_id (UUID), event_sequence (per-order counter), occurred_at (ISO-8601),
event, data: toApiArray()}`. Delivery is **at-least-once, may be out of order** —
consumers must dedupe on `event_id` transactionally and use `event_sequence` per
order to avoid reverting newer state; "queue insertion is not merchant receipt".

| Piece | Behaviour (exact) | New architecture |
|---|---|---|
| Outbound outbox — `WebhookOutboxService::record(order, event)` (62) | **Must be called inside a DB transaction** (throws otherwise). Locks the order row; asserts the order's status matches the event (`order.paid`→paid, `expired`→expired, `under_review`→review, `failed`→failed, `pending`/`timeout`→pending) and env ∈ live/sandbox; `order.paid` is deduped by `transition_key = 'paid:{orderId}'` (returns existing row); other events `transition_key = 'transition:{orderId}:{sequence}'`; `sequence = order.webhook_event_sequence + 1` (counter kept on the locked parent row — avoids MAX()/gap-lock deadlocks); `event_id` = new UUID; payload snapshot = envelope above; status `pending`, `available_at = now`. Identity/snapshot fields immutable after insert (model hook). | `lib/webhooks/outbox.ts` (`recordOutbox()` — must run inside the same Neon txn as the order transition; see §5.4 Q1) → Neon `webhook_outbox` |
| Dispatcher — `WebhookOutboxDispatcher` (87) + `webhooks:dispatch` (every minute) | `due()`: status ∈ pending/queued/failed, `delivered_at` null, `available_at ≤ now`, unclaimed or claim expired (`claim_seconds` = 120). `dispatchDue()`: up to `outbox_batch_size` (default 100, env `WEBHOOK_OUTBOX_BATCH_SIZE`, clamp 1–1000), ordered by `available_at, id`; per event `dispatchOne(id)`: txn claims it (`claim_token` UUID, `claimed_at=now`, `available_at = now+claim_seconds`, `dispatch_attempts+1`); then pushes `SendWebhook(order, event, event_id, dispatch_attempts)` onto the queue (immediate push, no locks held); on success marks `queued`, `queued_at=now`, clears claim, `available_at = now+reconcile_seconds` (10,800 s / 3 h); on queue-insert failure marks `pending`, `available_at = now+dispatch_retry_seconds` (60 s), `last_error='queue_insert_failed'`; refuses to run if the queue driver is `null`. | Vercel Cron every minute `GET /api/cron/webhooks-dispatch` → `lib/webhooks/dispatcher.ts`; the "queue push" step becomes direct delivery or Vercel Queue/QStash — OPEN QUESTION (§12). Keep claim/lease columns and timings. |
| Delivery — `Jobs/SendWebhook.php` (269), `$tries=6`, `backoff() = [30, 120, 600, 1800, 3600]` s | Legacy path (no outbox id): delivers a snapshot captured at construction (`{event_id, event, data: toApiArray()}`) — jobs from older versions without a snapshot throw and need operator review. Outbox path: cache lock `webhook-delivery:{event_id}` (`delivery_lock_seconds` = 60; if locked, `release(30)`); loads outbox row; no-op if already delivered; **generation fencing**: `publicationGeneration !== outbox.dispatch_attempts` → abort silently (stale replay from `failed_jobs`/delayed queue); order-id mismatch → throw; snapshot-integrity check (payload event_id/event/sequence/environment must match the row) → else `block('invalid_snapshot')`; increments `delivery_attempts`; `deliver()`: (1) **reconciliation** — if `WebhookHistoryService::hasSuccessfulLog(order, event_id, event)` (active **or** archived tier) → `markDelivered` without sending; (2) blocked → return; (3) merchant + env select URL/secret (sandbox → `sandbox_webhook_url` + sandbox signing secret, else live; **live secret fallback = api_secret**, sandbox fallback = sandbox_api_secret — see §7/User); missing URL or secret → `block('configuration_missing')`; sandbox URL equal to live URL → `block('environment_url_collision')`; (4) **SSRF re-validation at send time** via `SafeUrl::check()` (DNS-rebind defence) → on failure logs `webhook_logs` row (`error_label='blocked_url'`, success false) + `block('blocked_url')`, **no retry**; (5) sign body (`WebhookSignature::sign`, §10.1) → headers `X-Signature: t=…,v1=…`, `X-Signature-Timestamp`, `X-Webhook-Timestamp`, `X-Event`, `X-Event-Id`; (6) POST with `Http::timeout(15)`, connect timeout 5 s, **no redirects**, body = JSON (unescaped slashes), `CURLOPT_RESOLVE` pins `host:port:validated-IP` (prevents mid-flight re-resolution); (7) success = HTTP 2xx; **response body never stored** — only status code + short `error_label` (`http_{code}` for ≥500, `timeout`, `network_error`); writes a `webhook_logs` row for every attempt (payload snapshot included, `response_body` always null); on failure throws RuntimeException (queue retries with backoff) and sets `outbox.last_error`; on success `markDelivered` (status delivered, `delivered_at=now`, clears claim/last_error). `failed()`: if `publicationGeneration >= max_dispatch_generations` (default 10) → `blocked` + `exhausted_generations` + `available_at=null`; else `failed` + `delivery_exhausted` + `available_at = now + failed_retry_seconds` (3600 s) — only when the row is still `queued` with matching generation and no active claim. | `lib/webhooks/send.ts` — port every step; `CURLOPT_RESOLVE` has **no `fetch` equivalent** — the Node port must resolve DNS itself and connect to the validated IP with a pinned `Host`/SNI (e.g. `undici`/`node:http` with `lookup` override, or `fetch` + custom dispatcher) or document the residual DNS-rebind risk — OPEN QUESTION. Keep tries/backoff/generation fencing. |
| HMAC signature — `WebhookSignature` (124) | `sign(body, secret, timestamp?)`: `signedPayload = "{timestamp}.{body}"`; `signature = HMAC-SHA256(signedPayload, secret)` (hex); header `t={timestamp},v1={signature}`; returns `{header, timestamp, signature}`. `verify(body, header, secret, tolerance=300, now?)`: rejects empty secret/header, unknown/duplicate/empty/malformed params (only `t` and `v1` allowed, exactly one `=` per pair, no empty segments), `v1` must be 64 hex chars, `t` digits and >0, `\|now - t\| ≤ tolerance` (default 300 s), then `hash_equals(HMAC-SHA256("{t}.{body}", secret), v1)`. `parseHeader` implements the strict parsing. Legacy body-only `X-Signature-Legacy` is **retired** (neither sent nor accepted). | `lib/webhooks/signature.ts` — `sign()`/`verify()`/`parseHeader()`, byte-identical; docs keep the 31 Mar 2027 migration deadline |
| Inbound webhooks | **None.** No route, controller, or verifier accepts inbound provider/merchant webhooks. Provider callbacks land only on `pay/{order}/return`, which ignores the posted data and re-checks via the status API (§8). | No inbound webhook route — do not add one |
| Webhook history — `WebhookHistoryService` (99) | Unified query over `webhook_logs` UNION ALL `archived_webhook_logs` (13 shared columns + `storage_tier` literal `'active'`/`'archive'`), ordered `created_at DESC, id DESC, storage_tier ASC`; `getLogsForOrder(order, perPage=25)` (paginated), `getAllLogsForOrder(order)` (hydrates Carbon dates + JSON-decodes payload), `hasSuccessfulLog(orderId, eventId?, event?)` (checks active tier then archive tier) | `lib/webhooks/history.ts` — same UNION ALL over Neon tables |
| Retention / pruning — `WebhookRetentionService` (336) + `webhooks:prune-logs` (daily) + `webhooks:offload-payloads` (daily) | Retention `WEBHOOK_RETENTION_DAYS` (default 30, min 1). `offloadDeliveredPayloads(chunk=100)`: delivered outbox events with `delivered_at ≤ now-30d` and non-null payload, per-event cache lock `webhook-delivery:{event_id}` (5 s); txn upserts the payload into `archived_webhook_payloads` (by `event_id`) and sets `webhook_outbox.payload = NULL`; the outbox skeleton row is **never deleted**. `pruneEligibleLogs(chunk=100)`: candidate `webhook_logs` with `created_at ≤ cutoff`; per log, `isOrderEligibleForLogArchival()` — **fail-closed**: all outbox events for the order must be delivered; paid ⇒ `paid_at ≤ cutoff`; expired ⇒ `original_expires_at (?: expires_at) + late_grace (24h) + clock-skew (300s) ≤ cutoff`; failed ⇒ sandbox + `sandbox_simulated_at ≤ cutoff`, live failed ⇒ never; pending/review/unknown ⇒ never. `archiveSingleLogWithConflictProtection()`: if an archive row with the same id exists, **13-column exact match** (id, order_id, event, event_id, url, attempt, success, response_code, response_body, error_label, payload JSON, created_at, updated_at — NULL- and timestamp-aware) is required before deleting the active row; mismatch → log error, abort deletion; else insert into `archived_webhook_logs` (preserving the original `id`) then delete the active row. `restorePayload(eventId)`: copy `archived_webhook_payloads.payload` back into `webhook_outbox.payload` where null (status untouched). `rollbackPayloads(chunk=100, purgeArchive=false)`: restore all in chunks, optionally delete archive rows. | `lib/webhooks/retention.ts` + daily Vercel Crons; Neon tables `archived_webhook_logs` / `archived_webhook_payloads` (§5); keep the 13-column match + fail-closed eligibility exactly |
| Replay protection | Outbound: timestamped signature + 5-min tolerance (consumer-side, documented); `event_id` dedupe + `event_sequence` ordering (consumer-side); generation fencing + delivery lock + reconciliation (§10 delivery). Inbound: n/a (no inbound webhooks). Tests: `WebhookReplayProtectionTest` (15), `WebhookGenerationFencingTest` (5) | Same — document consumer duties in `app/docs/page.tsx` |
| SSRF — `SafeUrl` (391) | `check(url)` → `{host, port, ips}` or ValidationException. Rules: https required (http only if `gateway.webhook_allow_insecure`, forced false in prod); no userinfo; scheme ∈ {https, http}; host present; port allowlist (443, +80 if insecure allowed); reject raw-IP literals in decimal/hex/octal; resolve A/AAAA and reject **any** private/reserved/loopback/link-local/CGNAT/multicast/unspecified IPv4 or private IPv6 in the answer set (helpers `isCgnat`, `isLinkLocalV4`, `isPrivateIpv6`, `normalizeIpv4Mapped`, `isUnspecifiedV4`); injectable DNS resolver for tests. Applied at webhook-URL save (`SettingsController`) **and** at send time (`SendWebhook`). | `lib/webhooks/safe-url.ts` — port all rules; DNS via Node `dns/promises`; keep the injectable-resolver seam for tests |


---

## 11. Admin features

All under `/admin/*`, `auth + active + admin + password.confirm:,900` (§1).

| Feature | Source behaviour | New architecture |
|---|---|---|
| Dashboard (merchant) | §3 `DashboardController` — stats, 7-day chart, checklist, recent orders; env switcher | `app/(dashboard)/dashboard/page.tsx` |
| Merchants | `AdminController@merchants` — all `role=merchant` users, live order count + paid count + paid sum, latest first, 25/page; toggle enable/disable (403 for admins, audit-logged) | `app/(admin)/merchants/page.tsx` + toggle API route |
| All orders | `AdminController@orders` — every order with user+account, `?status`, 30/page | `app/(admin)/orders/page.tsx` |
| Order view (admin) | `AdminController@showOrder` — read-only `orders.show`; audit `order_viewed` (admin id, order id/no, merchant id, IP) on every view | `app/(admin)/orders/[orderNo]/page.tsx` (shared component, `readOnly`) |
| Manual payment override | `AdminController@manualPaymentOverride` + `OrderService::adminOverridePaid` (§8); amount must equal order, reference 6–80 `[A-Za-z0-9_-]`, reason 20–500 chars; audit row `order_manual_payment_override`; webhook `order.paid` emitted | `app/api/admin/orders/[orderNo]/manual-payment-override/route.ts` |
| Transaction debugger | `TransactionDebuggerController` (§3): filterable list (q/status/provider/environment/date range) + detail with timeline, masked PII, sanitised provider error; every detail view audit-logged (`transaction_debugger_viewed`) | `app/(admin)/transaction-debugger/page.tsx` + `[orderNo]/page.tsx` |
| Webhook logs | Per-order unified history on `orders.show` (active + archive, §10); no standalone webhook-log admin page exists | Same per-order history; no new page unless parent asks |
| Audit logs | `AdminAuditLog` (§4) — actions recorded: `merchant_enabled`, `merchant_disabled`, `order_viewed`, `transaction_debugger_viewed`, `order_manual_payment_override`. Append-only (update/delete throw). **No admin UI lists audit logs** — they are only written, never displayed in the app | Neon `admin_audit_logs`; no list UI (keep write-only) unless parent asks — OPEN QUESTION |
| Settings (merchant) | §3 `SettingsController` — profile, webhook URLs, keys/secrets, rotation, redirect domains | `app/(dashboard)/settings/page.tsx` |
| Account management | §3 `PaymentAccountController` — CRUD + limit/toggle/default; delete refused with orders | `app/(dashboard)/accounts/*` |
| UTR review flow | §8 — merchant approve/reject on `orders.show` when status is `review` | Same page |
| Admin creation | Installer first admin + `app:create-admin` CLI (§1.3); no in-app admin creation | `scripts/create-admin.ts` (local, with `DATABASE_URL`) |

**IST note for the dashboard:** "today" is computed with Laravel `today()` in the app
timezone `Asia/Kolkata`. In Neon, `DATE(paid_at)` is UTC unless converted — the
dashboard aggregation must use `paid_at AT TIME ZONE 'Asia/Kolkata'` for day
boundaries, or "today" will be wrong by up to 5.5 h.

---

## 12. Background jobs / scheduler

| Item | Source | New architecture |
|---|---|---|
| `SendWebhook` job (269 lines) | Only queue job. DB queue, `$tries=6`, backoff `[30,120,600,1800,3600]`, generation fencing, delivery lock, SSRF + signing (§10). Queue lifecycle logging in `AppServiceProvider` | No queue worker on Vercel. Replace with: dispatcher cron → direct delivery attempt inside the cron invocation (same `SendWebhook` logic as a plain function `lib/webhooks/send.ts`), recording attempts in `webhook_logs`/`webhook_outbox` exactly as now; **or** Vercel Queue / QStash if the parent approves a queue service — OPEN QUESTION. The 6-tries/backoff budget is then expressed via `available_at`/`dispatch_attempts`/`max_dispatch_generations`, not a queue retry. |
| `orders:check-pending` | Every minute, `withoutOverlapping()` (§1.3) | Vercel Cron every minute `GET /api/cron/orders-check-pending` (guard with `CRON_SECRET`); lock via Neon advisory lock or Upstash (§5.4) |
| `webhooks:dispatch` | Every minute, `withoutOverlapping(5)` | Vercel Cron every minute `GET /api/cron/webhooks-dispatch` |
| `webhooks:offload-payloads` | Daily, `withoutOverlapping(10)` | Vercel Cron daily `GET /api/cron/webhooks-offload` |
| `webhooks:prune-logs` | Daily, `withoutOverlapping(10)` | Vercel Cron daily `GET /api/cron/webhooks-prune` |
| `orders:recover-verification-lease` | Manual operator CLI (§1.3) | Admin API route or `scripts/recover-lease.ts` — OPEN QUESTION (tied to the lease redesign, §8) |
| `webhooks:retry/restore-payload/rollback-payloads` | Manual CLI (§1.3) | Admin API routes (or admin UI buttons) |
| `app:create-admin` | Manual CLI | `scripts/create-admin.ts` |
| cPanel cron docs | `docs/CPANEL.md` documents two 1-min crons (scheduler + queue worker) + failed-job recovery commands (`queue:failed`, `queue:retry`, `queue:forget`, `webhooks:retry`) | Replace with Vercel Cron docs in the new README; the queue-worker cron has no equivalent |

**Vercel Cron plan constraint:** 1-minute crons need a paid Vercel plan (Hobby
allows daily crons only). The two every-minute jobs (order checks + webhook
dispatch) are load-bearing — flag the plan requirement to the parent/user.

---

## 13. Services / Support

### 13.1 `app/Services/` (9 files + 7 verifiers in `Verifiers/`)

| File | Purpose | New architecture |
|---|---|---|
| `OrderService.php` (951) | All order logic (§8) | `lib/orders/*` (create, check, mark-paid, expire, late-payment, utr, sandbox, admin-override, resolve-account) |
| `VerificationLease.php` (16) | Value object: orderId, token, generation, nodeId, nodeInstanceId, pid, processIdentity | `lib/orders/verification-lease.ts` (shape TBD by §8 lease decision) |
| `VerificationNodeIdentity.php` (125) | Node identity: `nodeId()` (from `GATEWAY_VERIFICATION_NODE_ID` env or placeholder), `installationId()`, `bootId()`, `instanceId()`; `isPlaceholder()`; `run()` shell helper | `lib/verification/node-identity.ts` — on Vercel there is no stable node/boot id; OPEN QUESTION (see §8) |
| `VerificationNodeRegistry.php` (53) | `registerCurrentNode()` — upserts `verification_nodes` (node_id PK, installation/boot/instance ids, registered_at/last_seen_at) | `lib/verification/node-registry.ts` (only if the lease model keeps nodes) |
| `VerificationProcessInspector.php` (126) | `status(nodeId, instanceId, pid, processIdentity)` → `ALIVE`/`DEAD`/`UNKNOWN` via `ps` (`runPs`, `pidStatus`, `isZombie`, `processIdentity(pid)`); `currentProcessIdentity()`, `nodeId()`, `nodeInstanceId()` | **NOT MIGRATABLE** — `ps`/PID inspection cannot exist on Vercel serverless. The lease-takeover rule that depends on it must be redesigned (§8) |
| `WebhookOutboxService.php` (62) | `record(order, event)` (§10) | `lib/webhooks/outbox.ts` |
| `WebhookOutboxDispatcher.php` (87) | `due()` / `dispatchDue()` / `dispatchOne(id)` (§10) | `lib/webhooks/dispatcher.ts` |
| `WebhookHistoryService.php` (99) | Unified active+archive log query (§10) | `lib/webhooks/history.ts` |
| `WebhookRetentionService.php` (336) | Offload / restore / rollback / prune + 13-column archive-match (§10) | `lib/webhooks/retention.ts` |

### 13.2 `app/Support/` (9 files)

| File | Purpose | New architecture |
|---|---|---|
| `PaytmChecksum.php` (41) | Paytm checksum (§9.1) | `lib/verifiers/paytm-checksum.ts` |
| `WebhookSignature.php` (124) | Timestamped HMAC webhook signing (§10) | `lib/webhooks/signature.ts` |
| `SafeUrl.php` (391) | SSRF-safe URL validation (§10) | `lib/webhooks/safe-url.ts` |
| `InstallationManager.php` (1,660) | Installer engine (§7): requirements, server readiness, setup tokens, `.env` write, migrations, admin creation, installed-state | `lib/install/manager.ts` — port the *logic* (token single-use, readiness gates, installed-state); **not** the PHP/filesystem parts |
| `NativeInstallerSession.php` (173) | Native `install.php` session handling: `csrfMatches` (timing-safe), `start()` (cookie params, secure flag), request/state/CSRF-mismatch logging, session-id + path fingerprints, `sessionSetCookieValues` | NOT MIGRATABLE — no PHP sessions on Vercel; CSRF for the installer becomes the Next.js session + origin check |
| `DeploymentConfiguration.php` (101) | Generates Apache (`.htaccess`-style) + Nginx server configs from URL + public path (used by `docs/DEPLOYMENT.md` + installer) | NOT MIGRATABLE — Vercel needs no Apache/Nginx config; keep the generated-config *docs* only if a self-hosted variant is ever offered |
| `DeploymentFilesystem.php` (33) | `prepare()` — creates missing runtime dirs (`storage/*`, `bootstrap/cache`) without following symlinks or changing existing dirs | NOT MIGRATABLE — no writable filesystem on Vercel |
| `DeploymentUrl.php` (136) | `basePath()`, `normalize()`, `cookiePath()`, `cookieName()`, `isPrivateRequest()`, `isLocalUrl()`, `isAllowedProductionUrl()` (HTTPS required in prod, http only for 127.0.0.1/localhost) | `lib/urls.ts` — port `isAllowedProductionUrl` + `normalize`; basePath/cookie helpers only if a sub-path deploy is chosen |
| `TrustedProxyConfiguration.php` (28) | `addresses()` — parses `TRUSTED_PROXIES` (comma IPs/CIDRs) | `lib/proxy.ts` (or drop — Vercel handles proxies; keep the "never `*`" rule) |

### 13.3 Other app code

- `app/Console/Commands/` — 4 commands (§1.3): `OffloadWebhookPayloadsCommand`,
  `PruneWebhookLogsCommand`, `RestoreWebhookPayloadCommand`,
  `RollbackWebhookPayloadsCommand` → admin API routes / cron handlers (§12).
- `app/Jobs/SendWebhook.php` → `lib/webhooks/send.ts` (§10/§12).
- `app/Policies/PaymentAccountPolicy.php`, `app/Providers/AppServiceProvider.php` — §4.1.
- `bootstrap/app.php` (64) — routing + middleware wiring (§1/§6) → `middleware.ts` +
  `next.config.ts` + `lib/bootstrap.ts`.
- `bootstrap/providers.php`, `bootstrap/cache/packages.php` — Laravel scaffolding,
  no equivalent.
- `artisan` (CLI entry) → `package.json` scripts (`scripts/*.ts` via `tsx`).
- `index.php` (root) + `public/index.php` — Laravel front controllers → NOT MIGRATABLE
  (Next.js handles routing). `public/install.php` — copy of `install.php` for
  direct web access → NOT MIGRATABLE.

---

## 14. Config / env

### 14.1 `config/` (14 files)

| File | Contents | New architecture |
|---|---|---|
| `config/app.php` (127) | name (`APP_NAME`), env, debug, url, asset_url, timezone **`Asia/Kolkata`**, locale en, faker en_US, key (`APP_KEY`), previous_keys (`APP_PREVIOUS_KEYS`, comma list), maintenance driver/store | `lib/config.ts` — `APP_NAME`, `APP_URL`, `APP_TIMEZONE='Asia/Kolkata'`; `APP_KEY` → `ENCRYPTION_KEY` (new, unrelated value); previous-keys rotation → OPEN QUESTION (only relevant if Laravel-encrypted values must be readable — they won't be) |
| `config/auth.php` (129) | `allow_registration` (`ALLOW_REGISTRATION`, default false); guard `web` (session, provider users, model `AUTH_MODEL`); password broker `users` (table `password_reset_tokens`); `password_timeout` (`AUTH_PASSWORD_TIMEOUT`, default 10800 s — overridden to 900 s for admin routes) | `lib/auth/config.ts` — same flag + timeouts |
| `config/cache.php` (120) | default `CACHE_STORE=database`, limiter `CACHE_LIMITER=database`; stores: database (`cache` table), file, redis, memcached, dynamodb; prefix slug(app name)+`-cache-` | `lib/cache.ts` — Upstash/Vercel KV (see §5.3) |
| `config/database.php` (186) | default `DB_CONNECTION=mysql`; sqlite/mysql/mariadb/pgsql/sqlsrv/redis connections; MySQL charset `utf8mb4`, collation `utf8mb4_unicode_ci`; `MYSQL_ATTR_SSL_CA`; Redis prefix | **Replaced by Neon**: `DATABASE_URL` only; keep `DB_*` out of the new `.env.example` except as a comment noting the old MySQL vars are gone |
| `config/filesystems.php` (80) | default disk `FILESYSTEM_DISK` (local); `public` disk (`storage/app/public`, URL `APP_URL/storage`); s3 (AWS keys/bucket/endpoint/path-style) | Vercel Blob / public assets (§1 storage row) |
| `config/gateway.php` (107) | **The domain config — port all of it** (see §14.2) | `lib/config/gateway.ts` |
| `config/installer.php` (11) | env/installed/setup-lock/in-progress/setup-token paths (all under `storage/`), setup_token_ttl 3600, allow_remote_db (`INSTALLER_ALLOW_REMOTE_DB`, false) | `lib/install/config.ts` — paths become Neon rows / env; TTL 3600 kept |
| `config/logging.php` (132) | channels: stack/single/daily/slack/syslog/errorlog/papertrail/stderr; `LOG_CHANNEL=stack`, `LOG_STACK=single`, `LOG_LEVEL=error` (prod), deprecations channel | Vercel logs (`console.*` with structured JSON); keep `LOG_LEVEL` env |
| `config/mail.php` (118) | mailers: log (default), smtp, ses, postmark, resend, sendmail; from address/name | **Unused in practice** (`MAIL_MAILER=log`, no mail is sent anywhere in the app). Do not wire a mail provider unless a reset flow is later approved |
| `config/proxy.php` (5) | `trusted_proxies` (`TRUSTED_PROXIES`, '') | See §6 TrustConfiguredProxies |
| `config/queue.php` (129) | default `QUEUE_CONNECTION=database`; connections sync/database/beanstalkd/sqs/redis; failed driver `database-uuids`; `DB_QUEUE_RETRY_AFTER=90` | See §12 — no queue; keep `QUEUE_*` out |
| `config/services.php` (38) | postmark/resend/ses/slack keys (all unused by app code) | Drop (do not carry unused third-party keys) |
| `config/session.php` (217) | driver database, lifetime 120, expire_on_close false, encrypt (`SESSION_ENCRYPT`, false in file / **true in `.env.example`**), table `sessions`, cookie slug(app name)+`-session`, path `/`, domain null, secure (`SESSION_SECURE_COOKIE`), http_only true, same_site `lax`, partitioned false | See §7 session design |
| `config/webhooks.php` (13) | `outbox_batch_size` (`WEBHOOK_OUTBOX_BATCH_SIZE`, 100, clamp 1–1000), `claim_seconds` 120, `dispatch_retry_seconds` 60, `reconcile_seconds` 10800, `failed_retry_seconds` 3600, `max_dispatch_generations` (`WEBHOOK_MAX_DISPATCH_GENERATIONS`, 10), `delivery_lock_seconds` (`WEBHOOK_DELIVERY_LOCK_SECONDS`, 60), `retention_days` (`WEBHOOK_RETENTION_DAYS`, 30) | `lib/config/webhooks.ts` — same keys/defaults |

### 14.2 `config/gateway.php` keys (all port to `lib/config/gateway.ts`)

`order_expiry_minutes` (15); `late_payment_grace_hours` (24, 0 disables);
`late_payment_check_interval_seconds` (300, min 120); `late_payment_batch_size`
(100, 1–1000); `pending_verification_batch_size` (100, 1–1000);
`scheduler_lock_seconds` (300, 60–3600); `check_interval_seconds` (**hardcoded 3**,
not env); `verification_lease_seconds` (120, min 15);
`verification_node_id` (`GATEWAY_VERIFICATION_NODE_ID`, no default — placeholder
detection in `InstallationManager::isPlaceholderNodeId`);
`verification_node_installation_id` / `verification_node_boot_id` (env, no defaults);
`evidence_require_timestamp` (true); `evidence_max_age_seconds` (86400, min 60);
`evidence_clock_skew_seconds` (300, min 0); `provider_timezone` (`Asia/Kolkata`);
`paytm_status_url` (`PAYTM_STATUS_URL`, default
`https://securegw.paytm.in/merchant-status/getTxnStatus`);
`enable_paytm_business` (`GATEWAY_ENABLE_PAYTM_BUSINESS`, true);
`phonepe_pg.sandbox/production` (token_url + base_url, hardcoded — see §9);
`paytm_pg.sandbox/production` (`PAYTM_PG_SANDBOX_URL` /
`PAYTM_PG_PRODUCTION_URL`); `webhook_allow_insecure` (false in prod regardless of
env); `webhook_allowed_ports` ([443]); `allow_insecure_redirects` (false in prod
regardless); `csp_enforce` (`GATEWAY_CSP_ENFORCE`, true);
`api_key_rate_limit` (120), `order_create_api_key_rate_limit` (1000, invalid →
1000), `api_ip_rate_limit` (600), `api_failed_auth_ip_rate_limit` (30).

### 14.3 `.env.example` (126 lines) — every key

**Secret (never commit a value; env-only on Vercel):** `APP_KEY` (Laravel key —
replaced by new `ENCRYPTION_KEY`), `DB_PASSWORD` (MySQL — **gone**; replaced by
`DATABASE_URL`), `MAIL_PASSWORD`, `AWS_SECRET_ACCESS_KEY`, `PAYTM_STATUS_URL`
(not secret, override only), `GATEWAY_VERIFICATION_NODE_ID` (placeholder
`change-me-unique-node-id` — must be unique per host; on Vercel see §8 lease
decision). **Non-secret with defaults:** `APP_NAME="UPI Gateway"`,
`APP_ENV=production`, `APP_DEBUG=false`, `APP_URL=https://your-domain.example`,
`ASSET_URL=` (empty), `TRUSTED_PROXIES=` (empty, never `*`), `APP_LOCALE=en`,
`APP_FALLBACK_LOCALE=en`, `APP_FAKER_LOCALE=en_US`, `APP_MAINTENANCE_DRIVER=file`,
`BCRYPT_ROUNDS=12`, `ALLOW_REGISTRATION=false`, `LOG_CHANNEL=stack`,
`LOG_STACK=single`, `LOG_DEPRECATIONS_CHANNEL=null`, `LOG_LEVEL=error`,
`DB_CONNECTION=mysql`, `DB_HOST=127.0.0.1`, `DB_PORT=3306`,
`DB_DATABASE=upi_gateway`, `DB_USERNAME=root`,
`INSTALLER_ALLOW_REMOTE_DB=false` (commented), `SESSION_DRIVER=database`,
`SESSION_LIFETIME=120`, `SESSION_ENCRYPT=true`, `SESSION_SECURE_COOKIE=true`,
`SESSION_HTTP_ONLY=true`, `SESSION_SAME_SITE=lax`, `SESSION_PATH=/`,
`SESSION_DOMAIN=null`, `QUEUE_CONNECTION=database`,
`WEBHOOK_OUTBOX_BATCH_SIZE=100`, `BROADCAST_CONNECTION=log`,
`CACHE_STORE=database`, `CACHE_LIMITER=database`, `MAIL_MAILER=log`,
`MAIL_HOST=127.0.0.1`, `MAIL_PORT=2525`, `MAIL_USERNAME=null`,
`MAIL_FROM_ADDRESS="noreply@example.com"`, `MAIL_FROM_NAME="${APP_NAME}"`,
`GATEWAY_ORDER_EXPIRY_MINUTES=15`,
`GATEWAY_ORDER_CREATE_API_KEY_RATE_LIMIT=1000`, `GATEWAY_API_KEY_RATE_LIMIT=120`,
`GATEWAY_API_IP_RATE_LIMIT=600`, `GATEWAY_LATE_PAYMENT_GRACE_HOURS=24`,
`GATEWAY_LATE_PAYMENT_CHECK_INTERVAL_SECONDS=300`,
`GATEWAY_PENDING_VERIFICATION_BATCH_SIZE=100`,
`GATEWAY_LATE_PAYMENT_BATCH_SIZE=100`, `GATEWAY_SCHEDULER_LOCK_SECONDS=300`,
`GATEWAY_VERIFICATION_LEASE_SECONDS=120`,
`GATEWAY_EVIDENCE_REQUIRE_TIMESTAMP=true`,
`GATEWAY_EVIDENCE_MAX_AGE_SECONDS=86400`,
`GATEWAY_EVIDENCE_CLOCK_SKEW_SECONDS=300`,
`GATEWAY_PROVIDER_TIMEZONE=Asia/Kolkata`,
`GATEWAY_WEBHOOK_ALLOW_INSECURE=false`, `GATEWAY_ALLOW_INSECURE_REDIRECTS=false`,
`GATEWAY_CSP_ENFORCE=true`, `PAYTM_STATUS_URL` / `PAYTM_PG_SANDBOX_URL` /
`PAYTM_PG_PRODUCTION_URL` (all commented with defaults), `AWS_ACCESS_KEY_ID=`,
`AWS_DEFAULT_REGION=us-east-1`, `AWS_BUCKET=`, `AWS_USE_PATH_STYLE_ENDPOINT=false`,
`VITE_APP_NAME="${APP_NAME}"`.

**New `.env.example` (to ship):** `DATABASE_URL` (Neon pooled connection string —
**placeholder only (never a real value — use a dummy host/user/password);
the real value has been supplied by the user for the build/deploy and must never
appear in `.env.example`, the repo, MEMORY, or any report — it goes in as a
sensitive Vercel env var only, and transiently in a gitignored `.env.local` if a
local step must read it**),
`ENCRYPTION_KEY` (new 32-byte secret for credential/webhook-secret encryption),
`APP_URL`, `APP_NAME`, `CRON_SECRET` (protects `/api/cron/*`), `ALLOW_REGISTRATION`,
all `GATEWAY_*` / `WEBHOOK_*` keys above, `UPSTASH_REDIS_REST_URL` /
`UPSTASH_REDIS_REST_TOKEN` **only if** Upstash is chosen for cache/locks (§5.3).
Do **not** carry over: `DB_HOST/DB_PORT/DB_DATABASE/DB_USERNAME/DB_PASSWORD`,
`DB_CONNECTION`, `SESSION_DRIVER`, `QUEUE_CONNECTION`, `CACHE_STORE`,
`MAIL_*`, `AWS_*`, `VITE_*`, `PAYTM_PG_*` (keep as optional overrides). No
Supabase variable is used in this app at all (see the database decision at the top).


---

## 15. Public assets, docs, scripts, CI

### 15.1 `public/` (and root web files)

| Path | Contents | New architecture |
|---|---|---|
| `public/build/assets/app-DEigU9CH.css`, `app-DYfP0L8V.js`, `manifest.json` | Compiled Vite/Tailwind bundle (committed build output) | NOT MIGRATABLE — Next.js builds its own assets; do not copy |
| `public/css/pay.css` | Checkout-page stylesheet (loaded by `pay.blade.php` in addition to the Vite bundle) | Port rules into `app/pay/[orderNo]/pay.css` or the global CSS — check before deleting |
| `public/favicon.ico` | Favicon | `app/favicon.ico` |
| `public/images/upi/{bhim,gpay,paytm,phonepe}.{png,svg}` (8 files) | UPI app brand marks used on the checkout page | `public/images/upi/*` (same paths) |
| `public/robots.txt` | Robots file | `public/robots.txt` |
| `public/deployment-check.json` | `{"application":"upi-gateway","public_assets":true}` | `public/deployment-check.json` (same) or drop — OPEN QUESTION |
| `public/.htaccess`, root `.htaccess`, `public/index.php`, root `index.php` | Apache config + Laravel front controllers | NOT MIGRATABLE |
| `public/install.php` | Copy of root `install.php` | NOT MIGRATABLE (§7) |
| `deployment-private-check.txt` (1 line) | Sentinel `upi-gateway-private-deployment-sentinel` (deployment probe marker) | Keep an equivalent sentinel only if the deploy check needs it — OPEN QUESTION |
| `resources/css/app.css` | Tailwind v4 (`@import 'tailwindcss'`, `@source` for Blade/JS, `@theme` brand indigo tokens, Inter/JetBrains Mono) | `app/globals.css` (Tailwind v4, same tokens/fonts) |
| `resources/js/app.js` + `bootstrap.js` | Copy/confirm/sidebar/secret-toggle/reload/amount-preview handlers (§2) + Axios bootstrap (`bootstrap.js` sets Axios defaults/CSRF — check usage; the pay page uses raw `fetch`) | `components/` client handlers; Axios is a dependency but the app mostly uses `fetch` — do not add Axios unless a component needs it |
| `vite.config.js` | Vite + `laravel-vite-plugin` + Tailwind v4; inputs `resources/css/app.css`, `resources/js/app.js` | NOT MIGRATABLE — Next.js bundler replaces Vite |
| `package.json` | `private`, scripts `build`/`dev` (vite); devDeps Tailwind v4, `@tailwindcss/vite`, axios, concurrently, laravel-vite-plugin, vite 7 | New `package.json`: `next`, `react`, `@neondatabase/serverless`, QR lib, Tailwind v4 |
| `composer.json` / `composer.lock` | PHP 8.2, `laravel/framework ^12`, `bacon/bacon-qr-code ^3.1`, `laravel/tinker`; dev: faker, pail, pint, sail, mockery, phpunit 11; scripts `setup/dev/test` | NOT MIGRATABLE — no PHP/Composer in the new repo |
| `scripts/build-release.sh` | Production ZIP packager (bash): version/commit validation, isolated frontend build from a git commit, deterministic timestamps, atomic publication, overwrite guard; usage `./scripts/build-release.sh v1.1.0 [commit] [output_dir]` | NOT MIGRATABLE as-is — Vercel deploys from git; keep as reference for a release checklist only |
| `.github/workflows/ci.yml` | CI: PHP 8.2/8.3/8.4 × SQLite tests (`composer audit`, Pint `--test`, `php artisan test --stop-on-failure`); hosting matrix (nginx/apache/apache-folder, Playwright browser checks, `verify_nginx.py`, `verify_mysql_installer.py`); MySQL 8.0 concurrency/feature tests | New CI (`.github/workflows/ci.yml`): `pnpm/npm ci`, typecheck, lint, unit tests, migration check against the real Neon database (branch `production`) when `DATABASE_URL` is present in CI secrets — never hardcode the value |
| `.github/workflows/build-package.yml` | Builds the production ZIP (see `scripts/build-release.sh`) | NOT MIGRATABLE — replace with the Vercel deploy workflow or drop |
| `screenshots/*.png` (9) + `docs/images/installation/*.png` (6) + `.github/screenshots/*.png` (8) | Product + installer screenshots used in README/docs | Copy the product screenshots into the new README/docs if still accurate; re-take after the rebuild — do not present old Laravel screenshots as the new UI |

### 15.2 `docs/` guides (summaries — not copied verbatim)

- `docs/INSTALLATION.md` (144 lines) — web wizard steps, requirements, screenshots,
  after-install checklist, payment-verification note, Paytm Business feature flag,
  late-payment note, security-incident + credential-rotation protocol.
- `docs/CPANEL.md` (462 lines) — cPanel/aaPanel/CyberPanel/Plesk shared hosting:
  production-package download (4 options), panel configs, MySQL creation, wizard,
  **two 1-min crons** (scheduler + queue worker), failed-job recovery commands,
  stale scheduler-lock recovery, session encryption + `APP_PREVIOUS_KEYS` rotation,
  multi-server consistency, post-install security.
- `docs/VPS.md` (162 lines) — Ubuntu VPS: packages, MySQL, Nginx + PHP-FPM
  (incl. subdirectory `/payment/`), wizard, queue + scheduler, session/key rotation,
  safe migration procedure, incident protocol.
- `docs/DEPLOYMENT.md` (97 lines) — domains/subdomains/subdirectories, panel
  configs, generated Nginx configs, assets/payments/storage, browser acceptance
  checks, verification limits.
- `docs/WEBHOOK-OUTBOX.md` (95 lines) — outbox operation, states + recovery,
  immutable events + consumer duties, migration/upgrade notes (interrupted MySQL
  DDL, historical admin identity).
- `README.md` (~660 lines) — quick install, live demo (none configured for this
  copy), release status (**v1.1.0 is a stable release candidate; no v1.1.0 tag/
  GitHub Release published yet**), overview, screenshots, features, architecture
  + payment lifecycle, tech stack, installation, env config, MySQL config,
  supported integrations, API reference, webhook integration (PHP verify example),
  production security checklist, production deployment + release checklist,
  "Adding a Payment Provider" (1. write a Verifier, 2. register in
  `PaymentAccount::PROVIDERS`), running tests, project structure, license, credit.
- `SECURITY.md` (48 lines) — vulnerability reporting / security policy (summarise
  in the new repo; do not copy contact details blindly — check §17 first).
- `docs/icons/*.svg` (27) + `docs/images/installation/*.png` (6) — icon set + wizard
  screenshots used by README/docs.

New docs to ship: `README.md` (Neon/Vercel install, `DATABASE_URL` supply step,
cron plan, security checklist), `docs/WEBHOOK-OUTBOX.md` (updated for cron-based
delivery), `docs/ADDING-A-PROVIDER.md` (from README § "Adding a Payment Provider").

---

## 16. Tests (46 Feature files, 15,360 lines, ~490 `test*` methods; `tests/TestCase.php` 55 lines)

`TestCase.php`: PHPUnit 11, `APP_KEY` fixed test key, `APP_ENV=testing`,
SQLite `:memory:`, `CACHE_STORE=array`, `QUEUE_CONNECTION=sync`,
`SESSION_DRIVER=array`, `MAIL_MAILER=array`, low bcrypt rounds (4),
`GATEWAY_API_KEY_RATE_LIMIT=5` (low, for rate-limit tests),
`GATEWAY_ALLOW_INSECURE_REDIRECTS=true`, `GATEWAY_CSP_ENFORCE=true`.
`phpunit.xml` pins the same env. **No Unit tests exist** — everything is Feature
(HTTP-level) plus Hosting scripts. Tests fake provider HTTP (Paytm/PhonePe) and
use SQLite — MySQL-only behaviour (e.g. `orders_user_id_utr_unique` error text)
is asserted via SQLite-compatible branches in the app code.

| Test file(s) | Area covered (what it proves — port as smoke/integration tests) |
|---|---|
| `PaymentFlowTest` (6), `ProviderVerificationTest` (13), `PgProvidersTest` (7), `PaytmBusinessSecurityTest` (15) | End-to-end order create → checkout → provider verify → paid; Paytm Business + PG + PhonePe PG happy/error paths; amount/order-id/currency/reference/timestamp binding |
| `TransactionIntegrityTest` (22), `LatePaymentCommitTest` (1), `LatePaymentEvidenceBindingTest` (11), `LatePaymentRecoveryTest` (14), `OrderExpirationTest` (9) | `markPaid` atomicity + evidence binding (expiry deadline, max age, future/before-creation, grace window); late-payment recovery; expiry transitions |
| `UtrReviewTest` (13) | Customer UTR submit (attempts, grace, manual-only) → merchant approve (exact amount + hash_equals) / reject (re-pend vs expire) |
| `RotationTest` (14), `PersonalUpiCompatibilityTest` (4) | Random/default rotation, daily-limit accounting (`used_today`), explicit-account no-fallback; manual UPI intent omits `tr` |
| `SandboxModeTest` (13), `PaymentEnvironmentIsolationTest` (13) | Sandbox create/simulate outcomes (incl. one-shot rule, 504 timeout, 422 invalid_reference), env isolation (sandbox creds can't see live data and vice versa, separate webhooks) |
| `ApiRateLimitAndProductionDefaultsTest` (15), `AuthAccessControlTest` (33) | Per-key/per-IP/failed-auth throttles, production defaults (debug off, insecure off, MySQL-only throw), auth gates (guest/auth/admin/active/password-confirm), ownership 404s |
| `SecurityHardeningTest` (28), `SecurityRemediationsTest` (10), `SessionEncryptionTest` (7), `TrustedProxySecurityTest` (7) | CSP/HSTS/frame headers, webhook SSRF (`SafeUrl`), redirect allowlist, session encryption, trusted-proxy handling, secret redaction in logs |
| `WebhookOutboxTest` (22), `WebhookOutboxDatabaseTest` (12), `WebhookCrashRecoveryTest` (1), `WebhookGenerationFencingTest` (5), `WebhookHistoryServiceTest` (3), `WebhookLegacyLogRetentionTest` (4), `WebhookReplayProtectionTest` (15), `WebhookSsrfTest` (15) | Outbox record/dispatch/claim/retry, crash recovery, generation fencing, unified history (active+archive), replay protection (timestamped HMAC, 5-min tolerance), SSRF at save + send time |
| `WebhookArchiveConflictTest` (2), `WebhookArchiveMigrationTest` (1), `WebhookOutboxPayloadOffloadTest` (3), `WebhookRetentionLockingTest` (3) | 13-column archive-match, offload/restore/rollback, retention locking, archive migration |
| `ProviderVerificationConcurrencyTest` (9), `SchedulerStarvationProtectionTest` (14), `VerificationRecoverySecurityTest` (9) | Verification lease concurrency (token/generation/node/pid), scheduler fair ordering + anti-starvation (bad account can't block others), lease-recovery operator flow |
| `AdminAuditHistoryTest` (2), `AdminAuditHistoryDatabaseTest` (1), `AdminOverrideTransparencyTest` (9), `TransactionDebuggerTest` (7) | Audit append-only + actor preservation after deletion, admin override transparency (amount/reference/reason/audit), debugger filters/masking |
| `DatabaseOptimizationTest` (12) | Indexes + grouped aggregations (dashboard single-query stats, 7-day chart) |
| `InstallationWizardTest` (19), `InstallerRequirementsOverviewTest` (26), `CpanelInstallerTest` (58) | Wizard steps, requirements overview, native `install.php` (cPanel) incl. setup tokens, DB write, migrations, admin creation |
| `CpanelQueueAndSchedulerReliabilityTest` (7), `DeploymentCompatibilityTest` (9), `DeveloperDocumentationTest` (1) | Queue/scheduler reliability on shared hosting, subdirectory/subdomain deployment compat, docs page renders |
| `tests/Hosting/` (`browser_check.cjs`, `check_package.py`, `verify_mysql_installer.py`, `verify_nginx.py`, `browser/package.json`) | Real-server checks: nginx/apache routing, assets, CSRF, storage + private-file protection, MySQL installer — Playwright (Chromium) |

**Smoke tests to port first (minimum, against the REAL Neon DB — no mocks for
the data layer):** create order (API + dashboard) → pay page
renders QR → sandbox simulate success → webhook delivered + signed → order paid;
provider verify rejects wrong amount; UTR review approve/reject; admin override;
rate limits (401/403/429); installer blocked after install; outbox retry after
failure. New tests live in `tests/` (Vitest/Playwright) against the real Neon database (branch `production`, as supplied for this build — no mocks for the data layer; a separate Neon branch may be used for CI only if the parent approves it).

---

## 17. Stripped author data check (verified 2026-11-11 by grep over `~/workspace/upi-gateway-copy/`)

The copy was already cleaned before this inventory. Verification greps run:
`916388401024`, `mayank`, `mynkdev`, `appnk.site`, `demo@test`,
`mayanksingh3132`, `@mayankdeveloper`, `whatsapp`, `telegram`, `linkedin`
(case-insensitive, all `*.php/*.md/*.blade.php/*.json/*.txt/*.js/*.css/*.svg`),
plus real-email and real-UPI-ID patterns.

**Found — NOT stripped (deliberate MIT attribution / generic text, not credentials):**

| Finding | Location | Assessment |
|---|---|---|
| `Mayank Singh` + `https://github.com/mynkdev-21` (author credit) | `README.md:652` ("UPI Gateway was originally built by [Mayank Singh](https://github.com/mynkdev-21) and is distributed under the MIT License… The original author's personal contact details are not included in this copy") | **Keep.** MIT attribution; the sentence itself states contacts were removed. Do not delete without a licence review. |
| Same author link in the landing-page footer | `resources/views/welcome.blade.php:468` ("Built with ♥ for Indian merchants by Mayank Singh" → `github.com/mynkdev-21`) | Attribution link, not a contact. Parent to decide: keep, or repoint to `lostingness/UPI`. |
| `Copyright (c) 2026 Mayank Singh` | `LICENSE` (and asserted by `tests/Feature/SecurityRemediationsTest.php:258`) | **Keep.** MIT licence notice — removing it would breach the licence. Note: the cleaned `LICENSE` also names Mohsin Khan (see MEMORY.md) — verify the exact copyright lines when the new repo is created. |
| `WhatsApp` (word only, in a sentence) | `resources/views/orders/create.blade.php:3` ("share it with your customer on WhatsApp, SMS or email") | Generic share-channel text, no number/link. Fine. |

**Found — placeholders / test fixtures only (not real):**

- UPI IDs in docs/tests/views are all obvious placeholders: `merchant@upi`,
  `merchant@paytm`, `paytmqr28100505xxxxxx@paytm` (masked placeholder in the
  account form), `demo@okaxis`, `ravi@okaxis`, `kiran@okaxis`, `test@upi`,
  `paytmqr123@paytm`, `shop@paytm`, etc. No real merchant UPI ID found.
- Emails are placeholders only: `you@business.com`, `admin@yourbusiness.com`,
  `test@example.com`, `noreply@example.com`. No real personal email found.
- No `demo@test.com`, no `appnk.site`, no `916388401024`, no Telegram handle,
  no LinkedIn/portfolio/company links, no API key, no merchant ID, no real
  `mid`/`merchant_key`/`client_secret` anywhere in the copy (provider credentials
  appear only as field names / `TESTMID` / `M1` fixtures in tests).
- `deployment-private-check.txt` contains only the sentinel string
  `upi-gateway-private-deployment-sentinel` (no secret).

**Cross-check vs uncleaned original (`/tmp/upi-gateway`):** `diff -rq` shows the
two trees differ only in the files the cleaning touched —
`README.md`, `LICENSE`, `docs/CPANEL.md`, `docs/INSTALLATION.md`, `install.php`,
`public/index.php`, `resources/views/install/admin.blade.php`,
`.github/workflows/build-package.yml` — plus `/tmp` extras (`.git/`, `vendor/`)
that were never part of the copy. No other file differs, so nothing else was
stripped or lost in the copy. **Nothing was copied back from `/tmp` into the copy.**

---

## Open questions (consolidated — builders must resolve before building)

1. **§5.4 Q1 — Neon HTTP-driver transactions.** Prove `SELECT … FOR UPDATE` +
   conditional `UPDATE` + outbox `INSERT` is atomic via
   `@neondatabase/serverless` `transaction()`, or redesign as single-statement
   conditional updates / Postgres functions. Blocks `markPaid`, `expire`,
   UTR flows, `record()` outbox, checkout `start`.
2. **§8 — Verification lease on serverless.** No PID/process identity exists on
   Vercel. Redesign the lease (token+generation+expiry only? advisory lock?) and
   the `orders:recover-verification-lease` operator flow; decide what happens to
   `verification_pid` / `verification_node_id` / `verification_process_identity` /
   `verification_nodes` / `VerificationProcessInspector`.
3. **§5.3 / §7 — Session store.** Stateless (iron-session/Auth.js) vs Neon
   `sessions` table. Must provide HttpOnly+Secure+SameSite=lax, 120-min lifetime,
   invalidation on password change.
4. **§5.3 — Cache/lock backend.** Upstash Redis vs Vercel KV vs Neon table, for
   scheduler locks, verification locks, webhook delivery locks, login lockout,
   API `api_track`, PhonePe token cache.
5. **§10/§12 — Webhook delivery without a queue worker.** Direct delivery inside
   the dispatcher cron vs Vercel Queue/QStash. And the `CURLOPT_RESOLVE`
   pinning has no `fetch` equivalent — how is DNS-rebind pinning done in Node?
6. **§5.4 Q4 — Migration runner.** Who runs `db/migrations/` and when (manual
   psql/Neon SQL editor vs `scripts/migrate.ts` vs deploy hook)?
7. **§7 — "Installed" detection on Neon.** `installation_guards` row vs env flag;
   and whether the installer wizard stays as a web flow at all on Vercel.
8. **§1 — `mark-paid` route.** Keep as a disabled stub returning the same error,
   or remove the route?
9. **§1/§15 — Storage backend** for `/storage/{path}`: Vercel Blob vs drop.
10. **§12 — Vercel plan.** 1-minute crons need a paid plan; confirm before relying
    on every-minute order checks + webhook dispatch.
11. **§17 — Attribution.** Keep the `welcome.blade.php` footer link to
    `github.com/mynkdev-21`, or repoint to `lostingness/UPI`?
12. **§9.1 — PaytmChecksum key handling.** Verify the Node AES-128-CBC port
    against a known vector (OpenSSL key truncation/padding behaviour) in tests.
13. **§14 — `ENCRYPTION_KEY` rotation.** Laravel `APP_PREVIOUS_KEYS` has no
    equivalent planned; confirm no rotation story is needed (fresh install, no
    existing encrypted rows).
14. **§5.3 — `password_reset_tokens`.** Confirm: no reset flow is built (do not invent one).

## What this inventory did NOT cover (gaps — stated plainly)

- **No live verification** of any provider endpoint (Paytm/PhonePe) — all verifier
  detail is from source code + docs, not from calling the APIs. The Paytm Business
  endpoint is explicitly unofficial and may have changed.
- **`InstallationManager.php` (1,660 lines) was inventoried by method name and
  purpose, not line-by-line** — the backend builder must read it fully before
  porting the installer (especially `checkRequirements`, `getRequirementsOverview`,
  `writeEnvironment`, `detectEnvironmentDiagnostics`).
- **`install.php` (886 lines) was inventoried by step/flow, not line-by-line** —
  same caveat.
- **Test counts** are `public function test*` greps (~490); a few tests may use
  attributes/other naming and be under-counted. Line counts are exact.
- **Route count**: 71 `Route::` occurrences in `web.php` include group/middleware
  lines; distinct endpoints ≈ 66 (table in §1 lists each one — count the table,
  not the grep).
- **The Neon `DATABASE_URL` was supplied by the user (2026-11-11 ~12:09 IST)
  for the real database (org `red-pond-54540257`, project `red-fog-62634170`,
  branch `production`, pooled endpoint `us-east-2`). Its value is NOT in this
  inventory, in any file, in MEMORY, or in any report. DB connectivity is
  verified by the build against the real database; the Vercel deploy sets
  `DATABASE_URL` as a sensitive env var. No Neon connector/API key exists here,
  so the project itself cannot be created or re-provisioned by the build.
- **No Supabase key/URL is used or recorded anywhere in this inventory or repo**
  (per the final 2026-11-11 direction; the AdiMusic Supabase project and
  `together_rooms` are untouched).

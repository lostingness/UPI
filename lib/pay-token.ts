// Payer-binding tokens for the public pay surface — Round 7 (H1/H2/M1).
//
// PROBLEM (Phase 1): every public pay endpoint was keyed only by `order_no`,
// which is printed on the QR, the pay page and the merchant's own screen —
// anyone who saw a link could submit a UTR for it (H1 griefing), force a
// provider verification by polling status (H2 quota burn) or start a hosted
// checkout and overwrite provider_checkout (M1).
//
// DESIGN: when the pay page first renders (server component, getPayData),
// the server mints TWO short-lived tokens bound to that order:
//   - purpose "utr":   single-use, consumed by POST /api/pay/[orderNo]/utr
//   - purpose "start": single-use, consumed by POST /api/pay/[orderNo]/start
//     when a FRESH checkout is created (a cached-checkout reuse only verifies)
// Both tokens also act as a read-only bearer for GET /api/pay/[orderNo]/status:
// a poll that presents a valid, unused, unexpired token may trigger the
// throttled provider check; a poll without one is report-only (stored status).
// A token is NEVER a payment authorisation: it only proves the caller loaded
// this order's pay page. UTR submit still only moves the order to `review`;
// marking paid still needs provider verification / merchant approval.
//
// STORAGE: `upi_pay_tokens` (migration 016). Only the SHA-256 hash is stored
// — the raw token value is never persisted or logged. A render mints fresh
// tokens and deletes the order's prior UNUSED tokens, so at most one live
// token per purpose exists per order (a re-render / router.refresh rotates
// them; the client always holds the latest props). Expiry is
// min(order.expires_at, now + 15 min); for an already-expired order (UTR
// grace window) it is now + 15 min. Single-use is enforced by an atomic
// conditional UPDATE (used_at IS NULL + expires_at > NOW() + RETURNING id);
// a lost race consumes nothing twice.
//
// The in-memory store below is the test seam (same semantics, no DB).
import crypto from "node:crypto";
import { getSql, type Sql } from "./db";
import { sha256Hex, timingSafeEqual } from "./crypto";

export const PAY_TOKEN_PREFIX = "pt_";
/** Max token lifetime — also the cap the task sets (~15 min, tied to order expiry). */
export const PAY_TOKEN_TTL_MS = 15 * 60 * 1000;
export const PAY_TOKEN_PURPOSES = ["utr", "start"] as const;
export type PayTokenPurpose = (typeof PAY_TOKEN_PURPOSES)[number];
/** Fresh hosted checkouts per order (M1 budget). Cached reuse does not count. */
export const START_BUDGET_PER_ORDER = 3;
/** Forced provider checks via the PG return redirect, per order (H2). */
export const RETURN_FORCE_BUDGET = 3;
export const RETURN_FORCE_WINDOW_SECONDS = 15 * 60;

export function newPayToken(): string {
  return PAY_TOKEN_PREFIX + crypto.randomBytes(16).toString("hex");
}

export function hashPayToken(token: string): string {
  return sha256Hex(token);
}

export function isPayTokenFormat(token: unknown): token is string {
  return typeof token === "string" && new RegExp(`^${PAY_TOKEN_PREFIX}[0-9a-f]{32}$`).test(token);
}

/** Token expiry: the order's expiry when it is still in the future (capped
 * at now + 15 min), otherwise now + 15 min (expired orders in the UTR grace
 * window still need a usable token — the grace rule itself is enforced by
 * acceptsCustomerUtr, not by the token). */
export function payTokenExpiryFor(order: { expires_at: string | Date | null }, now = new Date()): Date {
  const cap = new Date(now.getTime() + PAY_TOKEN_TTL_MS);
  if (!order.expires_at) return cap;
  const exp = new Date(order.expires_at);
  return exp.getTime() > now.getTime() ? new Date(Math.min(exp.getTime(), cap.getTime())) : cap;
}

/** Pure budget check for the per-order checkout-start budget (M1). */
export function checkoutStartAllowed(starts: number): boolean {
  return Number(starts ?? 0) < START_BUDGET_PER_ORDER;
}

// --- Lazy table / column ensure (migration 016 is canonical; a deployed
// instance self-heals if `npm run migrate` has not been run yet — same
// pattern as migration 013 / lib/orders/allocations.ts). -------------------
let payTokensEnsured = false;
export async function ensurePayTokensTable(sql: Sql): Promise<void> {
  if (payTokensEnsured) return;
  payTokensEnsured = true;
  try {
    await sql`CREATE TABLE IF NOT EXISTS upi_pay_tokens (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      purpose VARCHAR(16) NOT NULL CHECK (purpose IN ('utr', 'start')),
      token_hash VARCHAR(64) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (order_id, purpose, token_hash)
    )`;
    await sql`CREATE INDEX IF NOT EXISTS upi_pay_tokens_order_idx ON upi_pay_tokens (order_id, purpose)`;
    await sql`CREATE INDEX IF NOT EXISTS upi_pay_tokens_expiry_idx ON upi_pay_tokens (expires_at) WHERE used_at IS NULL`;
  } catch { /* table stays unavailable; callers fall back to no-token behaviour */ }
}

let checkoutStartsEnsured = false;
export async function ensureCheckoutStartsColumn(sql: Sql): Promise<void> {
  if (checkoutStartsEnsured) return;
  checkoutStartsEnsured = true;
  try {
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_starts INT NOT NULL DEFAULT 0`;
  } catch { /* column stays unavailable; the start route fails closed below */ }
}

export interface IssuedPayTokens { utr: string; start: string; }

/** Mint fresh tokens for an order (server-component render). Prior UNUSED
 * tokens for the order are deleted so only the latest pair is live. Returns
 * null when the token table is unavailable (callers then treat the pay page
 * as token-less: UTR submit / fresh checkout are refused, status is
 * report-only — fail closed, never fail open). */
export async function issuePayTokens(
  sql: Sql,
  order: { id: number; expires_at: string | Date | null },
  now = new Date(),
): Promise<IssuedPayTokens | null> {
  try {
    await ensurePayTokensTable(sql);
    await sql`DELETE FROM upi_pay_tokens WHERE order_id = ${order.id} AND used_at IS NULL`;
    const expiresAt = payTokenExpiryFor(order, now).toISOString();
    const tokens: IssuedPayTokens = { utr: newPayToken(), start: newPayToken() };
    await sql`INSERT INTO upi_pay_tokens (order_id, purpose, token_hash, expires_at)
      VALUES (${order.id}, 'utr', ${hashPayToken(tokens.utr)}, ${expiresAt}),
             (${order.id}, 'start', ${hashPayToken(tokens.start)}, ${expiresAt})`;
    return tokens;
  } catch {
    return null;
  }
}

/** Read-only validity check (status polling): does NOT consume the token. */
export async function verifyPayToken(
  sql: Sql,
  orderId: number,
  purpose: PayTokenPurpose,
  token: unknown,
): Promise<boolean> {
  if (!isPayTokenFormat(token)) return false;
  try {
    await ensurePayTokensTable(sql);
    const rows = await sql`SELECT id FROM upi_pay_tokens
      WHERE order_id = ${orderId} AND purpose = ${purpose} AND token_hash = ${hashPayToken(token)}
        AND used_at IS NULL AND expires_at > NOW() LIMIT 1`;
    return (rows as unknown[]).length > 0;
  } catch {
    return false;
  }
}

/** Single-use consumption (UTR submit / fresh checkout start): atomically
 * marks the token used; returns false when the token is unknown, expired,
 * already used, or belongs to another order/purpose. */
export async function consumePayToken(
  sql: Sql,
  orderId: number,
  purpose: PayTokenPurpose,
  token: unknown,
): Promise<boolean> {
  if (!isPayTokenFormat(token)) return false;
  try {
    await ensurePayTokensTable(sql);
    const rows = await sql`UPDATE upi_pay_tokens SET used_at = NOW()
      WHERE order_id = ${orderId} AND purpose = ${purpose} AND token_hash = ${hashPayToken(token)}
        AND used_at IS NULL AND expires_at > NOW()
      RETURNING id`;
    return (rows as unknown[]).length > 0;
  } catch {
    return false;
  }
}

/** Extract a pay token from a request body / query string. Accepts the
 * `pay_token` field (POST JSON) or `?pay_token=` (GET status poll). */
export function payTokenFromRequest(req: Request, body?: unknown): string | null {
  try {
    const q = new URL(req.url).searchParams.get("pay_token");
    if (isPayTokenFormat(q)) return q;
  } catch { /* ignore */ }
  const b = body as { pay_token?: unknown } | null;
  if (b && isPayTokenFormat(b.pay_token)) return b.pay_token as string;
  return null;
}

// --- In-memory store (tests): same issue / verify / consume semantics. ----
export class MemoryPayTokenStore {
  private rows: { orderId: number; purpose: PayTokenPurpose; hash: string; expiresAt: number; usedAt: number | null }[] = [];
  issue(orderId: number, expiresAtMs: number): IssuedPayTokens {
    this.rows = this.rows.filter((r) => !(r.orderId === orderId && r.usedAt === null));
    const tokens: IssuedPayTokens = { utr: newPayToken(), start: newPayToken() };
    for (const purpose of PAY_TOKEN_PURPOSES) {
      this.rows.push({ orderId, purpose, hash: hashPayToken(tokens[purpose]), expiresAt: expiresAtMs, usedAt: null });
    }
    return tokens;
  }
  verify(orderId: number, purpose: PayTokenPurpose, token: unknown, now = Date.now()): boolean {
    if (!isPayTokenFormat(token)) return false;
    const row = this.rows.find((r) => r.orderId === orderId && r.purpose === purpose);
    return !!row && row.usedAt === null && row.expiresAt > now && timingSafeEqual(row.hash, hashPayToken(token as string));
  }
  consume(orderId: number, purpose: PayTokenPurpose, token: unknown, now = Date.now()): boolean {
    if (!this.verify(orderId, purpose, token, now)) return false;
    const row = this.rows.find((r) => r.orderId === orderId && r.purpose === purpose)!;
    row.usedAt = now;
    return true;
  }
  liveCount(orderId: number): number {
    return this.rows.filter((r) => r.orderId === orderId && r.usedAt === null).length;
  }
}

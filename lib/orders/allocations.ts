// Amount allocation engine for the two QR generation methods
// (migration 013, table upi_amount_allocations).
//
// Methods:
//   - 'same': every QR shows the order amount. No allocation row; the
//     payable amount equals the order amount. Payment matching relies on
//     the order reference (`tr` for non-manual accounts, UTR review for
//     manual ones) — amounts alone cannot distinguish two same-amount
//     orders.
//   - 'unique': each live order gets a distinct payable amount a few paise
//     above the order amount (base + increment, +2*increment, ...). The
//     payable amount is the ONLY mapping signal for manual (P2P) payments,
//     whose UPI intent omits `tr` — see the Limitations note in db/README.md.
//
// ATOMICITY (Neon HTTP driver — no multi-statement FOR UPDATE transactions,
// see lib/db.ts): allocation is a SINGLE-STATEMENT conditional insert,
// `INSERT ... SELECT ... WHERE NOT EXISTS (active allocation for this
// (user, account, amount))`, and the caller checks the affected-row count.
// A 0-row insert means another order already holds that amount, so the next
// candidate is tried. Two concurrent statements for the same candidate can
// both pass the NOT EXISTS check, but the partial unique index
// (user_id, COALESCE(payment_account_id,-1), payable_amount) WHERE
// status='active' then rejects one of them with a unique violation — which
// is caught here and treated as a retry signal, never as an error. No
// duplicate active allocation can survive both guards.
//
// MONEY: all arithmetic is integer paise (Math.round(amount*100)); floats
// are never added. A base amount that is not representable to 2dp
// (e.g. 500.005) is rejected, never silently rounded. A candidate is never
// more than 100 paise (Rs 1.00) above the base amount — an order for
// Rs 500.00 is never silently pushed to Rs 501.00.
import { ApiError } from "../errors";
import { gatewayConfig } from "../config/gateway";
import type { Sql } from "../db";

export type QrMethod = "unique" | "same";

export interface AllocationRow {
  id: number; user_id: number; payment_account_id: number | null;
  order_id: number; order_no: string;
  base_amount: string; payable_amount: string;
  status: "active" | "released" | "consumed";
  allocated_at: string; released_at: string | null; expires_at: string;
}

/** Largest payable amount the NUMERIC(12,2) column can hold, in paise. */
export const MAX_PAYABLE_PAISE = 999_999_999_999;
/** A unique payable amount is never more than Rs 1.00 above the base. */
export const QR_ALLOCATION_WINDOW_PAISE = 100;

/** Integer paise for an amount. Throws 422 when the amount is not
 * representable to 2 decimal places (e.g. 500.005) — never silently rounds. */
export function toPaiseStrict(amount: number | string): number {
  const n = Number(amount);
  if (!Number.isFinite(n)) throw new ApiError(422, "Amount is not a valid number.");
  const paise = Math.round(n * 100);
  if (Math.abs(n * 100 - paise) > 1e-6) {
    throw new ApiError(422, "Amount must have at most 2 decimal places.");
  }
  return paise;
}
export function paiseToAmount(paise: number): string { return (paise / 100).toFixed(2); }

// --- Lazy table creation ----------------------------------------------------
// Same self-heal idea as the rest of the port: the migration file is
// canonical for fresh installs, but a deployed instance creates the table on
// first use if `npm run migrate` has not been run yet. Guarded once per
// process; IF NOT EXISTS makes concurrent first calls safe. The DDL is
// written as literal template text (no interpolation) because the Neon
// tagged template turns interpolations into bound parameters.
let allocationTableEnsured = false;
/** Test seam: reset the once-per-process lazy-creation flag. */
export function __resetAllocationTableEnsuredForTests(): void { allocationTableEnsured = false; }

export async function ensureAllocationTable(sql: Sql): Promise<void> {
  if (allocationTableEnsured) return;
  await sql`CREATE TABLE IF NOT EXISTS upi_amount_allocations (
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
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS upi_amount_allocations_user_active_unique
    ON upi_amount_allocations (user_id, COALESCE(payment_account_id, -1), payable_amount)
    WHERE status = 'active'`;
  await sql`CREATE INDEX IF NOT EXISTS upi_amount_allocations_order_id_idx ON upi_amount_allocations (order_id)`;
  await sql`CREATE INDEX IF NOT EXISTS upi_amount_allocations_user_status_expires_idx ON upi_amount_allocations (user_id, status, expires_at)`;
  allocationTableEnsured = true;
}

// --- Allocation -------------------------------------------------------------

export interface AllocateInput {
  userId: number; paymentAccountId: number | null; orderId: number; orderNo: string;
  baseAmount: number | string; method: QrMethod; incrementPaise?: number;
  expiresAt: string | Date; maxAttempts?: number;
}
export interface AllocateResult { payableAmount: string; allocation: AllocationRow | null; }

/**
 * Allocate the payable amount for one order. 'same' returns the base amount
 * with no allocation row. 'unique' tries base+increment, base+2*increment,
 * ... (bounded by maxAttempts and by the Rs 1.00 window) until the
 * single-statement conditional insert claims a free amount. Exhaustion is a
 * 409 — never a silent duplicate.
 */
export async function allocatePayableAmount(sql: Sql, input: AllocateInput): Promise<AllocateResult> {
  const basePaise = toPaiseStrict(input.baseAmount);
  if (basePaise <= 0) throw new ApiError(422, "Amount must be greater than zero.");
  if (basePaise > MAX_PAYABLE_PAISE) throw new ApiError(422, "Amount is too large.");
  if (input.method === "same") return { payableAmount: paiseToAmount(basePaise), allocation: null };

  const increment = input.incrementPaise ?? gatewayConfig.qrIncrementPaise;
  if (!Number.isInteger(increment) || increment < 1 || increment > 99) {
    throw new ApiError(422, "QR increment must be between 1 and 99 paise.");
  }
  const maxAttempts = Math.max(1, input.maxAttempts ?? gatewayConfig.qrMaxAllocationAttempts);
  await ensureAllocationTable(sql);
  const expiresAt = input.expiresAt instanceof Date ? input.expiresAt.toISOString() : input.expiresAt;
  const accountKey = input.paymentAccountId ?? -1;
  const base = paiseToAmount(basePaise);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const candidatePaise = basePaise + increment * attempt;
    // Never more than Rs 1.00 above the base amount, and never past the column max.
    if (candidatePaise - basePaise > QR_ALLOCATION_WINDOW_PAISE) break;
    if (candidatePaise > MAX_PAYABLE_PAISE) break;
    const candidate = paiseToAmount(candidatePaise);
    try {
      const rows = await sql`
        INSERT INTO upi_amount_allocations (user_id, payment_account_id, order_id, order_no, base_amount, payable_amount, status, expires_at)
        SELECT ${input.userId}, ${input.paymentAccountId}, ${input.orderId}, ${input.orderNo}, ${base}, ${candidate}, 'active', ${expiresAt}
        WHERE NOT EXISTS (
          SELECT 1 FROM upi_amount_allocations
          WHERE user_id = ${input.userId}
            AND COALESCE(payment_account_id, -1) = ${accountKey}
            AND payable_amount = ${candidate}
            AND status = 'active'
        )
        RETURNING *`;
      const row = (rows as AllocationRow[])[0];
      if (row) return { payableAmount: candidate, allocation: row };
      // 0 rows: another order already holds this amount — try the next candidate.
    } catch (e) {
      const msg = String((e as Error)?.message ?? "");
      // Belt-and-braces: the partial unique index is the second guard against
      // a concurrent claim of the same candidate (see the header note).
      if (msg.includes("upi_amount_allocations_user_active_unique") || msg.includes("duplicate key")) continue;
      throw e;
    }
  }
  throw new ApiError(409, "No unique payment amount available for this amount right now — try again in a few minutes");
}

/**
 * Release one order's active allocation (status active → released, kept for
 * audit). The amount can be allocated again afterwards. `reason` is accepted
 * for callers that know why (paid / expired / failed); no column stores it.
 */
export async function releaseAllocation(sql: Sql, orderId: number, _reason?: string): Promise<boolean> {
  const rows = await sql`
    UPDATE upi_amount_allocations SET status = 'released', released_at = NOW()
    WHERE order_id = ${orderId} AND status = 'active' RETURNING id`;
  return (rows as unknown[]).length > 0;
}

/**
 * Release every active allocation that has expired, or whose order is
 * expired / failed / paid. Single UPDATE; returns the number released.
 * Called from the pending-orders cron and from order expiry (lib/orders/expire.ts).
 */
export async function releaseExpiredAllocations(sql: Sql): Promise<number> {
  await ensureAllocationTable(sql);
  const rows = await sql`
    UPDATE upi_amount_allocations SET status = 'released', released_at = NOW()
    WHERE status = 'active'
      AND (expires_at < NOW()
        OR order_id IN (SELECT id FROM orders WHERE status IN ('expired', 'failed', 'paid')))
    RETURNING id`;
  return (rows as unknown[]).length;
}

// --- Per-merchant QR settings (users-table columns, like rotation_mode) ------

export interface QrSettings { method: QrMethod; incrementPaise: number; }

function envQrDefaults(): QrSettings {
  return { method: gatewayConfig.qrMethod, incrementPaise: gatewayConfig.qrIncrementPaise };
}

/** Merchant QR settings. Falls back to the env defaults when the merchant
 * has no stored values — including when migration 013 has not been applied
 * yet (missing columns), so order creation keeps working on the defaults
 * instead of failing. */
export async function getMerchantQrSettings(sql: Sql, userId: number): Promise<QrSettings> {
  try {
    const rows = await sql`SELECT qr_method, qr_increment_paise FROM users WHERE id = ${userId}`;
    const row = (rows as { qr_method?: unknown; qr_increment_paise?: unknown }[])[0];
    if (!row) return envQrDefaults();
    const defaults = envQrDefaults();
    const method = row.qr_method === "unique" || row.qr_method === "same" ? row.qr_method : defaults.method;
    const inc = Number(row.qr_increment_paise);
    const incrementPaise = Number.isInteger(inc) && inc >= 1 && inc <= 99 ? inc : defaults.incrementPaise;
    return { method, incrementPaise };
  } catch {
    return envQrDefaults();
  }
}

export async function updateMerchantQrSettings(sql: Sql, userId: number, settings: QrSettings): Promise<void> {
  await sql`UPDATE users SET qr_method = ${settings.method}, qr_increment_paise = ${settings.incrementPaise}, updated_at = NOW() WHERE id = ${userId}`;
}

// --- Merchant reads for the settings API -------------------------------------

export interface QrAllocationCounts { active: number; releasedToday: number; expiredToday: number; }

/** Counts for GET /api/settings/qr. "Today" is the IST calendar day. */
export async function getQrAllocationCounts(sql: Sql, userId: number): Promise<QrAllocationCounts> {
  await ensureAllocationTable(sql);
  const rows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'active') AS active,
      COUNT(*) FILTER (WHERE status = 'released' AND released_at >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date::timestamp AT TIME ZONE 'Asia/Kolkata') AS released_today,
      COUNT(*) FILTER (WHERE status = 'released' AND expires_at < NOW() AND released_at >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date::timestamp AT TIME ZONE 'Asia/Kolkata') AS expired_today
    FROM upi_amount_allocations WHERE user_id = ${userId}`;
  const r = (rows as { active?: unknown; released_today?: unknown; expired_today?: unknown }[])[0] ?? {};
  return {
    active: Number(r.active ?? 0),
    releasedToday: Number(r.released_today ?? 0),
    expiredToday: Number(r.expired_today ?? 0),
  };
}

export interface AllocationListItem {
  id: number; order_no: string; base_amount: string; payable_amount: string;
  status: string; expires_at: string; allocated_at: string; released_at: string | null;
  payment_account_id: number | null;
}

/** Merchant-scoped allocation list for GET /api/settings/qr/allocations (20/page). */
export async function listAllocations(
  sql: Sql, userId: number, opts: { status?: string; page?: number },
): Promise<{ allocations: AllocationListItem[]; page: number; perPage: number; total: number }> {
  await ensureAllocationTable(sql);
  const perPage = 20;
  const page = Math.max(1, opts.page || 1);
  const status = opts.status ?? "";
  const rows = await sql`
    SELECT id, order_no, base_amount, payable_amount, status, expires_at, allocated_at, released_at, payment_account_id
    FROM upi_amount_allocations
    WHERE user_id = ${userId} AND (${status} = '' OR status = ${status})
    ORDER BY allocated_at DESC LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`;
  const totalRows = await sql`
    SELECT COUNT(*) AS n FROM upi_amount_allocations
    WHERE user_id = ${userId} AND (${status} = '' OR status = ${status})`;
  const total = Number((totalRows as { n?: unknown }[])[0]?.n ?? 0);
  return {
    allocations: (rows as AllocationListItem[]).map((r) => ({
      id: Number(r.id), order_no: String(r.order_no),
      base_amount: Number(r.base_amount).toFixed(2),
      payable_amount: Number(r.payable_amount).toFixed(2),
      status: String(r.status), expires_at: String(r.expires_at),
      allocated_at: String(r.allocated_at),
      released_at: r.released_at ? String(r.released_at) : null,
      payment_account_id: r.payment_account_id == null ? null : Number(r.payment_account_id),
    })),
    page, perPage, total,
  };
}

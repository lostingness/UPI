// Order creation — port of OrderService::create / createFor / resolveAccount.
// Live: resolve account (explicit id → must exist, be live-compatible, active,
// within daily limit, Paytm Business not disabled — NEVER silently falls back;
// no id → rotation random/default among active live accounts with room today).
// Sandbox: no payment account, order_no TST…. Expiry: now + expiry minutes,
// stored in both expires_at and original_expires_at.
// used_today = paid-today sum (IST day) + open pending + review.
// NOTE on atomicity: see lib/db.ts — the insert is guarded by the unique
// (user_id, environment, client_order_id) constraint; a race returns 409.
//
// QR amounts (migration 013, lib/orders/allocations.ts): the QR method
// decides the payable amount. 'same' (Normal Amount in the UI) → payable =
// amount, no allocation row. 'unique' → a distinct amount a few paise above
// the base. Precedence for live orders (Round 7): per-order qr_method on
// the create call wins, else the merchant's users-table setting, else the
// platform env default (unique). Sandbox always pays the plain amount.
// ORDERING NOTE: the allocation row has a NOT NULL order_id FK, so the
// order row must exist before allocating. The order is therefore inserted
// first (payable_amount NULL), then allocated, then updated. If allocation
// fails (exhausted → 409) or the update fails, the just-inserted order row
// is deleted again and the allocation released — no order row is ever left
// behind by a failed allocation, which is the guarantee that matters.
import { getSql, first, type Row } from "../db";
import { ApiError } from "../errors";
import { gatewayConfig } from "../config/gateway";
import { decryptText } from "../crypto";
import { allocatePayableAmount, getMerchantQrSettings, releaseAllocation, toPaiseStrict, paiseToAmount, type QrMethod } from "./allocations";
import { notifyOrderEvent } from "../notifications";
import crypto from "node:crypto";

export interface AccountRow {
  id: number; user_id: number; provider: string; label: string; upi_id: string | null;
  payee_name: string | null; credentials: string | null; is_active: boolean; is_default: boolean;
  daily_limit: string | null;
}
export function decryptAccountCredentials(a: AccountRow): Record<string, string> {
  if (!a.credentials) return {};
  try { return JSON.parse(decryptText(a.credentials) ?? "{}"); } catch { return {}; }
}
export function accountEnvironment(a: AccountRow): string | null {
  const c = decryptAccountCredentials(a);
  if (a.provider === "paytm_pg" || a.provider === "phonepe_pg") return c.environment ?? null;
  return "live"; // paytm_business / manual
}
export function isHostedProvider(p: string): boolean { return p === "paytm_pg" || p === "phonepe_pg"; }

export async function usedToday(sql: ReturnType<typeof getSql>, accountId: number): Promise<number> {
  const rows = await sql`
    SELECT COALESCE(SUM(amount), 0) AS total FROM orders
    WHERE payment_account_id = ${accountId}
      AND ((status = 'paid' AND paid_at >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date::timestamp AT TIME ZONE 'Asia/Kolkata')
        OR status IN ('pending', 'review'))`;
  return Number((rows as { total: string }[])[0]?.total ?? 0);
}

/** One aggregate query for every account of a merchant (IST day, same
 * definition as usedToday). Used by resolveAccount's rotation loop and by
 * the accounts routes — the old per-account loop was N+1. */
export async function usedTodayByAccount(sql: ReturnType<typeof getSql>, userId: number): Promise<Map<number, number>> {
  const rows = await sql`
    SELECT payment_account_id, COALESCE(SUM(amount), 0) AS total FROM orders
    WHERE user_id = ${userId}
      AND ((status = 'paid' AND paid_at >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date::timestamp AT TIME ZONE 'Asia/Kolkata')
        OR status IN ('pending', 'review'))
    GROUP BY payment_account_id`;
  const out = new Map<number, number>();
  for (const r of rows as { payment_account_id: number | string; total: string }[]) {
    out.set(Number(r.payment_account_id), Number(r.total ?? 0));
  }
  return out;
}

export async function resolveAccount(sql: ReturnType<typeof getSql>, userId: number, amount: number, accountId?: number | null, rotationMode = "random"): Promise<AccountRow> {
  const accounts = (await sql`SELECT * FROM payment_accounts WHERE user_id = ${userId} AND is_active = true ORDER BY id ASC`) as AccountRow[];
  if (accountId != null) {
    const a = accounts.find((x) => Number(x.id) === accountId);
    if (!a) throw new ApiError(422, "Payment account not found or not active.");
    if (a.provider === "paytm_business" && !gatewayConfig.enablePaytmBusiness) throw new ApiError(422, "Paytm for Business is disabled.");
    if (accountEnvironment(a) !== "live") throw new ApiError(422, "Payment account is not a live account.");
    const used = await usedToday(sql, a.id);
    if (a.daily_limit !== null && used + amount > Number(a.daily_limit)) throw new ApiError(422, "This payment account has reached its daily limit.");
    return a;
  }
  const live = accounts.filter((a) => accountEnvironment(a) === "live" && !(a.provider === "paytm_business" && !gatewayConfig.enablePaytmBusiness));
  // Single aggregate query for all accounts (was one usedToday per account).
  const usedByAccount = await usedTodayByAccount(sql, userId);
  const withRoom: AccountRow[] = [];
  for (const a of live) {
    const used = usedByAccount.get(Number(a.id)) ?? 0;
    if (a.daily_limit === null || used + amount <= Number(a.daily_limit)) withRoom.push(a);
  }
  if (!withRoom.length) {
    if (!live.length) throw new ApiError(422, "Add an active Live payment account before creating orders.");
    throw new ApiError(422, "All UPI accounts have reached their daily limit. Try again tomorrow or raise a daily limit.");
  }
  if (rotationMode === "default") {
    return withRoom.find((a) => a.is_default) ?? withRoom[0];
  }
  return withRoom[crypto.randomInt(withRoom.length)];
}

export function newOrderNo(environment: "live" | "sandbox"): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const suffix = Array.from({ length: 16 }, () => chars[crypto.randomInt(chars.length)]).join("");
  return (environment === "sandbox" ? "TST" : "ORD") + suffix;
}

export interface CreateOrderInput {
  userId: number; environment: "live" | "sandbox"; amount: number;
  clientOrderId?: string; paymentAccountId?: number | null;
  customerName?: string | null; customerEmail?: string | null; customerMobile?: string | null;
  note?: string | null; redirectUrl?: string | null;
  // Per-order QR method (Round 7, API vocabulary: "unique" | "normal").
  // Overrides the merchant's Settings → QR method for this order only.
  // Absent = merchant setting (which itself falls back to the env default,
  // unique). Ignored for sandbox orders, which always pay the plain amount.
  qrMethod?: "unique" | "normal";
}

export async function createOrder(input: CreateOrderInput) {
  const sql = getSql();
  const orderNo = newOrderNo(input.environment);
  const clientOrderId = input.clientOrderId ?? orderNo;
  let account: AccountRow | null = null;
  if (input.environment === "live") {
    const merchant = first<Row>(await sql`SELECT rotation_mode FROM users WHERE id = ${input.userId}`);
    account = await resolveAccount(sql, input.userId, input.amount, input.paymentAccountId ?? null, (merchant?.rotation_mode as string) ?? "random");
  } else if (input.paymentAccountId) {
    throw new ApiError(422, "payment_account_id is not allowed for sandbox orders.");
  }
  const expiresAt = new Date(Date.now() + gatewayConfig.orderExpiryMinutes * 60 * 1000).toISOString();
  // QR method for live orders: merchant setting first, then the per-order
  // override (Round 7). Sandbox always pays the plain amount.
  let qrMethod: QrMethod = gatewayConfig.qrMethod;
  let qrIncrementPaise = gatewayConfig.qrIncrementPaise;
  if (input.environment === "live") {
    const settings = await getMerchantQrSettings(sql, input.userId);
    qrMethod = settings.method;
    qrIncrementPaise = settings.incrementPaise;
    // Per-order override wins over the merchant setting; absent = keep the
    // setting (API compatibility — old clients never send qr_method).
    // "normal" is the API spelling of the internal/DB "same".
    if (input.qrMethod === "unique") qrMethod = "unique";
    else if (input.qrMethod === "normal") qrMethod = "same";
  }
  const basePaise = toPaiseStrict(input.amount);
  const useUnique = input.environment === "live" && qrMethod === "unique";
  try {
    const rows = await sql`
      INSERT INTO orders (order_no, user_id, payment_account_id, client_order_id, amount, payable_amount, status, environment,
        customer_name, customer_email, customer_mobile, note, redirect_url, expires_at, original_expires_at)
      VALUES (${orderNo}, ${input.userId}, ${account?.id ?? null}, ${clientOrderId}, ${input.amount}, ${useUnique ? null : paiseToAmount(basePaise)}, 'pending', ${input.environment},
        ${input.customerName ?? null}, ${input.customerEmail ?? null}, ${input.customerMobile ?? null},
        ${input.note ?? null}, ${input.redirectUrl ?? null}, ${expiresAt}, ${expiresAt})
      RETURNING *`;
    const order = (rows as import("./types").OrderRow[])[0];
    // DAILY-LIMIT RACE (best-effort guard, hardened Round 7 — G10):
    // resolveAccount checked the limit before the insert, but two
    // concurrent creates can both pass that check. The re-check and the
    // delete are therefore ONE conditional DELETE statement: the limit test
    // lives inside the statement's WHERE clause, so no concurrent insert
    // or expiry can slip between the check and the delete (the old two-step
    // SELECT-then-DELETE had that window — the SELECT could pass while a
    // concurrent insert pushed the account over the limit before the DELETE
    // ran, and a DELETE that ran after an expiry dropped the total back
    // under the limit would remove an order that was now within limit).
    // The DELETE only fires while this order is still 'pending' and the
    // account total (paid-today + pending + review, the same definition as
    // usedToday, and including this just-inserted order) is over the limit;
    // the affected-row count is the verdict — 1 row means this order pushed
    // the account over and was removed, 0 rows means the account is within
    // limit and the order stays. Every creation path funnels through
    // createOrder, so a concurrent create that lands after this statement's
    // snapshot runs its own guard, which then sees this order.
    //
    // RESIDUAL WINDOW (cannot be closed on the Neon HTTP driver — no
    // multi-statement FOR UPDATE transaction across awaits, see lib/db.ts):
    // (1) the process crashes, or the guard statement errors, between the
    // INSERT and the guard — the over-limit order survives; on a guard
    // error the 422 below is still returned, so the caller is told the
    // order failed while the row may remain (there is no reconciliation
    // pass over over-limit pending orders yet); (2) the limit is only
    // enforced at creation time — a later daily_limit *lowering* does not
    // retroactively cancel already-created pending orders.
    if (account && account.daily_limit !== null) {
      const limit = Number(account.daily_limit);
      let deleted = 0;
      try {
        const rows = await sql`
          DELETE FROM orders WHERE id = ${order.id} AND status = 'pending'
            AND (SELECT COALESCE(SUM(amount), 0) FROM orders
              WHERE payment_account_id = ${account.id}
                AND ((status = 'paid' AND paid_at >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date::timestamp AT TIME ZONE 'Asia/Kolkata')
                  OR status IN ('pending', 'review'))) > ${limit}
          RETURNING id`;
        deleted = (rows as unknown[]).length;
      } catch {
        // Guard statement failed (network/DB error): fall back to a plain
        // status-guarded delete so a possibly-over-limit order does not
        // silently survive as a payable link the caller was told failed.
        // Still reports 422 below.
        try {
          const retry = await sql`DELETE FROM orders WHERE id = ${order.id} AND status = 'pending' RETURNING id`;
          deleted = (retry as unknown[]).length;
        } catch { /* best-effort */ }
      }
      if (deleted > 0) {
        throw new ApiError(422, "This payment account has reached its daily limit.");
      }
    }
    // Merchant notification (Round 5 integration): the hook lives here,
    // in the shared createOrder, so BOTH creation paths notify — the
    // dashboard form (POST /api/orders) and the API-key path
    // (POST /api/v1/orders), which share handleCreateOrderDispatch. An
    // idempotency replay never reaches createOrder, so a replay cannot
    // double-notify; a retried creation is deduped by `order_created:<id>`.
    // Best-effort — notifyOrderEvent never throws, so creation is unaffected.
    if (!useUnique) {
      await notifyOrderEvent("order_created", order);
      return order;
    }
    try {
      const allocated = await allocatePayableAmount(sql, {
        userId: input.userId, paymentAccountId: account?.id ?? null, orderId: order.id,
        orderNo, baseAmount: input.amount, method: "unique",
        incrementPaise: qrIncrementPaise, expiresAt,
      });
      const updated = await sql`UPDATE orders SET payable_amount = ${allocated.payableAmount}, updated_at = NOW() WHERE id = ${order.id} RETURNING *`;
      const finalOrder = (updated as import("./types").OrderRow[])[0];
      await notifyOrderEvent("order_created", finalOrder);
      return finalOrder;
    } catch (e) {
      // Allocation (or the payable update) failed: leave no order row behind.
      try { await releaseAllocation(sql, order.id, "failed"); } catch { /* best-effort */ }
      try { await sql`DELETE FROM orders WHERE id = ${order.id} AND status = 'pending'`; } catch { /* best-effort */ }
      throw e;
    }
  } catch (e) {
    // ApiErrors (e.g. the 409 from an exhausted allocation) pass through
    // untouched; only a raw DB duplicate-key becomes the idempotency 409.
    if (e instanceof ApiError) throw e;
    const msg = String((e as Error)?.message ?? "");
    if (msg.includes("orders_user_environment_client_unique") || msg.includes("duplicate key")) {
      throw new ApiError(409, "client_order_id already exists for this environment.");
    }
    throw e;
  }
}

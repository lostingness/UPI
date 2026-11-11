// check() — port of OrderService::check / checkWithoutOverlap / checkLatePayment.
// Serverless lease redesign (§8 OPEN QUESTION resolved): no PID/process identity
// exists on Vercel. The lease is token+generation+expiry only, stored on the
// order row; an expired lease may be taken by any invocation (no `ps` liveness
// check is possible — the VerificationProcessInspector is NOT MIGRATABLE).
// Throttle: at most once per check_interval_seconds (3 s) unless forced.
// Sandbox: no provider call — expire if past expiry, else return.
// Live: past expiry + outside late grace → expire without a provider call;
// else claim lease → verifier->check() → paid → markPaid; past expiry → expire.
import { getSql, first, type Row } from "../db";
import { gatewayConfig } from "../config/gateway";
import type { OrderRow } from "./types";
import { isPastExpiry, canRecoverLatePayment, isWithinLatePaymentGrace } from "./types";
import { verifyOrder } from "../verifiers";
import { decryptAccountCredentials, type AccountRow } from "./create";
import { markPaidInDb } from "./mark-paid";
import { expireOrderInDb } from "./expire";
import crypto from "node:crypto";

export async function loadOrderByNo(orderNo: string): Promise<OrderRow | null> {
  const sql = getSql();
  const row = first<OrderRow>(await sql`SELECT * FROM orders WHERE order_no = ${orderNo}`);
  return row ?? null;
}
export async function loadAccount(accountId: number | null): Promise<AccountRow | null> {
  if (!accountId) return null;
  const sql = getSql();
  const row = first<AccountRow>(await sql`SELECT * FROM payment_accounts WHERE id = ${accountId}`);
  return row ?? null;
}

async function acquireLease(order: OrderRow): Promise<{ token: string; generation: number } | null> {
  const sql = getSql();
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + gatewayConfig.verificationLeaseSeconds * 1000).toISOString();
  const updated = await sql`
    UPDATE orders SET verification_token = ${token}, verification_generation = verification_generation + 1,
      verification_started_at = NOW(), verification_expires_at = ${expiresAt},
      verification_node_id = 'vercel', verification_node_instance_id = NULL, verification_process_identity = NULL,
      last_checked_at = NOW(), updated_at = NOW()
    WHERE id = ${order.id}
      AND (verification_expires_at IS NULL OR verification_expires_at <= NOW())
      AND (last_checked_at IS NULL OR last_checked_at <= NOW() - (${gatewayConfig.checkIntervalSeconds} * INTERVAL '1 second'))
    RETURNING verification_generation`;
  const row = (updated as { verification_generation: number }[])[0];
  return row ? { token, generation: Number(row.verification_generation) } : null;
}

export interface CheckOrderOpts {
  /** Called exactly when the verification lease is acquired, so batch
   * callers can count "actually checked" orders (throttled / lease-held
   * orders never acquire a lease and must not be counted). */
  onLeaseAcquired?: () => void;
}

export async function checkOrder(order: OrderRow, force = false, opts: CheckOrderOpts = {}): Promise<OrderRow> {
  const now = new Date();
  if (order.status === "paid" || order.status === "failed") return order;
  if (order.environment === "sandbox") {
    if (order.status === "pending" && isPastExpiry(order, now)) { await expireOrderInDb(order); return { ...order, status: "expired" }; }
    return order;
  }
  if (order.status === "expired" && !canRecoverLatePayment(order, gatewayConfig.latePaymentGraceHours, now)) return order;
  if (order.status === "pending" && isPastExpiry(order, now) && !isWithinLatePaymentGrace(order, gatewayConfig.latePaymentGraceHours, now)) {
    await expireOrderInDb(order); return { ...order, status: "expired" };
  }
  const account = await loadAccount(order.payment_account_id);
  if (!account) return order;
  // Throttle unless forced.
  if (!force && order.last_checked_at) {
    const last = new Date(order.last_checked_at).getTime();
    if (Date.now() - last < gatewayConfig.checkIntervalSeconds * 1000) return order;
  }
  const lease = await acquireLease(order);
  if (!lease) return order; // another invocation holds the lease / throttled
  opts.onLeaseAcquired?.();
  const creds = decryptAccountCredentials(account);
  const result = await verifyOrder(
    { ...order, amount: order.amount, payment_account_id: order.payment_account_id },
    account.provider,
    { id: account.id, credentials: creds, environment: creds.environment ?? "live" },
  );
  if (result.paid) {
    try {
      const outcome = await markPaidInDb(order, result, {
        accountProvider: account.provider, accountId: account.id,
        accountEnvironment: creds.environment ?? (account.provider === "paytm_pg" || account.provider === "phonepe_pg" ? creds.environment ?? null : "live"),
        existingUtrUsed: async (utr, userId) => {
          const sql = getSql();
          const rows = await sql`SELECT id FROM orders WHERE user_id = ${userId} AND (utr = ${utr} OR customer_utr = ${utr}) AND id <> ${order.id} LIMIT 1`;
          return (rows as unknown[]).length > 0;
        },
      });
      return outcome === "paid" ? { ...order, status: "paid" } : order;
    } catch (e) {
      // markPaid failed (evidence rejected / status changed): clear the
      // lease so the next check is not blocked until it expires, then
      // let the error propagate — the caller decides how to report it.
      const sql = getSql();
      await sql`UPDATE orders SET verification_token = NULL, verification_expires_at = NULL, updated_at = NOW()
        WHERE id = ${order.id} AND verification_token = ${lease.token}`;
      throw e;
    }
  }
  // Not paid: persist provider response for the debugger, clear the lease.
  const sql = getSql();
  await sql`UPDATE orders SET provider_response = ${JSON.stringify(result.raw)}::jsonb,
    verification_token = NULL, verification_expires_at = NULL, updated_at = NOW()
    WHERE id = ${order.id} AND verification_token = ${lease.token}`;
  if (isPastExpiry(order, now)) {
    // REVIEW ORDERS STAY IN REVIEW: expireOrderInDb only transitions
    // pending → expired. Only report 'expired' when the DB transition
    // actually succeeded; a review order whose expiry passed keeps its
    // status until the merchant approves or rejects the submitted UTR.
    // (Previously this returned status 'expired' unconditionally — a
    // phantom expiry the merchant never approved.)
    const expired = await expireOrderInDb({ ...order });
    if (expired === "expired") return { ...order, status: "expired" };
    return order;
  }
  return order;
}

/** Scheduler phase 1+2: due pending orders, then recoverable expired orders. */
export async function checkPendingBatch(): Promise<{ checked: number; paid: number; expired: number }> {
  const sql = getSql();
  const due = (await sql`
    SELECT * FROM orders WHERE status = 'pending'
      AND (last_checked_at IS NULL OR last_checked_at <= NOW() - (${gatewayConfig.checkIntervalSeconds} * INTERVAL '1 second'))
    ORDER BY last_checked_at NULLS FIRST, created_at ASC
    LIMIT ${gatewayConfig.pendingVerificationBatchSize}`) as OrderRow[];
  let checked = 0, paid = 0, expired = 0;
  // `checked` counts only orders whose verification lease was actually
  // acquired — throttled / lease-held orders are skipped, not counted.
  const countLease = () => { checked++; };
  for (const o of due) {
    try { const after = await checkOrder(o, false, { onLeaseAcquired: countLease }); if (after.status === "paid") paid++; if (after.status === "expired") expired++; }
    catch { /* per-order errors isolated; last_checked_at was advanced by the lease claim */ }
  }
  const recoverable = (await sql`
    SELECT * FROM orders WHERE status = 'expired'
      AND original_expires_at >= NOW() - (${gatewayConfig.latePaymentGraceHours} * INTERVAL '1 hour')
      AND (last_checked_at IS NULL OR last_checked_at <= NOW() - (${gatewayConfig.latePaymentCheckIntervalSeconds} * INTERVAL '1 second'))
    ORDER BY last_checked_at NULLS FIRST, created_at ASC
    LIMIT ${gatewayConfig.latePaymentBatchSize}`) as OrderRow[];
  for (const o of recoverable) {
    try { const after = await checkOrder(o, false, { onLeaseAcquired: countLease }); if (after.status === "paid") paid++; }
    catch { /* isolated */ }
  }
  return { checked, paid, expired };
}
export type { Row };

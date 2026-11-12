// Admin manual-payment override — port of OrderService::adminOverridePaid.
// Live orders only; not already paid; amount must equal the order's PAYABLE
// amount (the amount the customer was actually asked to pay — a few paise
// above the order amount for a Unique-Amount QR); reference 6–80
// [A-Za-z0-9_-]; reason 20–500 chars. Sets status paid,
// utr = provider_txn_id = reference (uppercased), verified_by=admin_override,
// paid_at now; writes an AdminAuditLog row; emits order.paid.
//
// Round 7 (G2) narrowing: the override used to accept ANY non-paid order.
// It now only applies to orders in `review` (merchant UTR review — the
// override is the admin's way of approving a reviewed payment) or `expired`
// inside the late-payment grace window (a late payment the admin confirmed
// against the bank). Pending orders must go through provider verification
// or the UTR review flow, never a bare override — a pending order has no
// payment evidence attached at all.
import { getSql } from "../db";
import { ApiError, isUniqueViolation } from "../errors";
import { recordOutboxEvent } from "../webhooks/outbox";
import { auditLog } from "../audit";
import type { OrderRow } from "./types";
import { payableAmountFor, isWithinLatePaymentGrace } from "./types";
import { gatewayConfig } from "../config/gateway";
import { releaseAllocation } from "./allocations";
import { notifyOrderEvent } from "../notifications";

/** G2 pure gate: which orders may an admin override to paid? */
export function adminOverrideAllowed(order: OrderRow, now = new Date()): string | null {
  if (order.environment !== "live") return "Only live orders can be overridden.";
  if (order.status === "paid") return "Order is already paid.";
  // Narrowed (G2): review, or expired inside the late-payment grace window.
  if (order.status === "review") return null;
  if (order.status === "expired") {
    return isWithinLatePaymentGrace(order, gatewayConfig.latePaymentGraceHours, now)
      ? null
      : "This order is past the late-payment grace window and can no longer be overridden.";
  }
  return "Only orders under review or expired within the late-payment grace window can be overridden.";
}

export async function adminOverridePaid(order: OrderRow, adminId: number, ip: string | null, amount: number, reference: string, reason: string): Promise<OrderRow> {
  const gate = adminOverrideAllowed(order);
  if (gate) throw new ApiError(422, gate);
  if (Number(amount).toFixed(2) !== payableAmountFor(order)) throw new ApiError(422, "Amount must equal the payable amount.");
  const ref = reference.toUpperCase();
  const sql = getSql();
  // G2: the clash query must cover customer_utr too — an override reference
  // that another order already submitted for review is the same UTR.
  const clash = await sql`SELECT id FROM orders WHERE user_id = ${order.user_id} AND (utr = ${ref} OR customer_utr = ${ref}) AND id <> ${order.id} LIMIT 1`;
  if ((clash as unknown[]).length > 0) throw new ApiError(422, "This UTR is already used for another order.");
  let updated;
  try {
    updated = await sql`
    UPDATE orders SET status = 'paid', utr = ${ref}, provider_txn_id = ${ref}, verified_by = 'admin_override',
      paid_at = NOW(), updated_at = NOW()
    WHERE id = ${order.id} AND status IN ('review', 'expired') RETURNING *`;
  } catch (e) {
    // G4: the orders.utr unique index is the backstop for the race above.
    if (isUniqueViolation(e)) throw new ApiError(409, "This UTR is already used for another order.");
    throw e;
  }
  const row = (updated as OrderRow[])[0];
  if (!row) throw new ApiError(409, "Order status changed while applying the override");
  // Paid: the unique amount can be reused (row kept for audit).
  try { await releaseAllocation(sql, order.id, "paid"); } catch { /* best-effort */ }
  await auditLog(sql, adminId, "order_manual_payment_override", "order", order.id, {
    order_no: order.order_no, merchant_id: order.user_id, amount: Number(order.amount).toFixed(2),
    verification_reference: ref, reason,
  }, ip);
  await recordOutboxEvent(sql, row, "order.paid");
  // G2/G11: an override-paid order notifies the merchant exactly like any
  // other payment — the merchant must learn a payment was marked paid.
  await notifyOrderEvent("payment_received", row);
  return row;
}

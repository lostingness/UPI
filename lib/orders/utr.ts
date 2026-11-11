// UTR review flow — port of OrderService submit/approve/rejectCustomerUtr.
// SECURITY: submitting a UTR NEVER marks an order paid. It only moves the
// order to `review`; a merchant must approve it after checking their own bank
// app (bank_utr must timing-safe-equal the submitted customer_utr AND the
// received amount must equal the order's PAYABLE amount exactly — the payable
// amount is what lands in the bank, which for a Unique-Amount QR is a few
// paise above the order amount). Approve → paid (verified_by=utr_review);
// reject → pending with a fresh expiry (attempts remain) or expired (attempts
// exhausted, max 3).
import { getSql } from "../db";
import { timingSafeEqual } from "../crypto";
import { ApiError } from "../errors";
import { recordOutboxEvent } from "../webhooks/outbox";
import type { OrderRow } from "./types";
import { acceptsCustomerUtr, payableAmountFor } from "./types";
import { gatewayConfig } from "../config/gateway";
import { releaseAllocation } from "./allocations";
import { notifyOrderEvent } from "../notifications";

export function normalizeUtr(utr: string): string { return utr.replace(/\s+/g, "").toUpperCase(); }

export async function submitCustomerUtr(order: OrderRow, accountProvider: string | null, rawUtr: string): Promise<OrderRow> {
  if (!acceptsCustomerUtr(order, accountProvider)) {
    throw new ApiError(422, "This order does not accept a UTR submission.");
  }
  const utr = normalizeUtr(rawUtr);
  const sql = getSql();
  // Clash check covers BOTH columns: a UTR already paid (orders.utr) and a
  // UTR already submitted for review on another order (customer_utr).
  const clash = await sql`SELECT id FROM orders WHERE user_id = ${order.user_id} AND (utr = ${utr} OR customer_utr = ${utr}) LIMIT 1`;
  if ((clash as unknown[]).length > 0) throw new ApiError(422, "This UTR is already used for another order.");
  const updated = await sql`
    UPDATE orders SET status = 'review', customer_utr = ${utr}, utr_submitted_at = NOW(),
      utr_attempts = utr_attempts + 1, review_note = NULL, updated_at = NOW()
    WHERE id = ${order.id} AND status IN ('pending', 'expired') AND utr_attempts < 3 RETURNING *`;
  const row = (updated as OrderRow[])[0];
  if (!row) throw new ApiError(409, "Order status changed while submitting the UTR");
  await recordOutboxEvent(sql, row, "order.under_review");
  return row;
}

export async function approveCustomerUtr(order: OrderRow, bankUtr: string, receivedAmount: number): Promise<OrderRow> {
  if (order.status !== "review") throw new ApiError(422, "Order is not under review.");
  // The merchant approves against the bank statement amount — the payable
  // amount is what lands in the bank. UTR alone never marks paid: approval
  // is a deliberate merchant action after checking both the UTR and this amount.
  // Compared as integer paise, never float equality.
  if (Math.round(Number(receivedAmount) * 100) !== Math.round(Number(payableAmountFor(order)) * 100)) {
    throw new ApiError(422, "Received amount must equal the payable amount exactly.");
  }
  const submitted = normalizeUtr(order.customer_utr ?? "");
  if (!submitted || !timingSafeEqual(normalizeUtr(bankUtr), submitted)) {
    throw new ApiError(422, "The bank UTR does not match the submitted UTR.");
  }
  const sql = getSql();
  const clash = await sql`SELECT id FROM orders WHERE user_id = ${order.user_id} AND (utr = ${submitted} OR customer_utr = ${submitted}) AND id <> ${order.id} LIMIT 1`;
  if ((clash as unknown[]).length > 0) throw new ApiError(422, "This UTR is already used for another order.");
  const updated = await sql`
    UPDATE orders SET status = 'paid', utr = ${submitted}, verified_by = 'utr_review',
      paid_at = NOW(), review_note = NULL, updated_at = NOW()
    WHERE id = ${order.id} AND status = 'review' RETURNING *`;
  const row = (updated as OrderRow[])[0];
  if (!row) throw new ApiError(409, "Order status changed while approving the UTR");
  // Paid: the unique amount can be reused (row kept for audit).
  try { await releaseAllocation(sql, order.id, "paid"); } catch { /* best-effort */ }
  await recordOutboxEvent(sql, row, "order.paid");
  return row;
}

export async function rejectCustomerUtr(order: OrderRow, reason?: string): Promise<OrderRow> {
  if (order.status !== "review") throw new ApiError(422, "Order is not under review.");
  // DECISION (documented): a rejection emits NO webhook event of its own.
  // The customer already sees the rejection on the pay page (review_note),
  // and a fresh UTR attempt keeps the order pending; only the terminal
  // transition (attempts exhausted → expired) emits order.expired below.
  // No order.utr_rejected event type is introduced.
  const sql = getSql();
  const attemptsLeft = order.utr_attempts < 3;
  const note = reason ?? "UTR was not found in the merchant's account.";
  const updated = attemptsLeft
    ? await sql`UPDATE orders SET status = 'pending', review_note = ${note},
        expires_at = NOW() + (${gatewayConfig.orderExpiryMinutes} * INTERVAL '1 minute'),
        updated_at = NOW() WHERE id = ${order.id} AND status = 'review' RETURNING *`
    : await sql`UPDATE orders SET status = 'expired', review_note = ${note}, updated_at = NOW()
        WHERE id = ${order.id} AND status = 'review' RETURNING *`;
  const row = (updated as OrderRow[])[0];
  if (!row) throw new ApiError(409, "Order status changed while rejecting the UTR");
  if (!attemptsLeft) {
    await recordOutboxEvent(sql, row, "order.expired");
    // Merchant notification (Round 5 integration): the terminal
    // reject→expired transition notifies exactly like the expiry sweep
    // (lib/orders/expire.ts). A non-terminal rejection (attempts remain,
    // order back to pending) notifies nothing — the customer already sees
    // the review_note on the pay page. Best-effort, never blocks.
    await notifyOrderEvent("order_expired", row);
    // Expired: the unique amount can be reused (row kept for audit).
    try { await releaseAllocation(sql, order.id, "expired"); } catch { /* best-effort */ }
  }
  return row;
}

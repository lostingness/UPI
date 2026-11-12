// UTR review flow — port of OrderService submit/approve/rejectCustomerUtr.
// SECURITY: submitting a UTR NEVER marks an order paid. It only moves the
// order to `review`; a merchant must approve it after checking their own bank
// app (bank_utr must timing-safe-equal the submitted customer_utr AND the
// received amount must equal the order's PAYABLE amount exactly — the payable
// amount is what lands in the bank, which for a Unique-Amount QR is a few
// paise above the order amount). Approve → paid (verified_by=utr_review);
// reject → pending with a fresh expiry (attempts remain) or expired (attempts
// exhausted, max 3).
//
// G1 (DOCUMENTED, BY DESIGN — DO NOT "FIX"): the manual/UTR path has ZERO
// bank verification. Merchant attestation IS the trust model here: the
// merchant checks their own bank statement and approves. No code in this
// file may ever mark an order paid on a submitted UTR alone.
import { getSql } from "../db";
import { timingSafeEqual } from "../crypto";
import { ApiError, isUniqueViolation } from "../errors";
import { recordOutboxEvent } from "../webhooks/outbox";
import type { OrderRow } from "./types";
import { acceptsCustomerUtr, payableAmountFor, isPastExpiry, isWithinLatePaymentGrace } from "./types";
import { gatewayConfig } from "../config/gateway";
import { releaseAllocation } from "./allocations";
import { notifyOrderEvent } from "../notifications";

export function normalizeUtr(utr: string): string { return utr.replace(/\s+/g, "").toUpperCase(); }

/** M2: mask a bank UTR for the public pay page — only the last 4 digits are
 * shown (`••••••9012`). The payer already knows their own UTR; a link holder
 * must not learn the full bank reference. */
export function maskUtr(utr: string | null | undefined): string | null {
  if (!utr) return null;
  const v = String(utr);
  if (v.length <= 4) return "••••";
  return "•".repeat(v.length - 4) + v.slice(-4);
}

/** G3: UTR-review approval is only valid inside the late-payment window —
 * the same occurredAt ≤ expiry + 24 h rule the provider path enforces in
 * validateVerificationEvidence (there the payment's own timestamp is
 * checked; here the approval itself must happen inside the window, because
 * a review order has no provider timestamp to check). */
export function utrApproveWithinGrace(order: OrderRow, now = new Date()): boolean {
  if (!isPastExpiry(order, now)) return true;
  return isWithinLatePaymentGrace(order, gatewayConfig.latePaymentGraceHours, now);
}

export async function submitCustomerUtr(order: OrderRow, accountProvider: string | null, rawUtr: string): Promise<OrderRow> {
  if (!acceptsCustomerUtr(order, accountProvider)) {
    throw new ApiError(422, "This order does not accept a UTR submission.");
  }
  const utr = normalizeUtr(rawUtr);
  const sql = getSql();
  // Clash check covers BOTH columns: a UTR already paid (orders.utr) and a
  // UTR already submitted for review on another order (customer_utr).
  // G5: exclude SELF — re-submitting the same UTR on the same order (e.g.
  // after a reject that kept the value) must not clash with itself.
  const clash = await sql`SELECT id FROM orders WHERE user_id = ${order.user_id} AND (utr = ${utr} OR customer_utr = ${utr}) AND id <> ${order.id} LIMIT 1`;
  if ((clash as unknown[]).length > 0) throw new ApiError(422, "This UTR is already used for another order.");
  let updated;
  try {
    updated = await sql`
    UPDATE orders SET status = 'review', customer_utr = ${utr}, utr_submitted_at = NOW(),
      utr_attempts = utr_attempts + 1, review_note = NULL, updated_at = NOW()
    WHERE id = ${order.id} AND status IN ('pending', 'expired') AND utr_attempts < 3 RETURNING *`;
  } catch (e) {
    // G4: the (user_id, customer_utr) partial unique index (migration 016)
    // is the backstop for the check-then-act race above — a lost race
    // surfaces as 23505, mapped to a clean 409, never a 500.
    if (isUniqueViolation(e)) throw new ApiError(409, "This UTR is already used for another order.");
    throw e;
  }
  const row = (updated as OrderRow[])[0];
  if (!row) throw new ApiError(409, "Order status changed while submitting the UTR");
  await recordOutboxEvent(sql, row, "order.under_review");
  return row;
}

export async function approveCustomerUtr(order: OrderRow, bankUtr: string, receivedAmount: number): Promise<OrderRow> {
  if (order.status !== "review") throw new ApiError(422, "Order is not under review.");
  // G3: a review that sat past the late-payment grace window can no longer
  // be approved — mirror the provider path's occurredAt ≤ expiry + 24 h.
  if (!utrApproveWithinGrace(order)) throw new ApiError(422, "This order is past the late-payment grace window and can no longer be approved.");
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
  let updated;
  try {
    updated = await sql`
    UPDATE orders SET status = 'paid', utr = ${submitted}, verified_by = 'utr_review',
      paid_at = NOW(), review_note = NULL, updated_at = NOW()
    WHERE id = ${order.id} AND status = 'review' RETURNING *`;
  } catch (e) {
    // G4: the orders.utr unique index is the backstop for the race above.
    if (isUniqueViolation(e)) throw new ApiError(409, "This UTR is already used for another order.");
    throw e;
  }
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
  // G5: a rejection clears customer_utr — the rejected value must not linger
  // on the order (it would clash with the payer's next submission for a
  // different order and would keep showing a dead UTR on the pay page).
  // The payer re-enters a fresh UTR; attempts remain the only memory.
  const updated = attemptsLeft
    ? await sql`UPDATE orders SET status = 'pending', customer_utr = NULL, review_note = ${note},
        expires_at = NOW() + (${gatewayConfig.orderExpiryMinutes} * INTERVAL '1 minute'),
        updated_at = NOW() WHERE id = ${order.id} AND status = 'review' RETURNING *`
    : await sql`UPDATE orders SET status = 'expired', customer_utr = NULL, review_note = ${note}, updated_at = NOW()
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

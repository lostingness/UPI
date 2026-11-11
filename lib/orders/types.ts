// Order types + canonical shapes (port of Order model constants / toApiArray).
export type OrderStatus = "pending" | "paid" | "expired" | "review" | "failed";
export type OrderEnvironment = "live" | "sandbox";
export const MAX_UTR_ATTEMPTS = 3;
export const UTR_GRACE_MINUTES = 60;

export interface OrderRow {
  id: number; order_no: string; user_id: number; payment_account_id: number | null;
  client_order_id: string; amount: string; status: OrderStatus; environment: OrderEnvironment;
  customer_name: string | null; customer_email: string | null; customer_mobile: string | null;
  note: string | null; redirect_url: string | null; utr: string | null; customer_utr: string | null;
  utr_submitted_at: string | null; utr_attempts: number; review_note: string | null;
  provider_txn_id: string | null; provider_response: Record<string, unknown> | null;
  provider_checkout: Record<string, unknown> | null; verified_by: string | null;
  /** The amount the customer must actually pay (migration 013). Equals
   * `amount` for Same-Amount QR; the unique allocated amount for
   * Unique-Amount QR. Optional so pre-013 rows / older literals still
   * typecheck — code falls back to `amount` when it is NULL/undefined. */
  payable_amount?: string | null;
  paid_at: string | null; expires_at: string | null; original_expires_at: string | null;
  last_checked_at: string | null; sandbox_simulated_at: string | null;
  webhook_event_sequence: number; verification_token: string | null;
  verification_generation: number; verification_expires_at: string | null;
  verification_pid: number | null; verification_started_at: string | null;
  verification_node_id: string | null; verification_node_instance_id: string | null;
  verification_process_identity: string | null;
  created_at: string; updated_at: string;
}

export function isPending(o: OrderRow): boolean { return o.status === "pending"; }

/** The amount the customer was actually asked to pay: the unique allocated
 * amount when set, otherwise the order amount (Same-Amount QR, sandbox,
 * and pre-013 orders). Always a 2dp string. */
export function payableAmountFor(o: Pick<OrderRow, "amount" | "payable_amount">): string {
  return o.payable_amount != null && o.payable_amount !== ""
    ? Number(o.payable_amount).toFixed(2)
    : Number(o.amount).toFixed(2);
}

/** Which QR method produced this order. A Unique-Amount order always has a
 * payable amount a few paise above the order amount (allocation adds at
 * least 1 paise), so the comparison is exact — never a guess. */
export function qrMethodForOrder(o: Pick<OrderRow, "amount" | "payable_amount">): "unique" | "same" {
  return o.payable_amount != null && Number(o.payable_amount).toFixed(2) !== Number(o.amount).toFixed(2)
    ? "unique"
    : "same";
}
export function isPastExpiry(o: OrderRow, now = new Date()): boolean {
  return !!o.expires_at && new Date(o.expires_at).getTime() < now.getTime();
}
export function originalExpiryDeadline(o: OrderRow): Date {
  return new Date(o.original_expires_at ?? o.expires_at ?? Date.now());
}
/** Late-payment grace: expired + live + within grace hours after original expiry. */
export function isWithinLatePaymentGrace(o: OrderRow, graceHours: number, now = new Date()): boolean {
  if (graceHours <= 0) return false;
  return now.getTime() <= originalExpiryDeadline(o).getTime() + graceHours * 3600 * 1000;
}
export function canRecoverLatePayment(o: OrderRow, graceHours: number, now = new Date()): boolean {
  return o.status === "expired" && o.environment === "live" && isWithinLatePaymentGrace(o, graceHours, now);
}
/** acceptsCustomerUtr: live + manual account + attempts<3 + pending, or expired within 60 min. */
export function acceptsCustomerUtr(o: OrderRow, accountProvider: string | null, now = new Date()): boolean {
  if (o.environment !== "live" || accountProvider !== "manual" || o.utr_attempts >= MAX_UTR_ATTEMPTS) return false;
  if (o.status === "pending") return true;
  if (o.status === "expired" && o.expires_at) {
    return now.getTime() - new Date(o.expires_at).getTime() <= UTR_GRACE_MINUTES * 60 * 1000;
  }
  return false;
}

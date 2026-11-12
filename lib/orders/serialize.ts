// toApiArray() — canonical API/webhook shape (port of Order::toApiArray).
import type { OrderRow } from "./types";
import { payableAmountFor, qrMethodForOrder } from "./types";
import { upiIntentUrl } from "./intent";

export function toApiArray(order: OrderRow, account: { provider: string; upi_id: string | null; payee_name: string | null } | null, appUrl: string, opts: { includePayerSecret?: boolean } = {}): Record<string, unknown> {
  const hosted = account ? ["paytm_pg", "phonepe_pg"].includes(account.provider) : false;
  // Round 10 (M1): merchant-facing serializations only (includePayerSecret)
  // embed the payer secret as ?k= in the payment URL, so the merchant's
  // issued link proves the holder may mint pay tokens on the pay page.
  // Sandbox orders never get ?k= (sandbox is exempt from the gate), and
  // the public pay page's `api` prop always uses the default (false) —
  // the secret must never appear in the page's RSC payload.
  const paymentUrl = order.environment === "sandbox"
    ? `${appUrl}/sandbox/pay/${order.order_no}`
    : opts.includePayerSecret && order.payer_secret
      ? `${appUrl}/pay/${order.order_no}?k=${order.payer_secret}`
      : `${appUrl}/pay/${order.order_no}`;
  return {
    order_id: order.order_no,
    client_order_id: order.client_order_id,
    amount: Number(order.amount).toFixed(2),
    // The amount the customer must actually pay (unique allocated amount
    // when set; equals `amount` otherwise). The pay page shows both:
    // "Order amount Rs 500.00 / Pay exactly Rs 500.01".
    payable_amount: payableAmountFor(order),
    qr_method: qrMethodForOrder(order),
    currency: "INR",
    status: order.status,
    verified_by: order.verified_by,
    environment: order.environment,
    test: order.environment === "sandbox",
    utr: order.utr,
    submitted_utr: order.status === "review" ? order.customer_utr : undefined,
    payment_url: paymentUrl,
    upi_intent: order.environment === "sandbox" || hosted || !account ? null : upiIntentUrl(order, account),
    customer: { name: order.customer_name, email: order.customer_email, mobile: order.customer_mobile },
    paid_at: order.paid_at, expires_at: order.expires_at,
    original_expires_at: order.original_expires_at, created_at: order.created_at,
  };
}

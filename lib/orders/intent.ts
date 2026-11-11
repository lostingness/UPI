// upiIntentUrl — port of Order::upiIntentUrl (RFC3986 encoding).
// upi://pay?pa={upi_id}&pn={payee_name}&am={payable amount 2dp}&cu=INR
// + tr={order_no} ONLY for non-manual accounts (manual/P2P omits `tr` per NPCI
// guidance — consumer UPI apps reject it) + tn={note ?: order_no}.
// `am` is the PAYABLE amount (unique allocated amount when set), not the
// order amount: the customer must pay exactly that for the payment to be
// matchable and verifiable. Falls back to `amount` for pre-013 orders.
import type { OrderRow } from "./types";
import { payableAmountFor } from "./types";

export function upiIntentUrl(order: Pick<OrderRow, "order_no" | "amount" | "note" | "payable_amount">, account: { provider: string; upi_id: string | null; payee_name: string | null }): string {
  const params: [string, string][] = [
    ["pa", account.upi_id ?? ""],
    ["pn", account.payee_name ?? ""],
    ["am", payableAmountFor(order)],
    ["cu", "INR"],
  ];
  if (account.provider !== "manual") params.push(["tr", order.order_no]);
  params.push(["tn", order.note ?? order.order_no]);
  const q = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  return `upi://pay?${q}`;
}

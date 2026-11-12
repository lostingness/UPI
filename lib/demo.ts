// Demo payment links (Round 8) — one-click sandbox orders, labelled DEMO
// everywhere.
//
// A demo link is a sandbox order (environment "sandbox", order_no TST…)
// created for the logged-in merchant through the SHARED createOrder()
// (lib/orders/create.ts) — the same function the API-key sandbox path uses.
// It never touches live order creation, never resolves a payment account,
// never contacts a provider, and is never marked paid by anything but the
// sandbox simulator. The shareable URL is /demo/pay/TST…, which renders
// the sandbox simulator with DEMO branding. Fixed demo amount, so the link
// is obviously a demo and never a real charge.
import { gatewayConfig } from "./config/gateway";

/** Fixed demo amount — every demo link is ₹10.00, so it is obviously a
 * demo and never a real charge. */
export const DEMO_AMOUNT = 10;
export const DEMO_CUSTOMER_NAME = "Demo customer";
export const DEMO_NOTE = "Demo payment link — no real money. Created from the demo button.";
export const DEMO_ORDER_PREFIX = "TST";

/** Shareable demo pay URL — the path itself says DEMO (/demo/pay/…). */
export function demoPaymentUrl(orderNo: string): string {
  return `${gatewayConfig.appUrl.replace(/\/$/, "")}/demo/pay/${orderNo}`;
}

/** POST /api/demo/orders response payload. */
export interface DemoOrderResult {
  demo: true;
  order_id: string;
  payment_url: string;
  amount: string;
  currency: "INR";
  status: string;
  environment: "sandbox";
  expires_at: string;
}

import { loadOrderByNo, checkOrder } from "@/lib/orders/check";
import { payableAmountFor, qrMethodForOrder } from "@/lib/orders/types";
import { allowedRedirectForStatus } from "@/lib/api-auth";
import { verifyPayToken, payTokenFromRequest } from "@/lib/pay-token";
import { getSql, first, type Row } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { ok, handleError, json } from "@/lib/http";
import { checkTwoLayerRateLimit, getClientIp, rateLimitHeaders, apiIpLimit } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
// GET /pay/{order}/status — poll JSON {status, redirect}.
// GAP 3: redirect is returned ONLY when the order is paid AND its
// redirect_url passes the merchant's allowlist (same check as the
// /api/pay/[orderNo]/return route). A non-allowlisted redirect_url is
// omitted (null), so the checkout page can never be sent to it.
// Also returns `amount`, `payable_amount` and `qr_method` so the pay page
// can show "Order amount Rs 500.00 / Pay exactly Rs 500.01".
//
// Round 7 (H2) — REPORT-ONLY BY DEFAULT: the old route called checkOrder()
// on every poll, so anyone who knew an order_no could force a provider
// verification at will (quota burn on Paytm/PhonePe, and a late payment
// could flip an expired order to paid on an attacker's schedule). The route
// now returns the STORED status unless the poll presents a valid, unused,
// unexpired pay token for this order (the token minted when the pay page
// rendered — the real payer's client sends it). Only then may the
// throttled provider check run — and checkOrder() itself still enforces
// the 3 s throttle + verification lease, so even a token holder cannot
// force more than one provider call per throttle window. A tokenless poll
// (or a bad/expired token) gets the stored status with no provider call
// and no error — polling must never break the page.
export async function GET(req: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  try {
    const ip = getClientIp(req);
    const rl = await checkTwoLayerRateLimit(`pay:status:ip:${ip}`, apiIpLimit());
    if (!rl.allowed) return json({ message: "Too many requests" }, 429, rateLimitHeaders(rl));
    const { orderNo } = await params;
    const order = await loadOrderByNo(orderNo);
    if (!order) throw new ApiError(404, "Order not found");
    // Token verification is read-only (never consumes): the same token
    // authorises every poll until the page re-renders and rotates it.
    const sql = getSql();
    const token = payTokenFromRequest(req);
    const hasToken = token !== null && (
      (await verifyPayToken(sql, order.id, "utr", token)) ||
      (await verifyPayToken(sql, order.id, "start", token))
    );
    const after = hasToken ? await checkOrder(order) : order;
    let redirect: string | null = null;
    if (after.status === "paid" && after.redirect_url) {
      const user = first<Row>(await sql`SELECT redirect_domains FROM users WHERE id = ${after.user_id}`);
      const domains = (user?.redirect_domains as string[]) ?? [];
      redirect = allowedRedirectForStatus(after, domains);
    }
    return ok({
      status: after.status, redirect,
      amount: Number(after.amount).toFixed(2),
      payable_amount: payableAmountFor(after),
      qr_method: qrMethodForOrder(after),
    });
  } catch (e) { return handleError(e); }
}

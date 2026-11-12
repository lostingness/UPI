import { loadOrderByNo, loadAccount } from "@/lib/orders/check";
import { submitCustomerUtr } from "@/lib/orders/utr";
import { notifyOrderEvent } from "@/lib/notifications";
import { consumePayToken, payTokenFromRequest } from "@/lib/pay-token";
import { getSql } from "@/lib/db";
import { utrSchema, parseBody } from "@/lib/validate";
import { ApiError } from "@/lib/errors";
import { ok, handleError, readJson, json } from "@/lib/http";
import { checkTwoLayerRateLimit, getClientIp, rateLimitHeaders, apiIpLimit } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
// POST /api/pay/{orderNo}/utr — Round 7 (H1): payer-bound.
//
// The old route accepted a UTR from anyone who knew the order_no — the
// order number is printed on the QR and the pay page, so anyone who saw a
// link could submit a bogus UTR and grief the real payer (order → review,
// real UTR then blocked by the duplicate-UTR clash, review queue poisoned).
// The route now requires the single-use "utr" pay token minted when the pay
// page rendered (lib/pay-token.ts): the token proves the caller loaded this
// order's pay page. The token is consumed atomically (one use only) and is
// bound to this order_no, this purpose, and a ≤15 min expiry. No token (or
// a used / expired / foreign token) → 401, order untouched. The body is
// validated BEFORE the token is consumed, so a malformed UTR never burns
// the payer's token. Submitting a UTR still only moves the order to
// `review` — it never marks paid (see lib/orders/utr.ts, G1).
export async function POST(req: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  try {
    const ip = getClientIp(req);
    const rl = await checkTwoLayerRateLimit(`pay:utr:ip:${ip}`, apiIpLimit());
    if (!rl.allowed) return json({ message: "Too many requests" }, 429, rateLimitHeaders(rl));
    const { orderNo } = await params;
    const order = await loadOrderByNo(orderNo);
    if (!order) throw new ApiError(404, "Order not found");
    const body = await readJson(req);
    const data = parseBody(utrSchema, body);
    const token = payTokenFromRequest(req, body);
    const sql = getSql();
    if (!(await consumePayToken(sql, order.id, "utr", token))) {
      throw new ApiError(401, "This payment link needs to be reloaded before submitting a UTR.");
    }
    const account = await loadAccount(order.payment_account_id);
    const updated = await submitCustomerUtr(order, account?.provider ?? null, data.utr);
    // Merchant notification (Round 5, best-effort): a UTR is waiting for
    // the merchant to approve or reject — the order is NOT paid yet.
    await notifyOrderEvent("utr_submitted", updated);
    return ok({ status: updated.status, utr_attempts: updated.utr_attempts });
  } catch (e) { return handleError(e); }
}

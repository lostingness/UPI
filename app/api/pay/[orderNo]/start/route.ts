import { loadOrderByNo, loadAccount } from "@/lib/orders/check";
import { decryptAccountCredentials } from "@/lib/orders/create";
import { startPaytmPgCheckout } from "@/lib/verifiers/paytm-pg";
import { startPhonePeCheckout } from "@/lib/verifiers/phonepe-pg";
import { gatewayConfig } from "@/lib/config/gateway";
import { consumePayToken, verifyPayToken, payTokenFromRequest, ensureCheckoutStartsColumn, checkoutStartAllowed, START_BUDGET_PER_ORDER } from "@/lib/pay-token";
import { getSql } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { ok, handleError, json, readJson } from "@/lib/http";
import { checkTwoLayerRateLimit, getClientIp, rateLimitHeaders, apiIpLimit } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
// POST /pay/{order}/start — hosted PG only (404 otherwise). Reuses cached
// provider_checkout while expires_at > now+30s and same account/env/provider.
// Only a pending order may start a checkout: review orders are in merchant
// UTR review, and paid/expired/failed orders never start a new payment
// (expired orders recover via the late-payment check path, not a new
// checkout — markPaid only accepts pending/expired evidence anyway).
//
// Round 7 (M1) — PAYER-BOUND + BUDGETED: the old route started a hosted
// checkout for anyone who knew the order_no, overwriting provider_checkout
// on every call. The route now requires the single-use "start" pay token
// minted when the pay page rendered (read-only verify for a cached-checkout
// reuse; consumed when a FRESH checkout is created), and a per-order start
// budget of 3 fresh checkouts (orders.checkout_starts, migration 016),
// enforced by a conditional UPDATE so concurrent calls cannot overshoot
// it. A cached checkout is still served without consuming token or budget —
// it already exists and re-serving it creates nothing at the provider.
export async function POST(req: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  try {
    const ip = getClientIp(req);
    const rl = await checkTwoLayerRateLimit(`pay:start:ip:${ip}`, apiIpLimit());
    if (!rl.allowed) return json({ message: "Too many requests" }, 429, rateLimitHeaders(rl));
    const { orderNo } = await params;
    const order = await loadOrderByNo(orderNo);
    if (!order) throw new ApiError(404, "Order not found");
    if (order.status !== "pending") throw new ApiError(422, "This order cannot start a checkout.");
    const account = await loadAccount(order.payment_account_id);
    if (!account || !["paytm_pg", "phonepe_pg"].includes(account.provider)) throw new ApiError(404, "Not found");
    const sql = getSql();
    const body = await readJson(req).catch(() => ({}));
    const token = payTokenFromRequest(req, body);
    if (!token || !(await verifyPayToken(sql, order.id, "start", token))) {
      throw new ApiError(401, "This payment link needs to be reloaded before starting checkout.");
    }
    const cached = order.provider_checkout as { type?: string; url?: string; fields?: Record<string, string>; expires_at?: number; account_id?: number; provider?: string; environment?: string } | null;
    const nowSec = Math.floor(Date.now() / 1000);
    // The cached checkout is bound to the account/provider/environment it
    // was created for — a mismatch (e.g. the merchant changed the
    // account) is never served; a fresh checkout is started instead.
    const creds = decryptAccountCredentials(account);
    const environment = creds.environment ?? "sandbox";
    const cacheBound = cached?.account_id === account.id && cached?.provider === account.provider && cached?.environment === environment;
    if (cached?.url && cached.expires_at && cached.expires_at > nowSec + 30 && cacheBound) {
      return ok({ checkout: cached });
    }
    // Fresh checkout: consume the single-use token AND claim one unit of
    // the per-order budget, both atomically. Either failure → no provider
    // call is made and provider_checkout is untouched.
    if (!(await consumePayToken(sql, order.id, "start", token))) {
      throw new ApiError(401, "This payment link needs to be reloaded before starting checkout.");
    }
    await ensureCheckoutStartsColumn(sql);
    const claimed = await sql`UPDATE orders SET checkout_starts = checkout_starts + 1, updated_at = NOW()
      WHERE id = ${order.id} AND checkout_starts < ${START_BUDGET_PER_ORDER} RETURNING id`;
    if ((claimed as unknown[]).length === 0) {
      // Budget exhausted (or the column is missing pre-migration — the
      // UPDATE then matches nothing and this fails closed, not open).
      const cur = await sql`SELECT checkout_starts FROM orders WHERE id = ${order.id}`;
      const starts = Number((cur as { checkout_starts: number }[])[0]?.checkout_starts ?? 0);
      if (!checkoutStartAllowed(starts)) throw new ApiError(429, "Too many checkout attempts for this order. Ask the merchant for a new payment link.");
      throw new ApiError(503, "Checkout is temporarily unavailable. Please try again.");
    }
    const returnUrl = `${gatewayConfig.appUrl}/api/pay/${order.order_no}/return`;
    const acct = { id: account.id, credentials: creds, environment };
    const checkout = account.provider === "paytm_pg"
      ? await startPaytmPgCheckout(order, acct, returnUrl)
      : await startPhonePeCheckout(order, acct, returnUrl);
    if (checkout.type === "redirect" && !checkout.url.startsWith("https://")) throw new ApiError(500, "Invalid checkout URL from provider");
    if (checkout.type === "form" && !checkout.fields) throw new ApiError(500, "Invalid checkout form from provider");
    const boundCheckout = { ...checkout, account_id: account.id, provider: account.provider, environment };
    await sql`UPDATE orders SET provider_checkout = ${JSON.stringify(boundCheckout)}::jsonb, updated_at = NOW() WHERE id = ${order.id}`;
    return ok({ checkout: boundCheckout });
  } catch (e) { return handleError(e); }
}

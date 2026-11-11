import { loadOrderByNo, loadAccount } from "@/lib/orders/check";
import { decryptAccountCredentials } from "@/lib/orders/create";
import { startPaytmPgCheckout } from "@/lib/verifiers/paytm-pg";
import { startPhonePeCheckout } from "@/lib/verifiers/phonepe-pg";
import { gatewayConfig } from "@/lib/config/gateway";
import { getSql } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { ok, handleError, json } from "@/lib/http";
import { checkTwoLayerRateLimit, getClientIp, rateLimitHeaders, apiIpLimit } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
// POST /pay/{order}/start — hosted PG only (404 otherwise). Reuses cached
// provider_checkout while expires_at > now+30s and same account/env/provider.
// Only a pending order may start a checkout: review orders are in merchant
// UTR review, and paid/expired/failed orders never start a new payment
// (expired orders recover via the late-payment check path, not a new
// checkout — markPaid only accepts pending/expired evidence anyway).
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
    const returnUrl = `${gatewayConfig.appUrl}/api/pay/${order.order_no}/return`;
    const acct = { id: account.id, credentials: creds, environment };
    const checkout = account.provider === "paytm_pg"
      ? await startPaytmPgCheckout(order, acct, returnUrl)
      : await startPhonePeCheckout(order, acct, returnUrl);
    if (checkout.type === "redirect" && !checkout.url.startsWith("https://")) throw new ApiError(500, "Invalid checkout URL from provider");
    if (checkout.type === "form" && !checkout.fields) throw new ApiError(500, "Invalid checkout form from provider");
    const boundCheckout = { ...checkout, account_id: account.id, provider: account.provider, environment };
    const sql = getSql();
    await sql`UPDATE orders SET provider_checkout = ${JSON.stringify(boundCheckout)}::jsonb, updated_at = NOW() WHERE id = ${order.id}`;
    return ok({ checkout: boundCheckout });
  } catch (e) { return handleError(e); }
}

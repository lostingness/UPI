import { loadOrderByNo, loadAccount } from "@/lib/orders/check";
import { decryptAccountCredentials } from "@/lib/orders/create";
import { startPaytmPgCheckout } from "@/lib/verifiers/paytm-pg";
import { startPhonePeCheckout } from "@/lib/verifiers/phonepe-pg";
import { gatewayConfig } from "@/lib/config/gateway";
import { getSql } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { ok, handleError } from "@/lib/http";
export const dynamic = "force-dynamic";
// POST /pay/{order}/start — hosted PG only (404 otherwise). Reuses cached
// provider_checkout while expires_at > now+30s and same account/env/provider.
export async function POST(req: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  try {
    const { orderNo } = await params;
    const order = await loadOrderByNo(orderNo);
    if (!order) throw new ApiError(404, "Order not found");
    const account = await loadAccount(order.payment_account_id);
    if (!account || !["paytm_pg", "phonepe_pg"].includes(account.provider)) throw new ApiError(404, "Not found");
    const cached = order.provider_checkout as { type?: string; url?: string; fields?: Record<string, string>; expires_at?: number } | null;
    const nowSec = Math.floor(Date.now() / 1000);
    if (cached?.url && cached.expires_at && cached.expires_at > nowSec + 30) {
      return ok({ checkout: cached });
    }
    const creds = decryptAccountCredentials(account);
    const returnUrl = `${gatewayConfig.appUrl}/api/pay/${order.order_no}/return`;
    const acct = { id: account.id, credentials: creds, environment: creds.environment ?? "sandbox" };
    const checkout = account.provider === "paytm_pg"
      ? await startPaytmPgCheckout(order, acct, returnUrl)
      : await startPhonePeCheckout(order, acct, returnUrl);
    if (checkout.type === "redirect" && !checkout.url.startsWith("https://")) throw new ApiError(500, "Invalid checkout URL from provider");
    if (checkout.type === "form" && !checkout.fields) throw new ApiError(500, "Invalid checkout form from provider");
    const sql = getSql();
    await sql`UPDATE orders SET provider_checkout = ${JSON.stringify(checkout)}::jsonb, updated_at = NOW() WHERE id = ${order.id}`;
    return ok({ checkout });
  } catch (e) { return handleError(e); }
}

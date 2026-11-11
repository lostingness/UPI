import { loadOrderByNo, loadAccount } from "@/lib/orders/check";
import { submitCustomerUtr } from "@/lib/orders/utr";
import { utrSchema, parseBody } from "@/lib/validate";
import { ApiError } from "@/lib/errors";
import { ok, handleError, readJson, json } from "@/lib/http";
import { checkTwoLayerRateLimit, getClientIp, rateLimitHeaders, apiIpLimit } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
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
    const account = await loadAccount(order.payment_account_id);
    const updated = await submitCustomerUtr(order, account?.provider ?? null, data.utr);
    return ok({ status: updated.status, utr_attempts: updated.utr_attempts });
  } catch (e) { return handleError(e); }
}

import { loadOrderByNo } from "@/lib/orders/check";
import { simulateSandbox } from "@/lib/orders/sandbox";
import { sandboxSimulateSchema, parseBody } from "@/lib/validate";
import { ApiError } from "@/lib/errors";
import { ok, handleError, readJson, json } from "@/lib/http";
import { getSession } from "@/lib/auth";
import { authenticateApiKey } from "@/lib/api-auth";
import { checkTwoLayerRateLimit, getClientIp, rateLimitHeaders, apiIpLimit } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
// POST /api/sandbox/pay/{orderNo}/simulate — sandbox-only test simulation.
//
// AUTH (decision, secure default): simulating a payment marks a sandbox
// order paid, so this route is NOT public. The caller must be either the
// order's owning merchant (session cookie — the sandbox UI posts
// same-origin, so the cookie is sent) OR a valid sandbox API key
// (test_key_…) belonging to the same merchant. Anyone else gets 401;
// a valid credential for a different merchant gets 403.
export async function POST(req: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  try {
    const ip = getClientIp(req);
    const rl = await checkTwoLayerRateLimit(`pay:simulate:ip:${ip}`, apiIpLimit());
    if (!rl.allowed) return json({ message: "Too many requests" }, 429, rateLimitHeaders(rl));
    const { orderNo } = await params;
    const order = await loadOrderByNo(orderNo);
    if (!order) throw new ApiError(404, "Order not found");
    if (order.environment !== "sandbox") throw new ApiError(404, "Not found");
    const session = await getSession().catch(() => null);
    if (session && Number(session.id) === Number(order.user_id)) {
      // Owning merchant via session — allowed.
    } else if (req.headers.get("x-api-key")) {
      const merchant = await authenticateApiKey(req);
      if (merchant.environment !== "sandbox" || merchant.id !== Number(order.user_id)) {
        throw new ApiError(403, "This sandbox order belongs to another merchant");
      }
    } else {
      throw new ApiError(401, "Unauthenticated");
    }
    const body = await readJson(req);
    const data = parseBody(sandboxSimulateSchema, body);
    const { order: updated, httpStatus } = await simulateSandbox(order, data.outcome);
    return ok({ status: updated.status }, httpStatus === 504 ? 504 : 200);
  } catch (e) { return handleError(e); }
}

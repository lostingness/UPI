import { handleCreateOrderDispatch } from "@/lib/api-orders";
import { requireMerchant } from "@/lib/auth";
import { listMerchantOrders } from "@/lib/merchant-orders";
import { ok, handleError } from "@/lib/http";
export const dynamic = "force-dynamic";

// GET /api/orders — session-authenticated merchant order list (GAP 2).
// Merchant-scoped, paginated (20/page). Filters: status, search (q), environment.
export async function GET(req: Request) {
  try {
    const user = await requireMerchant();
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "";
    const q = (url.searchParams.get("q") ?? "").slice(0, 100);
    const environment = url.searchParams.get("environment") ?? "";
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
    const data = await listMerchantOrders(user.id, { environment, status, q, page });
    return ok(data);
  } catch (e) { return handleError(e); }
}

// POST /api/orders — API-key mode when X-Api-Key is present, otherwise the
// session-authenticated dashboard create (GAP 1). Same creation logic,
// idempotency and rate limits in both modes. The order_created merchant
// notification lives in the shared lib/orders/create.ts (Round 5
// integration), so this route and /api/v1/orders both notify; the old
// route-level hook (extra SELECT by order_no) was removed in the move.
export async function POST(req: Request) {
  return handleCreateOrderDispatch(req);
}

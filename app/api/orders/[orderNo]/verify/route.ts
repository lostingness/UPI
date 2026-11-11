import { requireMerchant, assertOwns } from "@/lib/auth";
import { loadOrderByNo, checkOrder } from "@/lib/orders/check";
import { ApiError } from "@/lib/errors";
import { ok, handleError } from "@/lib/http";
export const dynamic = "force-dynamic";
// POST /api/orders/[id]/verify — server-side re-check via the configured verifier.
export async function POST(_req: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  try {
    const user = await requireMerchant();
    const { orderNo } = await params;
    const order = await loadOrderByNo(orderNo);
    if (!order) throw new ApiError(404, "Not found");
    assertOwns(user.id, order.user_id);
    const after = await checkOrder(order, true);
    return ok({ status: after.status, verified_by: after.verified_by });
  } catch (e) { return handleError(e); }
}

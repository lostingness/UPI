import { requireMerchant } from "@/lib/auth";
import { getMerchantOrderDetail } from "@/lib/merchant-orders";
import { ApiError } from "@/lib/errors";
import { ok, handleError } from "@/lib/http";
export const dynamic = "force-dynamic";
// GET /api/orders/[orderNo] — session-authenticated merchant order detail
// (GAP 2). Owner only: another merchant's order is 404, never leaked.
// Returns the full detail the detail page needs: order, account,
// merchantName, webhookHistory, readOnly, and the canonical api shape.
export async function GET(_req: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  try {
    const user = await requireMerchant();
    const { orderNo } = await params;
    const detail = await getMerchantOrderDetail(orderNo, user.id);
    if (!detail) throw new ApiError(404, "Not found");
    return ok(detail);
  } catch (e) { return handleError(e); }
}

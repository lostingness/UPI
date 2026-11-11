import { requireMerchant, assertOwns } from "@/lib/auth";
import { loadOrderByNo, checkOrder } from "@/lib/orders/check";
import { ApiError } from "@/lib/errors";
import { ok, handleError } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function POST(_req: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  try {
    const user = await requireMerchant();
    const { orderNo } = await params;
    const order = await loadOrderByNo(orderNo);
    if (!order) throw new ApiError(404, "Not found");
    assertOwns(user.id, order.user_id);
    const after = await checkOrder(order);
    return ok({ status: after.status });
  } catch (e) { return handleError(e); }
}

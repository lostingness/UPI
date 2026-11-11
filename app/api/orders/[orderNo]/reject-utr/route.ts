import { requireMerchant, assertOwns } from "@/lib/auth";
import { loadOrderByNo } from "@/lib/orders/check";
import { rejectCustomerUtr } from "@/lib/orders/utr";
import { rejectUtrSchema, parseBody } from "@/lib/validate";
import { ApiError } from "@/lib/errors";
import { ok, handleError, readJson } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  try {
    const user = await requireMerchant();
    const { orderNo } = await params;
    const order = await loadOrderByNo(orderNo);
    if (!order) throw new ApiError(404, "Not found");
    assertOwns(user.id, order.user_id);
    const body = await readJson(req);
    const data = parseBody(rejectUtrSchema, body);
    const updated = await rejectCustomerUtr(order, data.reason);
    return ok({ status: updated.status, expires_at: updated.expires_at });
  } catch (e) { return handleError(e); }
}

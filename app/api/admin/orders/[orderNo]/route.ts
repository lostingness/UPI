import { requireAdminConfirmed } from "@/lib/auth";
import { loadOrderByNo } from "@/lib/orders/check";
import { getLogsForOrder } from "@/lib/webhooks/history";
import { auditLog } from "@/lib/audit";
import { getSql } from "@/lib/db";
import { getClientIp } from "@/lib/rate-limit";
import { ApiError } from "@/lib/errors";
import { ok, handleError } from "@/lib/http";
export const dynamic = "force-dynamic";
// Admin read-only order view; audit-logs order_viewed on every view.
export async function GET(req: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  try {
    const admin = await requireAdminConfirmed();
    const { orderNo } = await params;
    const order = await loadOrderByNo(orderNo);
    if (!order) throw new ApiError(404, "Not found");
    const sql = getSql();
    await auditLog(sql, admin.id, "order_viewed", "order", order.id, { order_no: order.order_no, merchant_id: order.user_id }, getClientIp(req));
    const webhookHistory = await getLogsForOrder(order.id, 25);
    return ok({ order, webhook_history: webhookHistory });
  } catch (e) { return handleError(e); }
}

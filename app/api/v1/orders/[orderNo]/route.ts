import { authenticateApiKey } from "@/lib/api-auth";
import { loadOrderByNo, checkOrder } from "@/lib/orders/check";
import { toApiArray } from "@/lib/orders/serialize";
import { gatewayConfig } from "@/lib/config/gateway";
import { getSql, first, type Row } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { json, ok, handleError } from "@/lib/http";
export const dynamic = "force-dynamic";
// GET /api/v1/orders/{orderNo} — order_no first, else client_order_id, scoped
// to the merchant + environment; triggers check() (live provider poll) first.
export async function GET(req: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  try {
    const merchant = await authenticateApiKey(req);
    const { orderNo } = await params;
    const sql = getSql();
    let order = await loadOrderByNo(orderNo);
    if (!order || Number(order.user_id) !== merchant.id || order.environment !== merchant.environment) {
      const row = first<Row>(await sql`SELECT * FROM orders WHERE client_order_id = ${orderNo} AND user_id = ${merchant.id} AND environment = ${merchant.environment}`);
      order = (row as never) ?? null;
    }
    if (!order) throw new ApiError(404, "Order not found");
    order = await checkOrder(order);
    const account = order.payment_account_id
      ? first<Row>(await sql`SELECT provider, upi_id, payee_name FROM payment_accounts WHERE id = ${order.payment_account_id}`)
      : null;
    return ok(toApiArray(order, account as never, gatewayConfig.appUrl));
  } catch (e) { return handleError(e); }
}

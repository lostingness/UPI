import { loadOrderByNo } from "@/lib/orders/check";
import { simulateSandbox } from "@/lib/orders/sandbox";
import { sandboxSimulateSchema, parseBody } from "@/lib/validate";
import { ApiError } from "@/lib/errors";
import { ok, handleError, readJson } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  try {
    const { orderNo } = await params;
    const order = await loadOrderByNo(orderNo);
    if (!order) throw new ApiError(404, "Order not found");
    if (order.environment !== "sandbox") throw new ApiError(404, "Not found");
    const body = await readJson(req);
    const data = parseBody(sandboxSimulateSchema, body);
    const { order: updated, httpStatus } = await simulateSandbox(order, data.outcome);
    return ok({ status: updated.status }, httpStatus === 504 ? 504 : 200);
  } catch (e) { return handleError(e); }
}

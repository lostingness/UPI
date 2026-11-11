import { loadOrderByNo, loadAccount } from "@/lib/orders/check";
import { qrPngForOrder } from "@/lib/qr";
import { ApiError } from "@/lib/errors";
import { handleError } from "@/lib/http";
export const dynamic = "force-dynamic";
// 404 unless pending + non-hosted. Cache-Control: private, max-age=600.
export async function GET(_req: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  try {
    const { orderNo } = await params;
    const order = await loadOrderByNo(orderNo);
    if (!order) throw new ApiError(404, "Order not found");
    const account = await loadAccount(order.payment_account_id);
    if (!account || order.status !== "pending" || ["paytm_pg", "phonepe_pg"].includes(account.provider)) {
      throw new ApiError(404, "QR not available for this order");
    }
    const png = await qrPngForOrder(order, account);
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=600" } });
  } catch (e) { return handleError(e); }
}

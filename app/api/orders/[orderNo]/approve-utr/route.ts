import { requireMerchant, assertOwns } from "@/lib/auth";
import { loadOrderByNo } from "@/lib/orders/check";
import { approveCustomerUtr } from "@/lib/orders/utr";
import { notifyOrderEvent } from "@/lib/notifications";
import { approveUtrSchema, parseBody } from "@/lib/validate";
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
    const data = parseBody(approveUtrSchema, body);
    const updated = await approveCustomerUtr(order, data.bank_utr, data.received_amount);
    // Merchant notification (Round 5, best-effort): the order is now paid
    // because the merchant approved the UTR after checking their bank.
    await notifyOrderEvent("payment_received", updated, { via: "utr_review" });
    return ok({ status: updated.status });
  } catch (e) { return handleError(e); }
}

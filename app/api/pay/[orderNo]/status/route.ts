import { loadOrderByNo, checkOrder } from "@/lib/orders/check";
import { allowedRedirectForStatus } from "@/lib/api-auth";
import { getSql, first, type Row } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { ok, handleError } from "@/lib/http";
export const dynamic = "force-dynamic";
// GET /pay/{order}/status — poll JSON {status, redirect}.
// GAP 3: redirect is returned ONLY when the order is paid AND its
// redirect_url passes the merchant's allowlist (same check as the
// /api/pay/[orderNo]/return route). A non-allowlisted redirect_url is
// omitted (null), so the checkout page can never be sent to it.
export async function GET(_req: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  try {
    const { orderNo } = await params;
    const order = await loadOrderByNo(orderNo);
    if (!order) throw new ApiError(404, "Order not found");
    const after = await checkOrder(order);
    let redirect: string | null = null;
    if (after.status === "paid" && after.redirect_url) {
      const sql = getSql();
      const user = first<Row>(await sql`SELECT redirect_domains FROM users WHERE id = ${after.user_id}`);
      const domains = (user?.redirect_domains as string[]) ?? [];
      redirect = allowedRedirectForStatus(after, domains);
    }
    return ok({ status: after.status, redirect });
  } catch (e) { return handleError(e); }
}

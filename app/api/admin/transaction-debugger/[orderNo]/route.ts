import { requireAdminConfirmed } from "@/lib/auth";
import { loadOrderByNo } from "@/lib/orders/check";
import { getLogsForOrder } from "@/lib/webhooks/history";
import { auditLog } from "@/lib/audit";
import { getSql, first, type Row } from "@/lib/db";
import { getClientIp } from "@/lib/rate-limit";
import { ApiError } from "@/lib/errors";
import { ok, handleError } from "@/lib/http";
export const dynamic = "force-dynamic";
// Debugger detail: masked PII + sanitised provider error + timeline.
// Audit-logs transaction_debugger_viewed on every view.
function maskEmail(e: string | null): string | null {
  if (!e) return null; const [l, d] = e.split("@"); return `${l[0] ?? ""}***@${d ?? ""}`;
}
function maskMobile(m: string | null): string | null { return m ? `******${m.slice(-4)}` : null; }
function maskName(n: string | null): string | null { return n ? `${n[0]}***` : null; }
function sanitizeError(raw: unknown): string | null {
  if (!raw) return null;
  let s = typeof raw === "string" ? raw : JSON.stringify(raw);
  s = s.replace(/<[^>]*>/g, "").replace(/https?:\/\/[^\s]+/g, "[url]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g, "[email]")
    .replace(/\b\d{12,}\b/g, "[number]");
  return s.slice(0, 240);
}
export async function GET(req: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  try {
    const admin = await requireAdminConfirmed();
    const { orderNo } = await params;
    const order = await loadOrderByNo(orderNo);
    if (!order) throw new ApiError(404, "Not found");
    const sql = getSql();
    await auditLog(sql, admin.id, "transaction_debugger_viewed", "order", order.id, { order_no: order.order_no, merchant_id: order.user_id }, getClientIp(req));
    const account = order.payment_account_id ? first<Row>(await sql`SELECT id, label, provider FROM payment_accounts WHERE id = ${order.payment_account_id}`) : null;
    const merchant = first<Row>(await sql`SELECT id, name, email FROM users WHERE id = ${order.user_id}`);
    const logs = await getLogsForOrder(order.id, 25);
    const providerError = sanitizeError((order.provider_response as Record<string, unknown> | null)?.error ?? (order.provider_response as Record<string, unknown> | null)?.message);
    const timeline = [
      { at: order.created_at, event: "created" },
      ...(order.utr_submitted_at ? [{ at: order.utr_submitted_at, event: "utr_submitted" }] : []),
      ...(order.paid_at ? [{ at: order.paid_at, event: "paid" }] : []),
      ...logs.map((l) => ({ at: l.created_at, event: `webhook:${l.event}:${l.success ? "delivered" : "attempt"}` })),
    ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    return ok({
      order: { ...order, customer_name: maskName(order.customer_name), customer_email: maskEmail(order.customer_email), customer_mobile: maskMobile(order.customer_mobile) },
      merchant: merchant ? { id: merchant.id, name: maskName(String(merchant.name)), email: maskEmail(String(merchant.email)) } : null,
      account, provider_error: providerError, timeline, webhook_logs: logs,
    });
  } catch (e) { return handleError(e); }
}

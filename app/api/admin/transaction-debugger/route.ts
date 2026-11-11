import { requireAdminConfirmed } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { ok, handleError } from "@/lib/http";
export const dynamic = "force-dynamic";
// Filterable all-orders debugger list (q/status/provider/environment/date range).
export async function GET(req: Request) {
  try {
    await requireAdminConfirmed();
    const sql = getSql();
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";
    const status = url.searchParams.get("status") ?? "";
    const provider = url.searchParams.get("provider") ?? "";
    const environment = url.searchParams.get("environment") ?? "";
    const dateFrom = url.searchParams.get("date_from") ?? "";
    const dateTo = url.searchParams.get("date_to") ?? "";
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
    const rows = await sql`
      SELECT o.*, u.name AS merchant_name, u.email AS merchant_email,
        pa.id AS account_id, pa.label AS account_label, pa.provider AS account_provider,
        (SELECT COUNT(*) FROM webhook_logs wl WHERE wl.order_id = o.id) AS webhook_logs_count
      FROM orders o LEFT JOIN users u ON u.id = o.user_id LEFT JOIN payment_accounts pa ON pa.id = o.payment_account_id
      WHERE (${q} = '' OR o.order_no ILIKE ${"%" + q + "%"} OR o.client_order_id ILIKE ${"%" + q + "%"} OR o.customer_utr ILIKE ${"%" + q + "%"})
        AND (${status} = '' OR o.status = ${status})
        AND (${provider} = '' OR pa.provider = ${provider})
        AND (${environment} = '' OR o.environment = ${environment})
        AND (${dateFrom} = '' OR o.created_at >= ${dateFrom})
        AND (${dateTo} = '' OR o.created_at < ${dateTo}::date + INTERVAL '1 day')
      ORDER BY o.created_at DESC LIMIT 25 OFFSET ${(page - 1) * 25}`;
    return ok(rows);
  } catch (e) { return handleError(e); }
}

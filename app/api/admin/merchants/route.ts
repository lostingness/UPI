import { requireAdminConfirmed } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { ok, handleError } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    await requireAdminConfirmed();
    const sql = getSql();
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
    const rows = await sql`
      SELECT u.id, u.name, u.email, u.business_name, u.is_active, u.created_at,
        COUNT(o.id) FILTER (WHERE o.environment = 'live') AS live_order_count,
        COUNT(o.id) FILTER (WHERE o.status = 'paid' AND o.environment = 'live') AS paid_count,
        COALESCE(SUM(o.amount) FILTER (WHERE o.status = 'paid' AND o.environment = 'live'), 0) AS paid_amount
      FROM users u LEFT JOIN orders o ON o.user_id = u.id
      WHERE u.role = 'merchant' GROUP BY u.id ORDER BY u.created_at DESC
      LIMIT 25 OFFSET ${(page - 1) * 25}`;
    return ok(rows);
  } catch (e) { return handleError(e); }
}

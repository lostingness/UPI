import { requireAdminConfirmed } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { ok, handleError } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    await requireAdminConfirmed();
    const sql = getSql();
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
    const rows = status
      ? await sql`SELECT o.*, u.name AS merchant_name, u.email AS merchant_email, pa.label AS account_label FROM orders o LEFT JOIN users u ON u.id = o.user_id LEFT JOIN payment_accounts pa ON pa.id = o.payment_account_id WHERE o.status = ${status} ORDER BY o.created_at DESC LIMIT 30 OFFSET ${(page - 1) * 30}`
      : await sql`SELECT o.*, u.name AS merchant_name, u.email AS merchant_email, pa.label AS account_label FROM orders o LEFT JOIN users u ON u.id = o.user_id LEFT JOIN payment_accounts pa ON pa.id = o.payment_account_id ORDER BY o.created_at DESC LIMIT 30 OFFSET ${(page - 1) * 30}`;
    return ok(rows);
  } catch (e) { return handleError(e); }
}

import { requireAdminConfirmed } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { ok, handleError } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requireAdminConfirmed();
    const sql = getSql();
    const rows = await sql`SELECT pa.*, u.name AS merchant_name, u.email AS merchant_email FROM payment_accounts pa LEFT JOIN users u ON u.id = pa.user_id ORDER BY pa.created_at DESC LIMIT 100`;
    return ok((rows as Record<string, unknown>[]).map(({ credentials, ...r }) => r));
  } catch (e) { return handleError(e); }
}

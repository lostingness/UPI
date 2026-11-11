import { requireAdminConfirmed } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { ok, handleError } from "@/lib/http";
export const dynamic = "force-dynamic";
// Audit logs are write-only in the source app (no admin UI lists them).
// This read endpoint exists for the API/admin tooling; it is admin-only.
export async function GET(req: Request) {
  try {
    await requireAdminConfirmed();
    const sql = getSql();
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
    const rows = await sql`SELECT * FROM admin_audit_logs ORDER BY created_at DESC, id DESC LIMIT 50 OFFSET ${(page - 1) * 50}`;
    return ok(rows);
  } catch (e) { return handleError(e); }
}

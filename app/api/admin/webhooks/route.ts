import { requireAdminConfirmed } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { ok, handleError } from "@/lib/http";
export const dynamic = "force-dynamic";
// Admin webhook outbox overview (pending/failed/blocked first).
export async function GET(req: Request) {
  try {
    await requireAdminConfirmed();
    const sql = getSql();
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const rows = status
      ? await sql`SELECT * FROM webhook_outbox WHERE status = ${status} ORDER BY available_at NULLS FIRST, id DESC LIMIT 100`
      : await sql`SELECT * FROM webhook_outbox ORDER BY available_at NULLS FIRST, id DESC LIMIT 100`;
    return ok(rows);
  } catch (e) { return handleError(e); }
}

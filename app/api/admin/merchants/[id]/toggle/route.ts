import { requireAdminConfirmed } from "@/lib/auth";
import { auditLog } from "@/lib/audit";
import { getSql, first, type Row } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { ok, handleError } from "@/lib/http";
import { getClientIp } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminConfirmed();
    const { id } = await params;
    const sql = getSql();
    const target = first<Row>(await sql`SELECT id, role, email, is_active FROM users WHERE id = ${Number(id)}`);
    if (!target) throw new ApiError(404, "Not found");
    if (target.role === "admin") throw new ApiError(403, "Admin accounts cannot be toggled.");
    const rows = await sql`UPDATE users SET is_active = NOT is_active, updated_at = NOW() WHERE id = ${Number(id)} RETURNING id, email, is_active`;
    const updated = (rows as Row[])[0];
    await auditLog(sql, admin.id, updated.is_active ? "merchant_enabled" : "merchant_disabled", "user", Number(id), { email: String(updated.email) }, getClientIp(req));
    return ok({ id: updated.id, is_active: updated.is_active });
  } catch (e) { return handleError(e); }
}

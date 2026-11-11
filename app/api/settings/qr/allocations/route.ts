import { requireMerchant } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { listAllocations } from "@/lib/orders/allocations";
import { ok, handleError } from "@/lib/http";
export const dynamic = "force-dynamic";

// GET /api/settings/qr/allocations — merchant-scoped list of amount
// allocations (active, released, expired), 20 per page. Consumed by the
// QR-management UI. `status` filter: active | released | consumed.
export async function GET(req: Request) {
  try {
    const user = await requireMerchant();
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "";
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
    if (status && !["active", "released", "consumed"].includes(status)) {
      throw new ApiError(422, "status must be active, released or consumed.");
    }
    const sql = getSql();
    const data = await listAllocations(sql, user.id, { status, page });
    return ok(data);
  } catch (e) { return handleError(e); }
}

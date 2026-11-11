import { requireMerchant } from "@/lib/auth";
import { getMerchantDashboard } from "@/lib/merchant-orders";
import { ok, handleError } from "@/lib/http";
export const dynamic = "force-dynamic";
// GET /api/dashboard/stats — session-authenticated merchant dashboard stats
// (GAP 2). IST stats from lib/dashboard (single grouped aggregation):
// today/paid/pending/review counts, totals, success rate, 7-day paid chart,
// recent 6 orders. ?environment=live|sandbox (default live).
export async function GET(req: Request) {
  try {
    const user = await requireMerchant();
    const url = new URL(req.url);
    const environment = url.searchParams.get("environment") === "sandbox" ? "sandbox" : "live";
    const stats = await getMerchantDashboard(user.id, environment);
    return ok(stats);
  } catch (e) { return handleError(e); }
}

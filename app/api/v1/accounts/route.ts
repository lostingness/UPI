import { authenticateApiKey } from "@/lib/api-auth";
import { getSql } from "@/lib/db";
import { json, ok, handleError } from "@/lib/http";
import { checkTwoLayerRateLimit, rateLimitHeaders, apiKeyLimit } from "@/lib/rate-limit";
import { accountUsageMany, publicAccount } from "@/lib/accounts";
import type { AccountRow } from "@/lib/orders/create";
export const dynamic = "force-dynamic";
// GET /api/v1/accounts — merchant's live UPI accounts + used/remaining today.
// Sandbox creds → {environment:'sandbox', rotation_mode:null, data:[]}.
export async function GET(req: Request) {
  try {
    const merchant = await authenticateApiKey(req);
    const rl = await checkTwoLayerRateLimit(`api:v1:read:${merchant.id}`, apiKeyLimit());
    if (!rl.allowed) return json({ message: "Too many requests" }, 429, rateLimitHeaders(rl));
    if (merchant.environment === "sandbox") {
      return ok({ environment: "sandbox", rotation_mode: null, data: [] });
    }
    const sql = getSql();
    const accounts = (await sql`SELECT * FROM payment_accounts WHERE user_id = ${merchant.id} ORDER BY id ASC`) as AccountRow[];
    const usage = await accountUsageMany(sql, merchant.id, accounts);
    const data = accounts.map((a) => ({ ...publicAccount(a), ...(usage.get(Number(a.id)) ?? { used_today: 0, remaining_today: null }) }));
    return ok({ environment: "live", rotation_mode: merchant.rotationMode, data });
  } catch (e) { return handleError(e); }
}

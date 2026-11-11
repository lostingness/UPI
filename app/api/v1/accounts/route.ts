import { authenticateApiKey } from "@/lib/api-auth";
import { getSql } from "@/lib/db";
import { json, ok, handleError } from "@/lib/http";
import { accountUsage, publicAccount } from "@/lib/accounts";
import type { AccountRow } from "@/lib/orders/create";
export const dynamic = "force-dynamic";
// GET /api/v1/accounts — merchant's live UPI accounts + used/remaining today.
// Sandbox creds → {environment:'sandbox', rotation_mode:null, data:[]}.
export async function GET(req: Request) {
  try {
    const merchant = await authenticateApiKey(req);
    if (merchant.environment === "sandbox") {
      return ok({ environment: "sandbox", rotation_mode: null, data: [] });
    }
    const sql = getSql();
    const accounts = (await sql`SELECT * FROM payment_accounts WHERE user_id = ${merchant.id} ORDER BY id ASC`) as AccountRow[];
    const data = [];
    for (const a of accounts) {
      const usage = await accountUsage(sql, a.id);
      data.push({ ...publicAccount(a), ...usage });
    }
    return ok({ environment: "live", rotation_mode: merchant.rotationMode, data });
  } catch (e) { return handleError(e); }
}

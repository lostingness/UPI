import { requireMerchant } from "@/lib/auth";
import { webhookUrlSchema, parseBody } from "@/lib/validate";
import { checkSafeUrl } from "@/lib/webhooks/safe-url";
import { getSql } from "@/lib/db";
import { ok, handleError, readJson } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const user = await requireMerchant();
    const body = await readJson(req);
    const data = parseBody(webhookUrlSchema, body);
    await checkSafeUrl(data.webhook_url); // SafeUrl-validated at save time
    const sql = getSql();
    await sql`UPDATE users SET webhook_url = ${data.webhook_url}, updated_at = NOW() WHERE id = ${user.id}`;
    return ok({ updated: true });
  } catch (e) { return handleError(e); }
}

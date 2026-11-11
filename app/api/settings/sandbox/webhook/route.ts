import { requireMerchant } from "@/lib/auth";
import { webhookUrlSchema, parseBody } from "@/lib/validate";
import { checkSafeUrl } from "@/lib/webhooks/safe-url";
import { getSql, first, type Row } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { ok, handleError, readJson } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const user = await requireMerchant();
    const body = await readJson(req);
    const data = parseBody(webhookUrlSchema, body);
    await checkSafeUrl(data.webhook_url);
    const sql = getSql();
    const me = first<Row>(await sql`SELECT webhook_url FROM users WHERE id = ${user.id}`);
    if (me?.webhook_url === data.webhook_url) throw new ApiError(422, "Sandbox webhook URL must differ from the live webhook URL.");
    await sql`UPDATE users SET sandbox_webhook_url = ${data.webhook_url}, updated_at = NOW() WHERE id = ${user.id}`;
    return ok({ updated: true });
  } catch (e) { return handleError(e); }
}

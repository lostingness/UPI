import { requireMerchant } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { newWebhookSecret, encryptText } from "@/lib/crypto";
import { ok, handleError } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function POST() {
  try {
    const user = await requireMerchant();
    const secret = newWebhookSecret(false);
    const sql = getSql();
    await sql`UPDATE users SET webhook_secret = ${encryptText(secret)}, updated_at = NOW() WHERE id = ${user.id}`;
    return ok({ webhook_secret: secret });
  } catch (e) { return handleError(e); }
}

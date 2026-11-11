import { requireMerchant } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { newWebhookSecret, encryptText } from "@/lib/crypto";
import { ok, handleError } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function POST() {
  try {
    const user = await requireMerchant();
    const secret = newWebhookSecret(true);
    const sql = getSql();
    await sql`UPDATE users SET sandbox_webhook_secret = ${encryptText(secret)}, updated_at = NOW() WHERE id = ${user.id}`;
    return ok({ sandbox_webhook_secret: secret });
  } catch (e) { return handleError(e); }
}

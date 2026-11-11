import { requireMerchant } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { newApiKey, encryptText } from "@/lib/crypto";
import { ok, handleError } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function POST() {
  try {
    const user = await requireMerchant();
    const creds = newApiKey(true);
    const sql = getSql();
    await sql`UPDATE users SET sandbox_api_key = ${creds.key}, sandbox_api_secret = ${encryptText(creds.secret)}, updated_at = NOW() WHERE id = ${user.id}`;
    return ok({ sandbox_api_key: creds.key, sandbox_api_secret: creds.secret });
  } catch (e) { return handleError(e); }
}

import { requireMerchant } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { newApiKey, encryptText } from "@/lib/crypto";
import { ok, handleError } from "@/lib/http";
export const dynamic = "force-dynamic";
// New live key/secret; the secret is shown ONCE in this response only.
export async function POST() {
  try {
    const user = await requireMerchant();
    const creds = newApiKey(false);
    const sql = getSql();
    await sql`UPDATE users SET api_key = ${creds.key}, api_secret = ${encryptText(creds.secret)}, updated_at = NOW() WHERE id = ${user.id}`;
    return ok({ api_key: creds.key, api_secret: creds.secret });
  } catch (e) { return handleError(e); }
}

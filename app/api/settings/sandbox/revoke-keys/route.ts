import { requireMerchant } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { ok, handleError } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function POST() {
  try {
    const user = await requireMerchant();
    const sql = getSql();
    await sql`UPDATE users SET sandbox_api_key = NULL, sandbox_api_secret = NULL, updated_at = NOW() WHERE id = ${user.id}`;
    return ok({ revoked: true });
  } catch (e) { return handleError(e); }
}

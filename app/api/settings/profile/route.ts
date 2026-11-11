import { requireMerchant } from "@/lib/auth";
import { settingsProfileSchema, parseBody } from "@/lib/validate";
import { getSql } from "@/lib/db";
import { ok, handleError, readJson } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const user = await requireMerchant();
    const body = await readJson(req);
    const data = parseBody(settingsProfileSchema, body);
    const sql = getSql();
    await sql`UPDATE users SET name = COALESCE(${data.name ?? null}, name), business_name = ${data.business_name ?? null}, phone = ${data.phone ?? null}, updated_at = NOW() WHERE id = ${user.id}`;
    return ok({ updated: true });
  } catch (e) { return handleError(e); }
}

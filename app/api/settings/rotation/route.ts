import { requireMerchant } from "@/lib/auth";
import { rotationSchema, parseBody } from "@/lib/validate";
import { getSql } from "@/lib/db";
import { ok, handleError, readJson } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const user = await requireMerchant();
    const body = await readJson(req);
    const data = parseBody(rotationSchema, body);
    const sql = getSql();
    await sql`UPDATE users SET rotation_mode = ${data.rotation_mode}, updated_at = NOW() WHERE id = ${user.id}`;
    return ok({ updated: true });
  } catch (e) { return handleError(e); }
}

import { requireMerchant } from "@/lib/auth";
import { getAccount, publicAccount } from "@/lib/accounts";
import { updateLimitSchema, parseBody } from "@/lib/validate";
import { getSql } from "@/lib/db";
import { ok, handleError, readJson } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMerchant();
    const { id } = await params;
    const account = await getAccount(Number(id), user.id);
    const body = await readJson(req);
    const data = parseBody(updateLimitSchema, body);
    const sql = getSql();
    const rows = await sql`UPDATE payment_accounts SET daily_limit = ${data.daily_limit}, updated_at = NOW() WHERE id = ${account.id} RETURNING *`;
    return ok(publicAccount((rows as never[])[0] as never));
  } catch (e) { return handleError(e); }
}

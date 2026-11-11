import { requireMerchant } from "@/lib/auth";
import { getAccount, publicAccount } from "@/lib/accounts";
import { getSql } from "@/lib/db";
import { ok, handleError } from "@/lib/http";
export const dynamic = "force-dynamic";
// Set default: clears is_default on all the merchant's other accounts first.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMerchant();
    const { id } = await params;
    const account = await getAccount(Number(id), user.id);
    const sql = getSql();
    await sql`UPDATE payment_accounts SET is_default = false WHERE user_id = ${user.id}`;
    const rows = await sql`UPDATE payment_accounts SET is_default = true, updated_at = NOW() WHERE id = ${account.id} RETURNING *`;
    return ok(publicAccount((rows as never[])[0] as never));
  } catch (e) { return handleError(e); }
}

import { requireMerchant, assertOwns } from "@/lib/auth";
import { getAccount, publicAccount } from "@/lib/accounts";
import { getSql } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { ok, handleError } from "@/lib/http";
export const dynamic = "force-dynamic";
// DELETE — refused if any orders exist; disable instead.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMerchant();
    const { id } = await params;
    const account = await getAccount(Number(id), user.id);
    const sql = getSql();
    const orders = await sql`SELECT id FROM orders WHERE payment_account_id = ${account.id} LIMIT 1`;
    if ((orders as unknown[]).length > 0) throw new ApiError(422, "This account has orders. Disable it instead of deleting.");
    await sql`DELETE FROM payment_accounts WHERE id = ${account.id}`;
    return ok({ deleted: true });
  } catch (e) { return handleError(e); }
}

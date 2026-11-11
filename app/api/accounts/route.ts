import { requireMerchant } from "@/lib/auth";
import { listAccounts, validateAccountInput, credentialsJson, publicAccount } from "@/lib/accounts";
import { createAccountSchema, parseBody } from "@/lib/validate";
import { getSql, first, type Row } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { ok, handleError, readJson } from "@/lib/http";
import { accountUsage } from "@/lib/accounts";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await requireMerchant();
    const sql = getSql();
    const accounts = await listAccounts(user.id);
    const data = [];
    for (const a of accounts) data.push({ ...publicAccount(a), ...(await accountUsage(sql, a.id)) });
    return ok(data);
  } catch (e) { return handleError(e); }
}
export async function POST(req: Request) {
  try {
    const user = await requireMerchant();
    const body = await readJson(req);
    const data = parseBody(createAccountSchema, body);
    validateAccountInput(data as unknown as Record<string, unknown>);
    const sql = getSql();
    const existing = await listAccounts(user.id);
    const isFirst = existing.length === 0;
    const rows = await sql`
      INSERT INTO payment_accounts (user_id, provider, label, upi_id, payee_name, credentials, is_active, is_default, daily_limit)
      VALUES (${user.id}, ${data.provider}, ${data.label}, ${data.upi_id ?? null}, ${data.payee_name ?? ""},
        ${credentialsJson(data as unknown as Record<string, unknown>)}, true, ${isFirst}, ${data.daily_limit ?? null})
      RETURNING *`;
    return ok(publicAccount((rows as never[])[0] as never), 201);
  } catch (e) { return handleError(e); }
}

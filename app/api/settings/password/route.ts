import { requireMerchant, verifyPassword, hashPassword, createSessionToken, setSessionCookie } from "@/lib/auth";
import { changePasswordSchema, parseBody } from "@/lib/validate";
import { getSql, first, type Row } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { ok, handleError, readJson } from "@/lib/http";
export const dynamic = "force-dynamic";
// Change password. Changing the password invalidates all other sessions
// (the session token embeds a prefix of the password hash — see lib/auth.ts).
export async function PUT(req: Request) {
  try {
    const user = await requireMerchant();
    const body = await readJson(req);
    const data = parseBody(changePasswordSchema, body);
    const sql = getSql();
    const row = first<Row>(await sql`SELECT password, role FROM users WHERE id = ${user.id}`);
    if (!row || !(await verifyPassword(data.current_password, String(row.password)))) {
      throw new ApiError(422, "The current password is incorrect.");
    }
    const hash = await hashPassword(data.password);
    await sql`UPDATE users SET password = ${hash}, remember_token = NULL, updated_at = NOW() WHERE id = ${user.id}`;
    const token = await createSessionToken({ id: user.id, role: String(row.role), password: hash });
    await setSessionCookie(token);
    return ok({ updated: true });
  } catch (e) { return handleError(e); }
}

import { requireMerchant } from "@/lib/auth";
import { redirectDomainsSchema, parseBody } from "@/lib/validate";
import { getSql } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { ok, handleError, readJson } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const user = await requireMerchant();
    const body = await readJson(req);
    const data = parseBody(redirectDomainsSchema, body);
    const hosts = data.redirect_domains.split(/[\n,]+/).map((h) => h.trim().replace(/^https?:\/\//, "").split("/")[0].toLowerCase()).filter(Boolean);
    for (const h of hosts) if (!/^[a-z0-9.-]+$/.test(h)) throw new ApiError(422, `Invalid redirect domain: ${h}`);
    const sql = getSql();
    await sql`UPDATE users SET redirect_domains = ${JSON.stringify(hosts)}::jsonb, updated_at = NOW() WHERE id = ${user.id}`;
    return ok({ updated: true, redirect_domains: hosts });
  } catch (e) { return handleError(e); }
}

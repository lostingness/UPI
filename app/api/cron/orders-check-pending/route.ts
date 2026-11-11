import { ok, handleError } from "@/lib/http";
import { runOrdersCheckPending } from "@/lib/cron-handlers";
export const dynamic = "force-dynamic";
// Vercel Cron (see vercel.json). Guarded by CRON_SECRET (Authorization:
// Bearer <CRON_SECRET>). FAIL CLOSED: when CRON_SECRET is unset the route
// answers 401 in production — an unset secret must never leave a cron
// endpoint open. Local dev (NODE_ENV !== 'production') is the only
// allowance, so the endpoint can be exercised without a secret.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
export async function GET(req: Request) {
  try {
    if (!authorized(req)) return new Response("Unauthorized", { status: 401 });
    const result = await runOrdersCheckPending();
    return ok(result);
  } catch (e) { return handleError(e); }
}

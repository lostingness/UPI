import { ok, handleError } from "@/lib/http";
import { runWebhooksPrune } from "@/lib/cron-handlers";
export const dynamic = "force-dynamic";
// Vercel Cron (see vercel.json). Guarded by CRON_SECRET (Authorization:
// Bearer <CRON_SECRET>); Vercel Cron sends its own header in production —
// the secret check is skipped only when CRON_SECRET is unset (local dev).
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
export async function GET(req: Request) {
  try {
    if (!authorized(req)) return new Response("Unauthorized", { status: 401 });
    const result = await runWebhooksPrune();
    return ok(result);
  } catch (e) { return handleError(e); }
}

import { requireAdminConfirmed } from "@/lib/auth";
import { dispatchDue } from "@/lib/webhooks/dispatcher";
import { ok, handleError } from "@/lib/http";
export const dynamic = "force-dynamic";
// Admin/cron-triggered outbox dispatch (also runs on Vercel Cron every minute).
export async function POST() {
  try {
    await requireAdminConfirmed();
    const result = await dispatchDue();
    return ok(result);
  } catch (e) { return handleError(e); }
}

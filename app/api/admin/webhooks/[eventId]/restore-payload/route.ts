import { requireAdminConfirmed } from "@/lib/auth";
import { restorePayload } from "@/lib/webhooks/retention";
import { ApiError } from "@/lib/errors";
import { ok, handleError } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function POST(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    await requireAdminConfirmed();
    const { eventId } = await params;
    const restored = await restorePayload(eventId);
    if (!restored) throw new ApiError(404, "No archived payload found for this event.");
    return ok({ restored: true });
  } catch (e) { return handleError(e); }
}

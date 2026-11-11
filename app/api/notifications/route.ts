// GET /api/notifications — merchant's notification list + unread count.
// POST /api/notifications — mark as read ({ ids: number[] } or { all: true }).
// Session-authenticated, merchant-scoped by the session user (never another
// merchant's rows). The table is lazily created on first use (migration
// 015 is canonical), so the bell works even before `npm run migrate`.
import { requireMerchant } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { ok, handleError, readJson } from "@/lib/http";
import {
  listNotifications,
  markNotificationsRead,
  type NotificationRow,
} from "@/lib/notifications";
export const dynamic = "force-dynamic";

function serialize(n: NotificationRow) {
  return {
    id: Number(n.id),
    order_id: n.order_id === null ? null : Number(n.order_id),
    order_no: n.order_no,
    type: n.type,
    title: n.title,
    body: n.body,
    amount: n.amount === null ? null : Number(n.amount).toFixed(2),
    is_read: n.is_read === true,
    created_at: n.created_at,
  };
}

export async function GET(req: Request) {
  try {
    const user = await requireMerchant();
    const url = new URL(req.url);
    const limit = Math.min(Math.max(1, Number(url.searchParams.get("limit") ?? 20) || 20), 100);
    const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
    const unreadOnly = url.searchParams.get("unread_only") === "1";
    const { notifications, unreadCount } = await listNotifications(getSql(), user.id, {
      limit,
      offset,
      unreadOnly,
    });
    return ok({
      notifications: notifications.map(serialize),
      unread_count: unreadCount,
      has_more: notifications.length === limit,
    });
  } catch (e) { return handleError(e); }
}

export async function POST(req: Request) {
  try {
    const user = await requireMerchant();
    const body = (await readJson(req)) as { ids?: unknown; all?: unknown };
    const all = body.all === true;
    const ids = Array.isArray(body.ids)
      ? body.ids.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0)
      : [];
    if (!all && ids.length === 0) {
      throw new ApiError(422, "Provide notification ids to mark read, or { all: true }.");
    }
    const marked = await markNotificationsRead(getSql(), user.id, { ids, all });
    return ok({ marked_read: marked });
  } catch (e) { return handleError(e); }
}

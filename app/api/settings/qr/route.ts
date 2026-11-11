import { z } from "zod";
import { requireMerchant } from "@/lib/auth";
import { parseBody } from "@/lib/validate";
import { getSql } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import {
  getMerchantQrSettings, getQrAllocationCounts, updateMerchantQrSettings,
} from "@/lib/orders/allocations";
import { ok, handleError, readJson } from "@/lib/http";
export const dynamic = "force-dynamic";

// GET /api/settings/qr — the merchant's QR method + increment, with
// allocation counts (active, released today, expired today — IST day).
// Changing the method affects new orders only; existing orders keep the
// amount they were created with.
export async function GET() {
  try {
    const user = await requireMerchant();
    const sql = getSql();
    const settings = await getMerchantQrSettings(sql, user.id);
    const counts = await getQrAllocationCounts(sql, user.id);
    return ok({
      qr_method: settings.method,
      qr_increment_paise: settings.incrementPaise,
      active_allocations: counts.active,
      released_today: counts.releasedToday,
      expired_today: counts.expiredToday,
      applies_to: "new orders only",
    });
  } catch (e) { return handleError(e); }
}

const qrSettingsSchema = z.object({
  qr_method: z.enum(["unique", "same"]),
  qr_increment_paise: z.number().int().min(1).max(99),
});

// POST /api/settings/qr — merchant-only. Changing the method affects new
// orders only; existing orders keep their allocated amounts.
export async function POST(req: Request) {
  try {
    const user = await requireMerchant();
    const body = await readJson(req);
    const data = parseBody(qrSettingsSchema, body);
    const sql = getSql();
    try {
      await updateMerchantQrSettings(sql, user.id, {
        method: data.qr_method, incrementPaise: data.qr_increment_paise,
      });
    } catch (e) {
      const msg = String((e as Error)?.message ?? "");
      if (msg.includes("qr_method") || msg.includes("qr_increment_paise") || msg.includes("does not exist")) {
        throw new ApiError(503, "QR settings are not available until migration 013 is applied.");
      }
      throw e;
    }
    return ok({
      qr_method: data.qr_method,
      qr_increment_paise: data.qr_increment_paise,
      applies_to: "new orders only",
    });
  } catch (e) { return handleError(e); }
}

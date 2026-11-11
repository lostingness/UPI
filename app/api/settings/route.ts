import { requireMerchant } from "@/lib/auth";
import { getMerchantSettings } from "@/lib/merchant-orders";
import { ApiError } from "@/lib/errors";
import { ok, handleError } from "@/lib/http";
export const dynamic = "force-dynamic";
// GET /api/settings — session-authenticated current settings (GAP 2).
// Returns the merchant's own settings (profile, API key ids, webhook URLs,
// rotation mode, redirect domains). Secrets are never returned — the API
// secret is shown nowhere, same as the settings page.
export async function GET() {
  try {
    const user = await requireMerchant();
    const settings = await getMerchantSettings(user.id);
    if (!settings) throw new ApiError(404, "Not found");
    return ok(settings);
  } catch (e) { return handleError(e); }
}

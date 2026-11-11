import { handleCreateOrderDispatch } from "@/lib/api-orders";
export const dynamic = "force-dynamic";
// POST /api/v1/orders — API-key mode when X-Api-Key is present, otherwise the
// session-authenticated dashboard create (GAP 1). Same creation logic,
// idempotency and rate limits in both modes.
export async function POST(req: Request) { return handleCreateOrderDispatch(req); }

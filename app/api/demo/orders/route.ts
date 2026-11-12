import { handleCreateDemoOrder } from "@/lib/demo-orders";
export const dynamic = "force-dynamic";

// POST /api/demo/orders — one-click demo payment link (Round 8).
// Session-authenticated merchant only; creates a ₹10.00 sandbox (TST…)
// order via the shared createOrder() and returns its /demo/pay/TST…
// shareable URL. No live order, no provider, no real money — ever.
export async function POST(req: Request) {
  return handleCreateDemoOrder(req);
}

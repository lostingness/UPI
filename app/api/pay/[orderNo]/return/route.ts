import { NextResponse } from "next/server";
import { loadOrderByNo, checkOrder } from "@/lib/orders/check";
import { hasPgReturnSignal, RETURN_FORCE_BUDGET, RETURN_FORCE_WINDOW_SECONDS } from "@/lib/pay-token";
import { checkDurableRateLimit } from "@/lib/rate-limit";
import { gatewayConfig } from "@/lib/config/gateway";
import { getSql, first, type Row } from "@/lib/db";
export const dynamic = "force-dynamic";
// GET+POST /pay/{order}/return — IGNORES PG-posted data; forces check(force:true),
// then redirects to the merchant redirect_url (allowlisted, with
// ?order_id&client_order_id&status) if paid, else back to the pay page.
//
// Round 7 (H2): the old route forced a provider verification on EVERY hit,
// so anyone who knew an order_no could burn provider quota (and flip an
// expired-but-paid-late order to paid) just by visiting the return URL.
// The forced check now happens ONLY when (a) the request carries a
// plausible PG return signal (Paytm CHECKSUMHASH / PhonePe transaction id
// in the query or POST body — see hasPgReturnSignal), or (b) the per-order
// durable rate limit allows it (max 3 forced returns per order per 15 min).
// Otherwise the user is sent back to the pay page with NO provider call —
// the pay page's token-authorised poll (or the cron) performs the check.
// The return still never trusts PG-posted data: a forced check re-verifies
// server-side against the provider, exactly as before.
async function handle(req: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  const order = await loadOrderByNo(orderNo);
  if (!order) return NextResponse.redirect(`${gatewayConfig.appUrl}/`);
  let after = order;
  let bodyText = "";
  if (req.method === "POST") {
    try { bodyText = await req.text(); } catch { bodyText = ""; }
  }
  const pgSignal = hasPgReturnSignal(req, bodyText);
  const budget = pgSignal
    ? { allowed: true }
    : await checkDurableRateLimit(`pay:return:order:${order.id}`, RETURN_FORCE_BUDGET, RETURN_FORCE_WINDOW_SECONDS);
  if (pgSignal || budget.allowed) {
    after = await checkOrder(order, true);
  }
  if (after.status === "paid" && after.redirect_url) {
    const sql = getSql();
    const user = first<Row>(await sql`SELECT redirect_domains FROM users WHERE id = ${after.user_id}`);
    const domains = (user?.redirect_domains as string[]) ?? [];
    let host = "";
    try { host = new URL(after.redirect_url).hostname.toLowerCase(); } catch { host = ""; }
    const allowed = domains.some((d) => { const dd = d.toLowerCase(); return host === dd || host.endsWith(`.${dd}`); });
    if (allowed) {
      const u = new URL(after.redirect_url);
      u.searchParams.set("order_id", after.order_no);
      u.searchParams.set("client_order_id", after.client_order_id);
      u.searchParams.set("status", after.status);
      return NextResponse.redirect(u.toString());
    }
  }
  return NextResponse.redirect(`${gatewayConfig.appUrl}/pay/${after.order_no}`);
}
export async function GET(req: Request, ctx: { params: Promise<{ orderNo: string }> }) { return handle(req, ctx); }
export async function POST(req: Request, ctx: { params: Promise<{ orderNo: string }> }) { return handle(req, ctx); }

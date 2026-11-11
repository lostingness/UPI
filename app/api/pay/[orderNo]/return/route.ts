import { NextResponse } from "next/server";
import { loadOrderByNo, checkOrder } from "@/lib/orders/check";
import { gatewayConfig } from "@/lib/config/gateway";
import { getSql, first, type Row } from "@/lib/db";
export const dynamic = "force-dynamic";
// GET+POST /pay/{order}/return — IGNORES PG-posted data; forces check(force:true),
// then redirects to the merchant redirect_url (allowlisted, with
// ?order_id&client_order_id&status) if paid, else back to the pay page.
async function handle(_req: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  const order = await loadOrderByNo(orderNo);
  if (!order) return NextResponse.redirect(`${gatewayConfig.appUrl}/`);
  const after = await checkOrder(order, true);
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

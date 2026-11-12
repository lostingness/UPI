import type { Metadata } from "next";
import Link from "next/link";
import SandboxPayClient from "@/components/sandbox-client";
import { DbNotConfigured } from "@/components/ui";
import { dbConfigured, getPayData } from "@/components/server-data";

export const dynamic = "force-dynamic";

// Demo checkout (Round 8) — the shareable /demo/pay/TST… page for a demo
// payment link. It is the sandbox simulator with DEMO branding: the same
// getPayData + SandboxPayClient + /api/sandbox/pay/…/simulate flow as
// /sandbox/pay, so demo states (waiting / simulated-paid / expired) render
// exactly like sandbox states and no provider verification is ever touched.
// Only sandbox (TST…) orders render here — a live ORD… link gets the
// "Not a demo order" card, never a checkout.
export async function generateMetadata({ params }: { params: Promise<{ orderNo: string }> }): Promise<Metadata> {
  const { orderNo } = await params;
  return { title: `Demo payment — ${orderNo} · UPI Gateway`, robots: { index: false, follow: false } };
}

export default async function DemoPayPage({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  if (!dbConfigured()) {
    return (
      <main className="min-h-screen bg-[var(--bg)] px-4 py-10">
        <div className="mx-auto max-w-lg"><DbNotConfigured context="Demo checkout needs the database." /></div>
      </main>
    );
  }
  const data = await getPayData(orderNo);
  if (!data || data.order.environment !== "sandbox") {
    return (
      <main className="min-h-screen bg-[var(--bg)] px-4 py-10">
        <div className="mx-auto max-w-lg">
          <div className="card p-8 text-center">
            <p>
              <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-300">Demo</span>
            </p>
            <h1 className="mt-4 text-xl font-medium text-[var(--text)]">Not a demo order</h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              <span className="font-mono">{orderNo}</span> is not a demo (TST…) order. Demo links are sandbox orders created
              from the &ldquo;Create demo payment link&rdquo; button — no real money, no provider is contacted.
            </p>
            <Link href="/" className="btn btn-primary mt-6">Back home</Link>
          </div>
        </div>
      </main>
    );
  }
  const { order } = data;
  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 py-10">
      <SandboxPayClient
        demo
        orderNo={order.order_no} amount={String(order.amount)} clientOrderId={order.client_order_id}
        customerName={order.customer_name} status={order.status} createdAt={order.created_at}
      />
    </main>
  );
}

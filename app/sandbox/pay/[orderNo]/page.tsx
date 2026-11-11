import Link from "next/link";
import SandboxPayClient from "@/components/sandbox-client";
import { DbNotConfigured } from "@/components/ui";
import { dbConfigured, getPayData } from "@/components/server-data";

export const dynamic = "force-dynamic";

export default async function SandboxPayPage({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  if (!dbConfigured()) {
    return (
      <main className="min-h-screen bg-[var(--bg)] px-4 py-10">
        <div className="mx-auto max-w-lg"><DbNotConfigured context="Sandbox checkout needs the database." /></div>
      </main>
    );
  }
  const data = await getPayData(orderNo);
  if (!data || data.order.environment !== "sandbox") {
    return (
      <main className="min-h-screen bg-[var(--bg)] px-4 py-10">
        <div className="mx-auto max-w-lg">
          <div className="card p-8 text-center">
            <h1 className="text-xl font-medium text-[var(--text)]">Not a sandbox order</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              <span className="font-mono">{orderNo}</span> is not a sandbox (TST…) order. Sandbox checkout only works for test orders.
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
        orderNo={order.order_no} amount={String(order.amount)} clientOrderId={order.client_order_id}
        customerName={order.customer_name} status={order.status} createdAt={order.created_at}
      />
    </main>
  );
}

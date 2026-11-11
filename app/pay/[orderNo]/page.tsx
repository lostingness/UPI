import type { Metadata } from "next";
import PayClient from "@/components/pay-client";
import { DbNotConfigured } from "@/components/ui";
import { dbConfigured, getPayData } from "@/components/server-data";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ orderNo: string }> }): Promise<Metadata> {
  const { orderNo } = await params;
  return { title: `Pay — ${orderNo} · UPI Gateway`, robots: { index: false, follow: false } };
}

export default async function PayPage({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  if (!dbConfigured()) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
        <div className="w-full max-w-lg"><DbNotConfigured context="Checkout needs the database." /></div>
      </main>
    );
  }
  const data = await getPayData(orderNo);
  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
        <div className="card w-full max-w-lg p-8 text-center">
          <h1 className="text-xl font-bold text-slate-50">Order not found</h1>
          <p className="mt-2 text-sm text-slate-400">
            This payment link (<span className="font-mono">{orderNo}</span>) does not exist or was removed.
            Please ask the merchant for a new payment link.
          </p>
        </div>
      </main>
    );
  }
  const { order, account } = data;
  const api = data.api as Record<string, unknown>;
  return (
    <main className="flex min-h-screen flex-col bg-slate-950">
      <div className="flex flex-1 items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-3xl overflow-hidden rounded-2xl shadow-pop ring-1 ring-slate-800">
          {/* redirectUrl below is server-allowlisted only (getPayData):
              null unless paid AND redirect_url passes the merchant's
              redirect_domains. Never pass order.redirect_url here. */}
          <PayClient
            orderNo={order.order_no}
            amount={String(order.amount)}
            merchantName={data.merchantName}
            note={order.note}
            customerName={order.customer_name}
            status={order.status}
            expiresAt={order.expires_at}
            createdAt={order.created_at}
            upiIntent={api.upi_intent ? String(api.upi_intent) : null}
            upiId={account?.upi_id ?? null}
            hosted={data.hosted}
            pgName={account?.provider === "phonepe_pg" ? "PhonePe" : account?.provider === "paytm_pg" ? "Paytm" : null}
            acceptsUtr={data.acceptsUtr}
            utrAttempts={order.utr_attempts}
            reviewNote={order.review_note}
            customerUtr={order.customer_utr}
            utrSubmittedAt={order.utr_submitted_at}
            utr={order.utr}
            paidAt={order.paid_at}
            canRecover={data.canRecover}
            lateRecoveryUntil={data.lateRecoveryUntil}
            redirectUrl={data.redirectUrl}
          />
        </div>
      </div>
      <footer className="flex flex-col items-center gap-1.5 pb-6 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
          Secured by <span className="font-semibold text-slate-400">UPI Gateway</span>
        </div>
        <div>Payments go directly to the merchant&apos;s bank account via UPI.</div>
      </footer>
    </main>
  );
}

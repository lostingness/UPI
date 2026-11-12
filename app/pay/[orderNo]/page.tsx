import type { Metadata } from "next";
import PayClient from "@/components/pay-client";
import { ThemeToggle } from "@/components/theme-toggle";
import { DbNotConfigured } from "@/components/ui";
import { dbConfigured, getPayData } from "@/components/server-data";

// Round 4 integration: the pay page has no nav, so the theme toggle lives
// as a small unobtrusive corner button on every pay state (same toggle as
// landing + dashboard, same localStorage key).
function PayThemeToggle() {
  return (
    <div className="absolute right-3 top-3 z-10 rounded-full bg-[var(--surface)] shadow-[var(--shadow)] ring-1 ring-[var(--border)]">
      <ThemeToggle />
    </div>
  );
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ orderNo: string }> }): Promise<Metadata> {
  const { orderNo } = await params;
  return { title: `Pay — ${orderNo} · UPI Gateway`, robots: { index: false, follow: false } };
}

export default async function PayPage({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  if (!dbConfigured()) {
    return (
      <main className="relative flex min-h-screen items-center justify-center bg-[var(--bg)] p-4">
        <PayThemeToggle />
        <div className="w-full max-w-lg"><DbNotConfigured context="Checkout needs the database." /></div>
      </main>
    );
  }
  const data = await getPayData(orderNo);
  if (!data) {
    return (
      <main className="relative flex min-h-screen items-center justify-center bg-[var(--bg)] p-4">
        <PayThemeToggle />
        <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--border)]">
          <div className="h-[3px] bg-gradient-to-r from-[#f93f28] via-[#f2b380] to-[#f93f28]" aria-hidden="true" />
          <div className="p-8 text-center">
            <h1 className="text-xl font-medium">Order not found</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              This payment link (<span className="font-mono">{orderNo}</span>) does not exist or was removed.
              Please ask the merchant for a new payment link.
            </p>
          </div>
        </div>
      </main>
    );
  }
  const { order, account } = data;
  const api = data.api as Record<string, unknown>;
  return (
    <main className="relative flex min-h-screen flex-col bg-[var(--bg)]">
      <PayThemeToggle />
      <div className="flex flex-1 items-center justify-center p-3 sm:p-8">
        <div className="w-full max-w-3xl overflow-hidden rounded-[20px] bg-[var(--surface)] shadow-[var(--shadow)] ring-1 ring-[var(--border)]">
          <div className="h-[3px] bg-gradient-to-r from-[#f93f28] via-[#f2b380] to-[#f93f28]" aria-hidden="true" />
          {/* redirectUrl below is server-allowlisted only (getPayData):
              null unless paid AND redirect_url passes the merchant's
              redirect_domains. Never pass order.redirect_url here. */}
          <PayClient
            orderNo={order.order_no}
            amount={String(order.amount)}
            payableAmount={String(api.payable_amount)}
            qrMethod={String(api.qr_method)}
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
            payToken={data.payToken}
          />
        </div>
      </div>
      {/* Hidden below md: on a phone the pay screen must fit one viewport,
          and the footer is what pushed it over. Desktop keeps it. */}
      <footer className="hidden flex-col items-center gap-1.5 pb-6 text-xs text-[var(--faint)] md:flex">
        <div className="flex items-center gap-1.5">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
          Secured by <span className="font-medium text-[var(--muted)]">UPI Gateway</span>
        </div>
        <div>Payments go directly to the merchant&apos;s bank account via UPI.</div>
      </footer>
    </main>
  );
}

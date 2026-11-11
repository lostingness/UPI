import Link from "next/link";
import AutoSubmitForm from "@/components/pay-redirect-client";
import { ThemeToggle } from "@/components/theme-toggle";
import { DbNotConfigured } from "@/components/ui";
import { dbConfigured, getPayData } from "@/components/server-data";

export const dynamic = "force-dynamic";

export default async function PayRedirectPage({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  if (!dbConfigured()) {
    return (
      <main className="relative flex min-h-screen items-center justify-center bg-[var(--bg)] p-4">
        <div className="absolute right-3 top-3 z-10 rounded-full bg-[var(--surface)] shadow-[var(--shadow)] ring-1 ring-[var(--border)]"><ThemeToggle /></div>
        <div className="w-full max-w-lg"><DbNotConfigured context="Checkout needs the database." /></div>
      </main>
    );
  }
  const data = await getPayData(orderNo);
  const checkout = data?.order.provider_checkout as { type?: string; url?: string; fields?: Record<string, string> } | null;
  if (!data || !checkout?.url) {
    return (
      <main className="relative flex min-h-screen items-center justify-center bg-[var(--bg)] p-4">
        <div className="absolute right-3 top-3 z-10 rounded-full bg-[var(--surface)] shadow-[var(--shadow)] ring-1 ring-[var(--border)]"><ThemeToggle /></div>
        <div className="w-full max-w-md overflow-hidden rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--border)]">
          <div className="h-[3px] bg-gradient-to-r from-[#f93f28] via-[#f2b380] to-[#f93f28]" aria-hidden="true" />
          <div className="p-8 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent-text)]">Secure checkout</p>
            <h1 className="mt-3 text-xl font-medium text-[var(--text)]">No active checkout</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">There is no hosted checkout waiting for this order. It may have expired or already been paid.</p>
            <Link href={`/pay/${orderNo}`} className="btn btn-primary mt-6 w-full">Back to payment page</Link>
          </div>
        </div>
      </main>
    );
  }
  if (checkout.type === "redirect") {
    return (
      <main className="relative flex min-h-screen items-center justify-center bg-[var(--bg)] p-4">
        <div className="absolute right-3 top-3 z-10 rounded-full bg-[var(--surface)] shadow-[var(--shadow)] ring-1 ring-[var(--border)]"><ThemeToggle /></div>
        <div className="w-full max-w-md overflow-hidden rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--border)]">
          <div className="h-[3px] bg-gradient-to-r from-[#f93f28] via-[#f2b380] to-[#f93f28]" aria-hidden="true" />
          <div className="p-8 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent-text)]">Secure checkout</p>
            <h1 className="mt-3 text-xl font-medium text-[var(--text)]">Redirecting to secure checkout…</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">You are being taken to the payment gateway&apos;s secure page.</p>
            <a href={checkout.url} className="btn btn-primary mt-6 w-full">Continue to secure checkout →</a>
          </div>
        </div>
      </main>
    );
  }
  return <AutoSubmitForm url={checkout.url} fields={checkout.fields ?? {}} />;
}

import Link from "next/link";
import AutoSubmitForm from "@/components/pay-redirect-client";
import { DbNotConfigured } from "@/components/ui";
import { dbConfigured, getPayData } from "@/components/server-data";

export const dynamic = "force-dynamic";

export default async function PayRedirectPage({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  if (!dbConfigured()) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020816] p-4">
        <div className="w-full max-w-lg"><DbNotConfigured context="Checkout needs the database." /></div>
      </main>
    );
  }
  const data = await getPayData(orderNo);
  const checkout = data?.order.provider_checkout as { type?: string; url?: string; fields?: Record<string, string> } | null;
  if (!data || !checkout?.url) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020816] p-4">
        <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white/[0.03] ring-1 ring-white/10">
          <div className="h-[3px] bg-gradient-to-r from-[#f93f28] via-[#f2b380] to-[#f93f28]" aria-hidden="true" />
          <div className="p-8 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#f2b380]">Secure checkout</p>
            <h1 className="mt-3 text-xl font-medium text-slate-50">No active checkout</h1>
            <p className="mt-2 text-sm text-slate-400">There is no hosted checkout waiting for this order. It may have expired or already been paid.</p>
            <Link href={`/pay/${orderNo}`} className="btn btn-primary mt-6 w-full">Back to payment page</Link>
          </div>
        </div>
      </main>
    );
  }
  if (checkout.type === "redirect") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020816] p-4">
        <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white/[0.03] ring-1 ring-white/10">
          <div className="h-[3px] bg-gradient-to-r from-[#f93f28] via-[#f2b380] to-[#f93f28]" aria-hidden="true" />
          <div className="p-8 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#f2b380]">Secure checkout</p>
            <h1 className="mt-3 text-xl font-medium text-slate-50">Redirecting to secure checkout…</h1>
            <p className="mt-2 text-sm text-slate-400">You are being taken to the payment gateway&apos;s secure page.</p>
            <a href={checkout.url} className="btn btn-primary mt-6 w-full">Continue to secure checkout →</a>
          </div>
        </div>
      </main>
    );
  }
  return <AutoSubmitForm url={checkout.url} fields={checkout.fields ?? {}} />;
}

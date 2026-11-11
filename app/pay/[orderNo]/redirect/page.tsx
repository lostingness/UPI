import Link from "next/link";
import AutoSubmitForm from "@/components/pay-redirect-client";
import { DbNotConfigured } from "@/components/ui";
import { dbConfigured, getPayData } from "@/components/server-data";

export const dynamic = "force-dynamic";

export default async function PayRedirectPage({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  if (!dbConfigured()) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
        <div className="w-full max-w-lg"><DbNotConfigured context="Checkout needs the database." /></div>
      </main>
    );
  }
  const data = await getPayData(orderNo);
  const checkout = data?.order.provider_checkout as { type?: string; url?: string; fields?: Record<string, string> } | null;
  if (!data || !checkout?.url) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
        <div className="card w-full max-w-md p-8 text-center">
          <h1 className="text-xl font-medium text-slate-50">No active checkout</h1>
          <p className="mt-2 text-sm text-slate-400">There is no hosted checkout waiting for this order. It may have expired or already been paid.</p>
          <Link href={`/pay/${orderNo}`} className="btn btn-primary mt-6 w-full">Back to payment page</Link>
        </div>
      </main>
    );
  }
  if (checkout.type === "redirect") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
        <div className="card w-full max-w-md p-8 text-center">
          <h1 className="text-xl font-medium text-slate-50">Redirecting to secure checkout…</h1>
          <p className="mt-2 text-sm text-slate-400">You are being taken to the payment gateway&apos;s secure page.</p>
          <a href={checkout.url} className="btn btn-primary mt-6 w-full">Continue to secure checkout →</a>
        </div>
      </main>
    );
  }
  return <AutoSubmitForm url={checkout.url} fields={checkout.fields ?? {}} />;
}

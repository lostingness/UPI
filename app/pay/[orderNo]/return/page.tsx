// Hosted-checkout return page — port of pay-redirect.blade.php.
// The PG posts back to /api/pay/[orderNo]/return (which ignores PG-posted
// data, re-checks with the provider, and redirects). This page is the
// in-app fallback: it shows the status from the server-side check only, and
// never trusts anything the PG or browser sent.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/components/api";

export default function PayReturnPage({ params }: { params: Promise<{ orderNo: string }> }) {
  const [orderNo, setOrderNo] = useState<string>("");
  const [status, setStatus] = useState<string | null>(null);
  const [redirect, setRedirect] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    params.then(async ({ orderNo: no }) => {
      setOrderNo(no);
      // One server-side status check (the API re-checks with the provider).
      const res = await apiFetch<{ status: string; redirect: string | null }>(`/api/pay/${no}/status`);
      if (!alive) return;
      if (res.ok && res.data) {
        setStatus(res.data.status);
        setRedirect(res.data.redirect);
      } else {
        setError(res.message ?? "Could not check the payment status.");
      }
    });
    return () => { alive = false; };
  }, [params]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="card w-full max-w-lg p-8 text-center">
        {!status && !error && (
          <>
            <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-brand-400" />
            <h1 className="mt-5 text-xl font-bold text-slate-50">Checking your payment…</h1>
            <p className="mt-2 text-sm text-slate-400">We are confirming the payment with the provider. This status comes from the server — nothing the payment page sent is trusted.</p>
          </>
        )}
        {error && (
          <>
            <h1 className="text-xl font-bold text-slate-50">Couldn&apos;t check the payment</h1>
            <p className="mt-2 text-sm text-slate-400">{error}</p>
            {orderNo && <Link href={`/pay/${orderNo}`} className="btn btn-secondary mt-6">Back to payment page</Link>}
          </>
        )}
        {status === "paid" && (
          <>
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30">
              <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
            </div>
            <h1 className="mt-6 text-2xl font-bold text-slate-50">Payment successful</h1>
            <p className="mt-2 text-sm text-slate-400">Confirmed with the payment provider. You can safely close this page.</p>
            {redirect ? (
              <a href={redirect} className="btn btn-primary mt-6 w-full">Continue to merchant site →</a>
            ) : (
              orderNo && <Link href={`/pay/${orderNo}`} className="btn btn-primary mt-6 w-full">View receipt</Link>
            )}
          </>
        )}
        {status && status !== "paid" && (
          <>
            <h1 className="text-xl font-bold text-slate-50">Payment status: {status}</h1>
            <p className="mt-2 text-sm text-slate-400">
              {status === "pending" || status === "review"
                ? "Your payment is still being confirmed. This page shows the server-checked status only."
                : "This payment did not complete. If money was debited, share your UTR with the merchant — don't pay again."}
            </p>
            {orderNo && <Link href={`/pay/${orderNo}`} className="btn btn-primary mt-6 w-full">Back to payment page</Link>}
          </>
        )}
      </div>
    </main>
  );
}

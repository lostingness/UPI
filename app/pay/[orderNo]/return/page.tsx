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
    <main className="flex min-h-screen items-center justify-center bg-[#020816] p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white/[0.03] ring-1 ring-white/10">
        <div className="h-[3px] bg-gradient-to-r from-[#f93f28] via-[#f2b380] to-[#f93f28]" aria-hidden="true" />
        <div className="p-8 text-center">
          {!status && !error && (
            <>
              <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-[#f2b380]" />
              <h1 className="mt-5 text-xl font-medium text-slate-50">Checking your payment…</h1>
              <p className="mt-2 text-sm text-slate-400">We are confirming the payment with the provider. This status comes from the server — nothing the payment page sent is trusted.</p>
            </>
          )}
          {error && (
            <>
              <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-white/[0.04] ring-1 ring-white/10">
                <svg viewBox="0 0 24 24" className="h-11 w-11" fill="none" stroke="#fbbf24" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
              </div>
              <h1 className="mt-6 text-xl font-medium text-slate-50">Couldn&apos;t check the payment</h1>
              <p className="mt-2 text-sm text-slate-400">{error}</p>
              {orderNo && <Link href={`/pay/${orderNo}`} className="btn btn-secondary mt-6">Back to payment page</Link>}
            </>
          )}
          {status === "paid" && (
            <>
              <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-white/[0.04] ring-1 ring-white/10">
                <svg viewBox="0 0 24 24" className="h-11 w-11" fill="none" stroke="#34d399" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.25" /><path d="m8 12.4 2.7 2.7L16.4 9.4" /></svg>
              </div>
              <h1 className="mt-6 text-2xl font-medium text-slate-50">Payment successful</h1>
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
              <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-white/[0.04] ring-1 ring-white/10">
                {status === "pending" || status === "review" ? (
                  <svg viewBox="0 0 24 24" className="h-11 w-11" fill="none" stroke="#38bdf8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.25" /><path d="M12 7v5.2l3.2 2" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-11 w-11" fill="none" stroke="#fbbf24" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
                )}
              </div>
              <h1 className="mt-6 text-xl font-medium text-slate-50">Payment status: {status}</h1>
              <p className="mt-2 text-sm text-slate-400">
                {status === "pending" || status === "review"
                  ? "Your payment is still being confirmed. This page shows the server-checked status only."
                  : "This payment did not complete. If money was debited, share your UTR with the merchant — don't pay again."}
              </p>
              {orderNo && <Link href={`/pay/${orderNo}`} className="btn btn-primary mt-6 w-full">Back to payment page</Link>}
            </>
          )}
        </div>
      </div>
    </main>
  );
}

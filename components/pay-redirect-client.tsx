// pay-redirect — auto-submit POST form to the PG (port of
// pay-redirect.blade.php). The checkout payload is read from the order row
// (provider_checkout, cached by POST /api/pay/[orderNo]/start), never from
// the browser, and the form auto-submits on mount.
"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

export default function AutoSubmitForm({ url, fields }: { url: string; fields: Record<string, string> }) {
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const t = setTimeout(() => formRef.current?.submit(), 400);
    return () => clearTimeout(t);
  }, []);
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="card w-full max-w-md p-8 text-center">
        <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-brand-400" />
        <h1 className="mt-5 text-xl font-medium text-slate-50">Redirecting to secure checkout…</h1>
        <p className="mt-2 text-sm text-slate-400">You are being taken to the payment gateway&apos;s secure page. Do not close this tab.</p>
        <form ref={formRef} method="POST" action={url} className="mt-6">
          {Object.entries(fields).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <button className="btn btn-primary w-full">Continue to secure checkout →</button>
        </form>
      </div>
    </main>
  );
}

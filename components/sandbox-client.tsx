// Sandbox checkout — port of sandbox-pay.blade.php. Clearly labelled
// TEST ONLY: simulate one of the six outcomes; no provider is contacted,
// no real money moves.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormMessage, useApiForm } from "@/components/forms";
import { StatusPill, fmtDateTime, inr } from "@/components/ui";

const OUTCOMES: { outcome: string; label: string; cls: string; hint: string }[] = [
  { outcome: "success", label: "Simulate success", cls: "btn-success", hint: "Order becomes paid, webhook order.paid fires." },
  { outcome: "failed", label: "Simulate failure", cls: "btn-danger", hint: "Order becomes failed." },
  { outcome: "pending", label: "Keep pending", cls: "btn-secondary", hint: "Nothing changes — stays pending." },
  { outcome: "expired", label: "Simulate expiry", cls: "btn-secondary", hint: "Order becomes expired." },
  { outcome: "timeout", label: "Simulate timeout", cls: "btn-secondary", hint: "Simulated provider timeout (HTTP 504). No external provider was contacted." },
  { outcome: "invalid_reference", label: "Invalid reference", cls: "btn-danger", hint: "Provider rejects the reference — order fails verification." },
];

export default function SandboxPayClient({ orderNo, amount, clientOrderId, customerName, status, createdAt }: {
  orderNo: string; amount: string; clientOrderId: string; customerName: string | null; status: string; createdAt: string;
}) {
  const router = useRouter();
  const form = useApiForm<{ status: string }>();
  const [picked, setPicked] = useState<string | null>(null);
  const done = status !== "pending";

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 rounded-xl bg-amber-500/10 px-5 py-4 text-center text-sm font-medium text-amber-300 ring-1 ring-amber-500/30">
        Sandbox — test transaction, no real money
      </div>
      <section className="card p-6 ring-amber-500/30">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-medium text-slate-50">Payment simulator</h1>
            <p className="mt-1 text-sm text-slate-400">Choose one controlled outcome for this test order.</p>
          </div>
          <StatusPill status={status} />
        </div>
        <dl className="mt-6 grid gap-3 rounded-xl bg-slate-800/60 p-4 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">TEST order</dt><dd className="font-mono font-medium text-slate-100">{orderNo}</dd></div>
          <div><dt className="text-slate-500">Client reference</dt><dd className="font-mono font-medium text-slate-100">{clientOrderId}</dd></div>
          <div><dt className="text-slate-500">Amount</dt><dd className="font-medium text-slate-100">{inr(Number(amount))}</dd></div>
          <div><dt className="text-slate-500">Customer</dt><dd className="text-slate-100">{customerName ?? "Test customer"}</dd></div>
          <div><dt className="text-slate-500">Created</dt><dd className="text-slate-100">{fmtDateTime(createdAt)}</dd></div>
          <div><dt className="text-slate-500">Status</dt><dd className="text-slate-100">{status}</dd></div>
        </dl>
        <div className="mt-5"><FormMessage message={form.message} ok={false} /></div>
        {form.ok && form.data && (
          <div className="mt-5 rounded-lg bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 ring-1 ring-emerald-500/30">
            Simulated outcome applied — order is now <strong>{form.data.status}</strong>.
          </div>
        )}
        {!done ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {OUTCOMES.map((o) => (
              <div key={o.outcome}>
                <button
                  className={`btn ${o.cls} w-full`} disabled={form.pending}
                  onClick={async () => {
                    setPicked(o.outcome);
                    const res = await form.submit(`/api/sandbox/pay/${orderNo}/simulate`, { outcome: o.outcome });
                    if (res.ok) router.refresh();
                  }}
                >
                  {form.pending && picked === o.outcome ? "Simulating…" : o.label}
                </button>
                <p className="mt-1.5 text-center text-[11px] text-slate-500">{o.hint}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-lg bg-slate-800/60 px-4 py-3 text-center text-sm text-slate-400">
            This TEST order is complete ({status}). Create another Sandbox order to simulate a different outcome.
          </div>
        )}
      </section>
      <p className="mt-4 text-center text-xs text-slate-500">
        Sandbox orders are created with sandbox API credentials (<code className="kbd">test_key_…</code>) via <code className="kbd">POST /api/v1/orders</code>. See <a href="/docs" className="font-medium text-brand-400">API docs</a>.
      </p>
    </div>
  );
}

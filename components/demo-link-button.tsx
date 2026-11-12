// Dashboard "Create demo payment link" button + result card (Round 8).
// One click creates a ₹10.00 demo (sandbox) order via POST /api/demo/orders
// and shows the shareable /demo/pay/TST… link, labelled DEMO throughout —
// the button, the card, the link itself. No real money, no provider.
"use client";

import { useState } from "react";
import { CopyButton, FormMessage, useApiForm } from "@/components/forms";
import { inr } from "@/components/ui";
import type { DemoOrderResult } from "@/lib/demo";

export function DemoLinkButton() {
  const form = useApiForm<DemoOrderResult>();
  const [result, setResult] = useState<DemoOrderResult | null>(null);
  return (
    <div>
      <button
        type="button"
        className="btn btn-secondary w-full cursor-pointer"
        disabled={form.pending}
        onClick={async () => {
          const res = await form.submit("/api/demo/orders", {});
          if (res.ok && res.data) setResult(res.data);
        }}
      >
        {form.pending ? "Creating demo link…" : "Create demo payment link"}
      </button>
      <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
        Try the checkout without real money — creates a ₹10.00 demo (sandbox) order you can share.
      </p>
      <FormMessage message={form.message} ok={false} />
      {result && (
        <div className="mt-3 rounded-xl bg-amber-500/10 p-4 ring-1 ring-amber-500/30" data-testid="demo-link-card">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-300">Demo</span>
            <span className="text-sm font-medium text-[var(--text)]">Demo payment link — no real money</span>
          </div>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-[var(--muted)]">Order</dt><dd className="font-mono font-medium text-[var(--text)]">{result.order_id}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--muted)]">Amount</dt><dd className="font-medium text-[var(--text)]">{inr(Number(result.amount))} (demo)</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--muted)]">Status</dt><dd className="font-medium text-[var(--text)]">{result.status}</dd></div>
          </dl>
          <p className="mt-3 break-all font-mono text-xs text-[var(--text)]">{result.payment_url}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <CopyButton text={result.payment_url} label="Copy link" />
            <a href={result.payment_url} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">Open demo link</a>
          </div>
        </div>
      )}
    </div>
  );
}

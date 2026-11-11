// Manual payment-link form — port of orders/create.blade.php.
// Posts to POST /api/orders, which authenticates the logged-in merchant by
// session cookie (no API key needed here; the secret never reaches the
// browser). On success the new order_id routes to the order detail page.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldError, FormMessage, useApiForm } from "@/components/forms";
import { playOrderCreatedTick, unlockAudio } from "@/lib/sounds";

export function CreateOrderForm({ accounts }: { accounts: { id: number; label: string; provider: string; is_active: boolean }[] }) {
  const router = useRouter();
  const form = useApiForm<{ order_id: string }>();
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [note, setNote] = useState("");
  const amt = Number(amount);
  const preview = Number.isFinite(amt) && amt > 0 ? `₹${amt.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "₹0.00";

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        // Round 5: the submit click IS a user gesture — unlock audio here
        // so the tick below (which plays after the server round-trip) can
        // sound. The tick itself fires only on a confirmed 201.
        unlockAudio();
        const res = await form.submit("/api/orders", {
          amount: amt,
          payment_account_id: accountId ? Number(accountId) : null,
          customer_name: customerName || null,
          customer_mobile: customerMobile || null,
          note: note || null,
        });
        if (res.ok && res.data?.order_id) {
          playOrderCreatedTick();
          router.push(`/orders/${res.data.order_id}`);
        }
      }}
    >
      <FormMessage message={form.message} ok={false} />
      <div>
        <label htmlFor="o-amount" className="label">Amount (₹)</label>
        <input id="o-amount" type="number" min="1" max="100000" step="0.01" required placeholder="e.g. 499"
          className="input text-lg font-medium tabular-nums" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <p className="help">You are charging <strong className="text-[var(--text)]">{preview}</strong> · ₹1 – ₹1,00,000</p>
        <FieldError errors={form.errors} name="amount" />
      </div>
      <div>
        <label htmlFor="o-account" className="label">Payment account</label>
        <select id="o-account" className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Auto — rotate between active accounts</option>
          {accounts.filter((a) => a.is_active).map((a) => (
            <option key={a.id} value={a.id}>{a.label} ({a.provider})</option>
          ))}
        </select>
        <p className="help">Only active accounts are listed. Leave empty to let rotation pick one.</p>
        <FieldError errors={form.errors} name="payment_account_id" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="o-name" className="label">Customer name</label>
          <input id="o-name" maxLength={100} placeholder="Optional" className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          <FieldError errors={form.errors} name="customer_name" />
        </div>
        <div>
          <label htmlFor="o-mobile" className="label">Customer mobile</label>
          <input id="o-mobile" maxLength={20} placeholder="Optional" className="input" value={customerMobile} onChange={(e) => setCustomerMobile(e.target.value)} />
          <FieldError errors={form.errors} name="customer_mobile" />
        </div>
      </div>
      <div>
        <label htmlFor="o-note" className="label">Note</label>
        <input id="o-note" maxLength={50} placeholder="Optional — shown on the checkout page" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        <FieldError errors={form.errors} name="note" />
      </div>
      <button className="btn btn-primary w-full py-2.5" disabled={form.pending}>
        {form.pending ? "Creating…" : "Create payment link →"}
      </button>
    </form>
  );
}

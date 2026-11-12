// Manual payment-link form — port of orders/create.blade.php.
// Posts to POST /api/orders, which authenticates the logged-in merchant by
// session cookie (no API key needed here; the secret never reaches the
// browser). On success the new order_id routes to the order detail page.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldError, FormMessage, useApiForm } from "@/components/forms";
import { unlockAudio } from "@/lib/sounds";
import { playOrderCreatedMp3, unlockMp3Audio } from "@/lib/mp3-sounds";

export function CreateOrderForm({ accounts }: { accounts: { id: number; label: string; provider: string; is_active: boolean }[] }) {
  const router = useRouter();
  const form = useApiForm<{ order_id: string }>();
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  // Round 7: per-order QR method — Unique Amount is the platform default.
  const [method, setMethod] = useState<"unique" | "normal">("unique");
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
        // so the sound below (which plays after the server round-trip) can
        // sound. The sound itself fires only on a confirmed 201.
        unlockAudio();
        unlockMp3Audio();
        const res = await form.submit("/api/orders", {
          amount: amt,
          payment_account_id: accountId ? Number(accountId) : null,
          customer_name: customerName || null,
          customer_mobile: customerMobile || null,
          note: note || null,
          qr_method: method,
        });
        if (res.ok && res.data?.order_id) {
          // Round 7: MP3 order-created sound (falls back to the synth
          // tick when the file cannot play).
          playOrderCreatedMp3();
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
        <span className="label" id="o-method-label">Payment amount</span>
        <div role="radiogroup" aria-labelledby="o-method-label" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {([
            {
              value: "unique" as const,
              title: "Unique Amount",
              desc: "Each order gets a unique paise amount, e.g. ₹500 → ₹500.01, so payments match automatically",
            },
            {
              value: "normal" as const,
              title: "Normal Amount",
              desc: "The exact amount you enter, no extra paise",
            },
          ]).map((opt) => {
            const selected = method === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setMethod(opt.value)}
                className={`rounded-xl p-3 text-left ring-1 transition ${
                  selected
                    ? "bg-[var(--surface-2)] ring-2 ring-[var(--accent-text)]"
                    : "ring-[var(--border)] hover:bg-[var(--surface-2)]"
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                  <span
                    aria-hidden="true"
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ring-1 ${
                      selected ? "ring-[var(--accent-text)]" : "ring-[var(--faint)]"
                    }`}
                  >
                    {selected && <span className="h-2 w-2 rounded-full bg-[var(--accent-text)]" />}
                  </span>
                  {opt.title}
                  {selected && <span className="ml-auto rounded-full bg-[var(--accent-text)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Selected</span>}
                </span>
                <span className="mt-1.5 block text-xs leading-relaxed text-[var(--muted)]">{opt.desc}</span>
              </button>
            );
          })}
        </div>
        <p className="help">
          {method === "unique"
            ? "The customer pays a few paise above the amount — the exact paise are assigned when the link is created."
            : "The customer pays exactly the amount above."}
        </p>
        <FieldError errors={form.errors} name="qr_method" />
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

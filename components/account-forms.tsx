// Payment account forms (client) — port of accounts/create.blade.php and the
// per-account actions in accounts/index.blade.php. Credentials are entered
// here and stored encrypted server-side; they are never displayed again.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldError, FormMessage, useApiForm } from "@/components/forms";
import { postApi } from "@/components/api";

const PROVIDERS = [
  { id: "manual", label: "Manual UPI", hint: "Personal UPI ID — customers pay you directly, UTR is reviewed by you." },
  { id: "paytm_business", label: "Paytm for Business", hint: "Unofficial Paytm status API — verified against your Paytm merchant account." },
  { id: "paytm_pg", label: "Paytm PG", hint: "Official hosted checkout (UPI, card, netbanking) via Paytm Payment Gateway." },
  { id: "phonepe_pg", label: "PhonePe PG", hint: "Official hosted checkout (UPI, card, netbanking) via PhonePe PG v2." },
] as const;

export function CreateAccountForm() {
  const router = useRouter();
  const form = useApiForm<{ id: number }>();
  const [provider, setProvider] = useState<string>("manual");
  const [v, setV] = useState({
    label: "", upi_id: "", payee_name: "", daily_limit: "",
    mid: "", merchant_key: "", website_name: "", client_id: "", client_secret: "", client_version: "",
    environment: "production",
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));
  const hosted = provider === "paytm_pg" || provider === "phonepe_pg";
  const needsUpi = !hosted;

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const body: Record<string, unknown> = {
          provider, label: v.label,
          upi_id: needsUpi ? v.upi_id : null,
          payee_name: v.payee_name || null,
          daily_limit: v.daily_limit ? Number(v.daily_limit) : null,
        };
        if (provider === "paytm_business") body.mid = v.mid;
        if (provider === "paytm_pg") {
          body.mid = v.mid; body.merchant_key = v.merchant_key;
          body.website_name = v.website_name || undefined; body.environment = v.environment;
        }
        if (provider === "phonepe_pg") {
          body.client_id = v.client_id; body.client_secret = v.client_secret;
          body.client_version = v.client_version; body.environment = v.environment;
        }
        const res = await form.submit("/api/accounts", body);
        if (res.ok) router.push("/accounts");
      }}
    >
      <FormMessage message={form.message} ok={false} />
      <div>
        <label className="label">Provider</label>
        <div className="grid gap-2 sm:grid-cols-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.id} type="button"
              onClick={() => setProvider(p.id)}
              className={`rounded-xl p-4 text-left ring-1 transition ${provider === p.id ? "bg-brand-600/15 ring-brand-500" : "bg-slate-800/50 ring-slate-700 hover:ring-slate-600"}`}
            >
              <div className="text-sm font-semibold text-slate-100">{p.label}</div>
              <div className="mt-1 text-xs leading-relaxed text-slate-400">{p.hint}</div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="a-label" className="label">Label</label>
        <input id="a-label" required maxLength={255} placeholder="e.g. Main UPI, Store Paytm" className="input" value={v.label} onChange={set("label")} />
        <p className="help">Shown on the dashboard and order pages.</p>
        <FieldError errors={form.errors} name="label" />
      </div>
      {needsUpi && (
        <>
          <div>
            <label htmlFor="a-upi" className="label">UPI ID</label>
            <input id="a-upi" required placeholder="e.g. yourname@okhdfcbank" className="input font-mono" value={v.upi_id} onChange={set("upi_id")} />
            <FieldError errors={form.errors} name="upi_id" />
          </div>
          <div>
            <label htmlFor="a-payee" className="label">Payee name</label>
            <input id="a-payee" maxLength={255} placeholder="Shown to the customer on the checkout page" className="input" value={v.payee_name} onChange={set("payee_name")} />
            <FieldError errors={form.errors} name="payee_name" />
          </div>
        </>
      )}
      {(provider === "paytm_business" || provider === "paytm_pg") && (
        <div>
          <label htmlFor="a-mid" className="label">Merchant ID (MID)</label>
          <input id="a-mid" required maxLength={40} placeholder="Paytm MID" className="input font-mono" value={v.mid} onChange={set("mid")} />
          <FieldError errors={form.errors} name="mid" />
        </div>
      )}
      {provider === "paytm_pg" && (
        <>
          <div>
            <label htmlFor="a-mkey" className="label">Merchant key</label>
            <input id="a-mkey" type="password" required maxLength={100} autoComplete="off" placeholder="Paytm merchant key" className="input font-mono" value={v.merchant_key} onChange={set("merchant_key")} />
            <p className="help">Stored encrypted. Never displayed again.</p>
            <FieldError errors={form.errors} name="merchant_key" />
          </div>
          <div>
            <label htmlFor="a-website" className="label">Website name</label>
            <input id="a-website" maxLength={40} placeholder="DEFAULT" className="input font-mono" value={v.website_name} onChange={set("website_name")} />
            <FieldError errors={form.errors} name="website_name" />
          </div>
        </>
      )}
      {provider === "phonepe_pg" && (
        <>
          <div>
            <label htmlFor="a-client-id" className="label">Client ID</label>
            <input id="a-client-id" required maxLength={150} autoComplete="off" className="input font-mono" value={v.client_id} onChange={set("client_id")} />
            <FieldError errors={form.errors} name="client_id" />
          </div>
          <div>
            <label htmlFor="a-client-secret" className="label">Client secret</label>
            <input id="a-client-secret" type="password" required maxLength={200} autoComplete="off" className="input font-mono" value={v.client_secret} onChange={set("client_secret")} />
            <p className="help">Stored encrypted. Never displayed again.</p>
            <FieldError errors={form.errors} name="client_secret" />
          </div>
          <div>
            <label htmlFor="a-client-version" className="label">Client version</label>
            <input id="a-client-version" required maxLength={10} placeholder="e.g. 1" className="input font-mono" value={v.client_version} onChange={set("client_version")} />
            <FieldError errors={form.errors} name="client_version" />
          </div>
        </>
      )}
      {hosted && (
        <div>
          <label htmlFor="a-env" className="label">Environment</label>
          <select id="a-env" className="input" value={v.environment} onChange={set("environment")}>
            <option value="production">Production</option>
            <option value="sandbox">Sandbox</option>
          </select>
          <FieldError errors={form.errors} name="environment" />
        </div>
      )}
      <div>
        <label htmlFor="a-limit" className="label">Daily limit (₹, optional)</label>
        <input id="a-limit" type="number" min="1" max="10000000" step="1" placeholder="No limit" className="input" value={v.daily_limit} onChange={set("daily_limit")} />
        <p className="help">Maximum this account can receive per day (IST). Orders stop routing here once reached.</p>
        <FieldError errors={form.errors} name="daily_limit" />
      </div>
      <button className="btn btn-primary w-full py-2.5" disabled={form.pending}>
        {form.pending ? "Adding account…" : "Add payment account"}
      </button>
    </form>
  );
}

export function AccountActions({ id, isActive, isDefault }: { id: number; isActive: boolean; isDefault: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (key: string, path: string, method = "POST", body: unknown = {}) => {
    setBusy(key); setError(null);
    const res = await postApi(path, body, method);
    setBusy(null);
    if (res.ok) router.refresh();
    else setError(res.message ?? "Request failed");
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn btn-secondary btn-sm" disabled={!!busy}
        onClick={() => run("toggle", `/api/accounts/${id}/toggle`)}>
        {busy === "toggle" ? "…" : isActive ? "Disable" : "Enable"}
      </button>
      {!isDefault && (
        <button className="btn btn-secondary btn-sm" disabled={!!busy}
          onClick={() => run("default", `/api/accounts/${id}/default`)}>
          {busy === "default" ? "…" : "Make default"}
        </button>
      )}
      <button className="btn btn-danger btn-sm" disabled={!!busy}
        onClick={() => {
          if (!window.confirm("Delete this payment account? Accounts with orders cannot be deleted — disable them instead.")) return;
          run("delete", `/api/accounts/${id}`, "DELETE");
        }}>
        {busy === "delete" ? "…" : "Delete"}
      </button>
      {error && <span className="w-full text-xs text-red-400">{error}</span>}
    </div>
  );
}

export function LimitForm({ id, dailyLimit }: { id: number; dailyLimit: string | null }) {
  const router = useRouter();
  const form = useApiForm();
  const [limit, setLimit] = useState(dailyLimit ?? "");
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await form.submit(`/api/accounts/${id}/limit`, { daily_limit: limit === "" ? null : Number(limit) });
        if (res.ok) router.refresh();
      }}
    >
      <div className="min-w-36 flex-1">
        <label htmlFor={`limit-${id}`} className="label">Daily limit (₹)</label>
        <input id={`limit-${id}`} type="number" min="1" max="10000000" step="1" placeholder="No limit"
          className="input" value={limit} onChange={(e) => setLimit(e.target.value)} />
      </div>
      <button className="btn btn-secondary" disabled={form.pending}>{form.pending ? "Saving…" : "Save limit"}</button>
      {form.message && <span className="w-full text-xs text-red-400">{form.message}</span>}
      {form.ok && <span className="w-full text-xs text-emerald-300">Limit saved.</span>}
    </form>
  );
}

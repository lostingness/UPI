// First-run setup wizard — replaces the Laravel /install flow (install/* Blade
// views). On Vercel there is no PHP, no .env file to write and no migrations to
// run from the browser: the database is the Neon DATABASE_URL env var and
// migrations are applied with `npm run migrate` (or the Neon SQL editor).
// This wizard therefore: (1) checks the DB is configured and reachable,
// (2) creates the first admin, (3) points at the login. It never pretends
// setup succeeded without a real database.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldError, FormMessage, useApiForm, getApi } from "@/components/forms";

export function SetupWizard({ databaseConfigured, installed }: { databaseConfigured: boolean; installed: boolean }) {
  const router = useRouter();
  const form = useApiForm();
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<{ installed: boolean; database_configured: boolean } | null>(null);
  const [v, setV] = useState({ name: "", email: "", password: "", password_confirmation: "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  const runCheck = async () => {
    setChecking(true);
    const res = await getApi<{ installed: boolean; database_configured: boolean }>("/api/setup");
    setChecking(false);
    if (res.ok && res.data) setCheck(res.data);
    else setCheck({ installed, database_configured: false });
  };

  const dbOk = check ? check.database_configured : databaseConfigured;

  return (
    <div className="space-y-6">
      {/* Step 1 — database */}
      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-100">1 · Database</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${dbOk ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" : "bg-red-500/15 text-red-300 ring-red-500/30"}`}>
            {dbOk ? "Configured" : "Not configured"}
          </span>
        </div>
        {dbOk ? (
          <p className="mt-2 text-sm text-slate-400">
            A <code className="kbd">DATABASE_URL</code> is set. Make sure migrations have been applied
            (<code className="kbd">npm run migrate</code> or the Neon SQL editor, <code className="kbd">db/migrations/*.sql</code>).
            The check below confirms the app can reach the database.
          </p>
        ) : (
          <div className="mt-3 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-300 ring-1 ring-red-500/30">
            <p className="font-semibold">Database not configured</p>
            <p className="mt-1 text-red-200/80">
              Set the Neon pooled <code className="kbd">DATABASE_URL</code> environment variable (Production + Preview as needed),
              apply <code className="kbd">db/migrations/*.sql</code>, then come back. Setup cannot continue without a real database —
              nothing is created or faked here.
            </p>
          </div>
        )}
        <button type="button" className="btn btn-secondary mt-3" onClick={runCheck} disabled={checking}>
          {checking ? "Checking…" : "Check database"}
        </button>
        {check && (
          <p className="mt-2 text-sm text-slate-400">
            Result: database {check.database_configured ? "reachable" : "not reachable"} ·{" "}
            {check.installed ? "already installed" : "not installed yet"}.
          </p>
        )}
      </section>

      {/* Step 2 — admin */}
      <section className="border-t border-slate-800 pt-6">
        <h2 className="text-base font-semibold text-slate-100">2 · Create the first admin</h2>
        <p className="mt-1 text-sm text-slate-400">
          This account administers the gateway (merchants, orders, webhooks, audit logs). Choose a strong password — minimum 10 characters.
        </p>
        <form
          className="mt-4 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const res = await form.submit("/api/setup", v);
            if (res.ok) router.push("/setup?done=1");
          }}
        >
          <FormMessage message={form.message} ok={form.ok} />
          <div>
            <label htmlFor="s-name" className="label">Name</label>
            <input id="s-name" required autoComplete="name" className="input" value={v.name} onChange={set("name")} disabled={!dbOk} />
            <FieldError errors={form.errors} name="name" />
          </div>
          <div>
            <label htmlFor="s-email" className="label">Email</label>
            <input id="s-email" type="email" required autoComplete="email" placeholder="admin@business.com" className="input" value={v.email} onChange={set("email")} disabled={!dbOk} />
            <FieldError errors={form.errors} name="email" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="s-password" className="label">Password</label>
              <input id="s-password" type="password" required autoComplete="new-password" placeholder="Min 10 chars" className="input" value={v.password} onChange={set("password")} disabled={!dbOk} />
              <FieldError errors={form.errors} name="password" />
            </div>
            <div>
              <label htmlFor="s-confirm" className="label">Confirm password</label>
              <input id="s-confirm" type="password" required autoComplete="new-password" className="input" value={v.password_confirmation} onChange={set("password_confirmation")} disabled={!dbOk} />
              <FieldError errors={form.errors} name="password_confirmation" />
            </div>
          </div>
          <button className="btn btn-primary w-full py-2.5" disabled={form.pending || !dbOk}>
            {form.pending ? "Creating admin…" : "Create admin & finish setup"}
          </button>
          {!dbOk && <p className="help text-center">The form unlocks once the database is configured.</p>}
        </form>
      </section>
    </div>
  );
}

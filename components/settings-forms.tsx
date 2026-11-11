// Settings forms (client) — one form per API route, mirroring the nine
// settings forms in settings.blade.php. Secrets are shown once only, in the
// API response, and never stored in the page.
"use client";

import { useState } from "react";
import { FieldError, FormMessage, useApiForm } from "./forms";
import { CopyButton } from "./forms";

function OnceSecret({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg bg-emerald-500/10 p-4 ring-1 ring-emerald-500/30">
      <label className="label font-medium text-emerald-700 dark:text-emerald-300">{label} · copy now (will not be shown again)</label>
      <div className="flex gap-2">
        <input readOnly value={value} className="input font-mono font-medium" />
        <CopyButton text={value} />
      </div>
      {note && <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-200/80">{note}</p>}
    </div>
  );
}

export function ProfileForm({ initial }: { initial: { name: string; businessName: string | null; phone: string | null } }) {
  const form = useApiForm();
  const [v, setV] = useState({ name: initial.name, business_name: initial.businessName ?? "", phone: initial.phone ?? "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); await form.submit("/api/settings/profile", { name: v.name, business_name: v.business_name || null, phone: v.phone || null }); }}>
      <FormMessage message={form.message} ok={form.ok} />
      {form.ok && <p className="text-sm text-emerald-700 dark:text-emerald-300">Profile saved.</p>}
      <div>
        <label htmlFor="p-name" className="label">Name</label>
        <input id="p-name" required maxLength={255} className="input" value={v.name} onChange={set("name")} />
        <FieldError errors={form.errors} name="name" />
      </div>
      <div>
        <label htmlFor="p-business" className="label">Business name</label>
        <input id="p-business" maxLength={255} className="input" value={v.business_name} onChange={set("business_name")} />
        <FieldError errors={form.errors} name="business_name" />
      </div>
      <div>
        <label htmlFor="p-phone" className="label">Phone</label>
        <input id="p-phone" maxLength={20} className="input" value={v.phone} onChange={set("phone")} />
        <FieldError errors={form.errors} name="phone" />
      </div>
      <button className="btn btn-primary" disabled={form.pending}>{form.pending ? "Saving…" : "Save profile"}</button>
    </form>
  );
}

export function WebhookForm({ initial, sandbox = false }: { initial: string | null; sandbox?: boolean }) {
  const form = useApiForm();
  const [url, setUrl] = useState(initial ?? "");
  const path = sandbox ? "/api/settings/sandbox/webhook" : "/api/settings/webhook";
  return (
    <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); await form.submit(path, { webhook_url: url }); }}>
      <FormMessage message={form.message} ok={form.ok} />
      {form.ok && <p className="text-sm text-emerald-700 dark:text-emerald-300">Webhook URL saved.</p>}
      <div>
        <label htmlFor={sandbox ? "w-sandbox" : "w-live"} className="label">{sandbox ? "Sandbox webhook URL" : "Webhook URL"}</label>
        <input id={sandbox ? "w-sandbox" : "w-live"} type="url" maxLength={500} placeholder="https://your-server.example/webhooks/upi"
          className="input font-mono text-[13px]" value={url} onChange={(e) => setUrl(e.target.value)} />
        <p className="help">{sandbox ? "Must differ from your live webhook URL." : "Must be a public https URL. The gateway validates it before saving."}</p>
        <FieldError errors={form.errors} name="webhook_url" />
      </div>
      <button className="btn btn-primary" disabled={form.pending}>{form.pending ? "Saving…" : "Save webhook URL"}</button>
    </form>
  );
}

export function RotationForm({ current }: { current: string }) {
  const form = useApiForm();
  const [mode, setMode] = useState(current === "default" ? "default" : "random");
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={async (e) => { e.preventDefault(); await form.submit("/api/settings/rotation", { rotation_mode: mode }); }}
    >
      <select className="input w-auto" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Rotation mode">
        <option value="random">Random</option>
        <option value="default">Default account</option>
      </select>
      <button className="btn btn-secondary" disabled={form.pending}>{form.pending ? "Saving…" : "Save"}</button>
      {form.ok && <span className="text-xs text-emerald-700 dark:text-emerald-300">Saved.</span>}
      {form.message && <span className="text-xs text-red-700 dark:text-red-400">{form.message}</span>}
    </form>
  );
}

export function RedirectDomainsForm({ initial }: { initial: string[] }) {
  const form = useApiForm();
  const [domains, setDomains] = useState(initial.join("\n"));
  return (
    <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); await form.submit("/api/settings/redirect-domains", { redirect_domains: domains }); }}>
      <FormMessage message={form.message} ok={form.ok} />
      {form.ok && <p className="text-sm text-emerald-700 dark:text-emerald-300">Redirect domains saved.</p>}
      <div>
        <label htmlFor="rd-domains" className="label">Allowed redirect domains</label>
        <textarea id="rd-domains" rows={3} placeholder={"your-store.example\napp.your-store.example"} className="input font-mono text-[13px]" value={domains} onChange={(e) => setDomains(e.target.value)} />
        <p className="help">One host per line (or comma-separated). Schemes are stripped; only hostnames are stored. Customers only return to these domains after paying.</p>
        <FieldError errors={form.errors} name="redirect_domains" />
      </div>
      <button className="btn btn-primary" disabled={form.pending}>{form.pending ? "Saving…" : "Save domains"}</button>
    </form>
  );
}

export function RegenerateKeysButton({ sandbox = false }: { sandbox?: boolean }) {
  const form = useApiForm<{ api_key?: string; api_secret?: string; sandbox_api_key?: string; sandbox_api_secret?: string }>();
  const path = sandbox ? "/api/settings/sandbox/regenerate-keys" : "/api/settings/regenerate-keys";
  const key = form.data?.api_key ?? form.data?.sandbox_api_key;
  const secret = form.data?.api_secret ?? form.data?.sandbox_api_secret;
  return (
    <div className="space-y-3">
      <FormMessage message={form.message} ok={false} />
      {secret && (
        <>
          <OnceSecret label={sandbox ? "Sandbox API secret" : "Live API secret"} value={secret}
            note="Store this secret securely on your server. It is also used to sign webhooks (HMAC-SHA256)." />
          {key && <p className="text-sm text-[var(--muted)]">New {sandbox ? "sandbox" : "live"} API key: <code className="kbd">{key}</code></p>}
        </>
      )}
      <button
        className="btn btn-danger btn-sm" disabled={form.pending}
        onClick={async () => {
          if (!window.confirm("Old keys will stop working immediately. Continue?")) return;
          await form.submit(path, {});
        }}
      >
        {form.pending ? "Regenerating…" : "Regenerate keys"}
      </button>
    </div>
  );
}

export function RevokeSandboxKeysButton() {
  const form = useApiForm();
  return (
    <div className="space-y-3">
      <FormMessage message={form.message} ok={form.ok} />
      {form.ok && <p className="text-sm text-emerald-700 dark:text-emerald-300">Sandbox keys revoked.</p>}
      <button
        className="btn btn-danger btn-sm" disabled={form.pending}
        onClick={async () => {
          if (!window.confirm("Revoke the sandbox keys? Sandbox API access stops immediately.")) return;
          await form.submit("/api/settings/sandbox/revoke-keys", {});
        }}
      >
        {form.pending ? "Revoking…" : "Revoke sandbox keys"}
      </button>
    </div>
  );
}

export function RegenerateWebhookSecretButton({ sandbox = false }: { sandbox?: boolean }) {
  const form = useApiForm<{ webhook_secret?: string; sandbox_webhook_secret?: string }>();
  const path = sandbox ? "/api/settings/sandbox/regenerate-webhook-secret" : "/api/settings/regenerate-webhook-secret";
  const secret = form.data?.webhook_secret ?? form.data?.sandbox_webhook_secret;
  return (
    <div className="space-y-3">
      <FormMessage message={form.message} ok={false} />
      {secret && (
        <OnceSecret label={sandbox ? "Sandbox webhook secret" : "Live webhook secret"} value={secret}
          note="Update your webhook receiver with this secret, or signature verification will fail." />
      )}
      <button
        className="btn btn-danger btn-sm" disabled={form.pending}
        onClick={async () => {
          if (!window.confirm("Regenerate the webhook secret? Your receiver must be updated with the new secret.")) return;
          await form.submit(path, {});
        }}
      >
        {form.pending ? "Regenerating…" : "Regenerate webhook secret"}
      </button>
    </div>
  );
}

export function ChangePasswordForm() {
  const form = useApiForm();
  const [v, setV] = useState({ current_password: "", password: "", password_confirmation: "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); await form.submit("/api/settings/password", v, "PUT"); }}>
      <FormMessage message={form.message} ok={form.ok} />
      {form.ok && <p className="text-sm text-emerald-700 dark:text-emerald-300">Password changed. Other devices have been logged out.</p>}
      <div>
        <label htmlFor="cp-current" className="label">Current password</label>
        <input id="cp-current" type="password" required autoComplete="current-password" className="input" value={v.current_password} onChange={set("current_password")} />
        <FieldError errors={form.errors} name="current_password" />
      </div>
      <div>
        <label htmlFor="cp-new" className="label">New password</label>
        <input id="cp-new" type="password" required autoComplete="new-password" placeholder="Min 10 chars" className="input" value={v.password} onChange={set("password")} />
        <FieldError errors={form.errors} name="password" />
      </div>
      <div>
        <label htmlFor="cp-confirm" className="label">Confirm new password</label>
        <input id="cp-confirm" type="password" required autoComplete="new-password" className="input" value={v.password_confirmation} onChange={set("password_confirmation")} />
        <FieldError errors={form.errors} name="password_confirmation" />
      </div>
      <button className="btn btn-primary" disabled={form.pending}>{form.pending ? "Changing…" : "Change password"}</button>
    </form>
  );
}

// Auth forms (client) — ported copy from auth/login.blade.php,
// auth/register.blade.php, auth/confirm-password.blade.php.
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FieldError, FormMessage, useApiForm } from "./forms";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";
  const form = useApiForm<{ user: { role: string } }>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await form.submit("/api/auth/login", { email, password });
        if (res.ok) router.push(next.startsWith("/") ? next : "/dashboard");
      }}
      className="space-y-5"
    >
      <FormMessage message={form.message} ok={false} />
      <div>
        <label htmlFor="f-email" className="label">Email</label>
        <input id="f-email" type="email" required autoFocus autoComplete="email" placeholder="you@business.com"
          className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        <FieldError errors={form.errors} name="email" />
      </div>
      <div>
        <label htmlFor="f-password" className="label">Password</label>
        <input id="f-password" type="password" required autoComplete="current-password" placeholder="••••••••"
          className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        <FieldError errors={form.errors} name="password" />
      </div>
      <button className="btn btn-primary w-full py-2.5" disabled={form.pending}>
        {form.pending ? "Logging in…" : "Log in →"}
      </button>
    </form>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const form = useApiForm();
  const [v, setV] = useState({ name: "", business_name: "", email: "", phone: "", password: "", password_confirmation: "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await form.submit("/api/auth/register", v);
        if (res.ok) router.push("/accounts/new");
      }}
      className="space-y-4"
    >
      <FormMessage message={form.message} ok={false} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="r-name" className="label">Your name</label>
          <input id="r-name" required autoFocus autoComplete="name" className="input" value={v.name} onChange={set("name")} />
          <FieldError errors={form.errors} name="name" />
        </div>
        <div>
          <label htmlFor="r-business" className="label">Business name</label>
          <input id="r-business" autoComplete="organization" className="input" value={v.business_name} onChange={set("business_name")} />
          <FieldError errors={form.errors} name="business_name" />
        </div>
      </div>
      <div>
        <label htmlFor="r-email" className="label">Work email</label>
        <input id="r-email" type="email" required autoComplete="email" placeholder="you@business.com" className="input" value={v.email} onChange={set("email")} />
        <FieldError errors={form.errors} name="email" />
      </div>
      <div>
        <label htmlFor="r-phone" className="label">Mobile number</label>
        <input id="r-phone" autoComplete="tel" placeholder="Optional" className="input" value={v.phone} onChange={set("phone")} />
        <FieldError errors={form.errors} name="phone" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="r-password" className="label">Password</label>
          <input id="r-password" type="password" required autoComplete="new-password" placeholder="Min 10 chars" className="input" value={v.password} onChange={set("password")} />
          <FieldError errors={form.errors} name="password" />
        </div>
        <div>
          <label htmlFor="r-confirm" className="label">Confirm</label>
          <input id="r-confirm" type="password" required autoComplete="new-password" className="input" value={v.password_confirmation} onChange={set("password_confirmation")} />
          <FieldError errors={form.errors} name="password_confirmation" />
        </div>
      </div>
      <button className="btn btn-primary w-full py-2.5" disabled={form.pending}>
        {form.pending ? "Creating account…" : "Create account →"}
      </button>
      <p className="text-center text-xs text-slate-500">Payments go directly to your UPI account. We never hold your funds.</p>
    </form>
  );
}

export function ConfirmPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/admin";
  const form = useApiForm();
  const [password, setPassword] = useState("");

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await form.submit("/api/auth/confirm-password", { password });
        if (res.ok) router.push(next.startsWith("/") ? next : "/admin");
      }}
      className="space-y-5"
    >
      <FormMessage message={form.message} ok={false} />
      <div>
        <label htmlFor="c-password" className="label">Your password</label>
        <input id="c-password" type="password" required autoFocus autoComplete="current-password" placeholder="••••••••"
          className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        <FieldError errors={form.errors} name="password" />
      </div>
      <button className="btn btn-primary w-full py-2.5" disabled={form.pending}>
        {form.pending ? "Confirming…" : "Confirm →"}
      </button>
    </form>
  );
}

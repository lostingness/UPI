// Auth forms (client) — ported copy from auth/login.blade.php,
// auth/register.blade.php, auth/confirm-password.blade.php.
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { FieldError, FormMessage, useApiForm } from "./forms";
import { unlockAudio } from "@/lib/sounds";
import { playLoginSuccessMp3, unlockMp3Audio } from "@/lib/mp3-sounds";

/** Password input with a show/hide toggle (Round 7). The toggle is a
 * real button (never submits the form), announces its state, and keeps
 * the input's autocomplete/value wiring untouched. */
function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  autoFocus = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  autoComplete: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          required
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className="input pr-11"
          value={value}
          onChange={onChange}
        />
        <button
          type="button"
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          onClick={() => setShow((v) => !v)}
          className="absolute inset-y-0 right-0 grid w-11 touch-manipulation place-items-center text-[var(--muted)] transition-colors duration-150 hover:text-[var(--text)]"
        >
          {show ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

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
        // Round 7: the submit click IS a user gesture — unlock audio here
        // so the login-success sound below (after the round-trip) can play.
        unlockAudio();
        unlockMp3Audio();
        const res = await form.submit("/api/auth/login", { email, password });
        // Round 7: MP3 login-success sound only when the login succeeded
        // (falls back to the synth chime). Register/confirm forms: no sound.
        if (res.ok) { playLoginSuccessMp3(); router.push(next.startsWith("/") ? next : "/dashboard"); }
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
        <PasswordField id="f-password" label="Password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password" placeholder="••••••••" />
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
          <PasswordField id="r-password" label="Password" value={v.password}
            onChange={set("password")} autoComplete="new-password" placeholder="Min 10 chars" />
          <FieldError errors={form.errors} name="password" />
        </div>
        <div>
          <PasswordField id="r-confirm" label="Confirm" value={v.password_confirmation}
            onChange={set("password_confirmation")} autoComplete="new-password" />
          <FieldError errors={form.errors} name="password_confirmation" />
        </div>
      </div>
      <button className="btn btn-primary w-full py-2.5" disabled={form.pending}>
        {form.pending ? "Creating account…" : "Create account →"}
      </button>
      <p className="text-center text-xs text-[var(--muted)]">Payments go directly to your UPI account. We never hold your funds.</p>
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
        <PasswordField id="c-password" label="Your password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password" placeholder="••••••••" autoFocus />
        <FieldError errors={form.errors} name="password" />
      </div>
      <button className="btn btn-primary w-full py-2.5" disabled={form.pending}>
        {form.pending ? "Confirming…" : "Confirm →"}
      </button>
    </form>
  );
}

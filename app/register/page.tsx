import Link from "next/link";
import { GuestShell } from "@/components/layout";
import { RegisterForm } from "@/components/auth-forms";
import { allowRegistration, dbConfigured } from "@/components/server-data";
import { DbNotConfigured } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  const db = dbConfigured();
  const allowed = allowRegistration();
  if (!db) {
    return (
      <GuestShell title="Create your account" subtitle="Start accepting UPI payments in minutes. Free, no setup fee.">
        <DbNotConfigured context="Registration needs the database." />
      </GuestShell>
    );
  }
  if (!allowed) {
    return (
      <GuestShell title="Create your account" subtitle="Start accepting UPI payments in minutes. Free, no setup fee.">
        <div className="rounded-lg bg-amber-500/10 px-4 py-4 text-sm text-amber-300 ring-1 ring-amber-500/30">
          <p className="font-medium">Registration is disabled</p>
          <p className="mt-1 text-amber-200/80">
            New merchant signups are closed on this gateway (ALLOW_REGISTRATION is false).
            Ask an administrator to create your account, or log in if you already have one.
          </p>
        </div>
        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand-400 hover:text-brand-300">Log in</Link>
        </p>
      </GuestShell>
    );
  }
  return (
    <GuestShell title="Create your account" subtitle="Start accepting UPI payments in minutes. Free, no setup fee.">
      <RegisterForm />
      <p className="mt-8 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand-400 hover:text-brand-300">Log in</Link>
      </p>
    </GuestShell>
  );
}

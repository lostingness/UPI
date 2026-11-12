import Link from "next/link";
import { GuestShell } from "@/components/layout";
import { RegisterForm } from "@/components/auth-forms";
import { AuthIllustration } from "@/components/auth-illustration";
import { allowRegistration, dbConfigured } from "@/components/server-data";
import { DbNotConfigured } from "@/components/ui";

export const dynamic = "force-dynamic";

// Round 8: the illustration panel (same on every branch — the layout
// stays consistent whether the form, the DB notice or the disabled
// notice is showing). Panel copy is the landing's own statement.
const ILLUSTRATION = <AuthIllustration className="h-auto w-full" />;
const PANEL_TITLE = "Money lands in your own bank.";
const PANEL_BODY =
  "No wallet in between, no cut taken. Payments go straight to your UPI ID or PG account — the gateway only verifies and notifies.";

export default function RegisterPage() {
  const db = dbConfigured();
  const allowed = allowRegistration();
  if (!db) {
    return (
      <GuestShell
        title="Create your account"
        subtitle="Start accepting UPI payments in minutes. Free, no setup fee."
        illustration={ILLUSTRATION}
        panelTitle={PANEL_TITLE}
        panelBody={PANEL_BODY}
      >
        <DbNotConfigured context="Registration needs the database." />
      </GuestShell>
    );
  }
  if (!allowed) {
    return (
      <GuestShell
        title="Create your account"
        subtitle="Start accepting UPI payments in minutes. Free, no setup fee."
        illustration={ILLUSTRATION}
        panelTitle={PANEL_TITLE}
        panelBody={PANEL_BODY}
      >
        <div className="rounded-lg bg-amber-500/10 px-4 py-4 text-sm text-[var(--text)] ring-1 ring-amber-500/30">
          <p className="font-medium">Registration is disabled</p>
          <p className="mt-1 text-[var(--muted)]">
            New merchant signups are closed on this gateway (ALLOW_REGISTRATION is false).
            Ask an administrator to create your account, or log in if you already have one.
          </p>
        </div>
        <p className="mt-6 text-center text-sm text-[var(--faint)]">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-[var(--accent-text)] hover:opacity-80">Log in</Link>
        </p>
      </GuestShell>
    );
  }
  return (
    <GuestShell
      title="Create your account"
      subtitle="Start accepting UPI payments in minutes. Free, no setup fee."
      illustration={ILLUSTRATION}
      panelTitle={PANEL_TITLE}
      panelBody={PANEL_BODY}
    >
      <RegisterForm />
      <p className="mt-4 text-center text-xs leading-relaxed text-[var(--faint)]">
        You sign up as a merchant. The first admin account is created separately at{" "}
        <Link href="/setup" className="font-medium text-[var(--accent-text)] hover:opacity-80">/setup</Link>
        {" "}— this form never creates an admin.
      </p>
      <p className="mt-6 text-center text-sm text-[var(--faint)]">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-[var(--accent-text)] hover:opacity-80">Log in</Link>
      </p>
    </GuestShell>
  );
}

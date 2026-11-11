// Admin guard + shared "confirm password" prompt for admin pages.
import Link from "next/link";
import { AppShell } from "@/components/layout";
import { DbNotConfigured } from "@/components/ui";
import { dbConfigured, requireAdminPage, type SessionUser } from "@/components/server-data";

export async function AdminShell({ active, title, subtitle, next, children }: {
  active: string; title: string; subtitle?: string; next: string; children: (admin: SessionUser) => React.ReactNode;
}) {
  if (!dbConfigured()) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-lg"><DbNotConfigured context="Admin pages need the database." /></div>
      </main>
    );
  }
  const admin = await requireAdminPage();
  if (!admin) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="card w-full max-w-md p-8 text-center">
          <h1 className="text-xl font-medium text-[var(--text)]">Password confirmation required</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Admin pages need your password re-confirmed within the last 15 minutes. Confirm it to continue.
          </p>
          <Link href={`/confirm-password?next=${encodeURIComponent(next)}`} className="btn btn-accent mt-6 w-full">Confirm password →</Link>
          <p className="mt-4 text-xs text-[var(--muted)]"><Link href="/dashboard" className="font-medium text-[var(--accent-text)]">Back to dashboard</Link></p>
        </div>
      </div>
    );
  }
  return (
    <AppShell user={admin} active={active} title={title} subtitle={subtitle}>
      {children(admin)}
    </AppShell>
  );
}

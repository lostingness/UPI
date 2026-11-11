import { AppShell } from "@/components/layout";
import { ChangePasswordForm } from "@/components/settings-forms";
import { DbNotConfigured } from "@/components/ui";
import { dbConfigured, getSessionSafe, requireUser } from "@/components/server-data";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const session = await getSessionSafe();
  const user = requireUser(session, "/settings/password");
  if (!dbConfigured()) {
    return (
      <AppShell user={user} active="/settings" title="Change password" subtitle="Choose a new password (minimum 10 characters).">
        <DbNotConfigured context="Changing your password needs the database." />
      </AppShell>
    );
  }
  return (
    <AppShell user={user} active="/settings" title="Change password" subtitle="Choose a new password (minimum 10 characters).">
      <div className="card max-w-xl p-6">
        <ChangePasswordForm />
      </div>
      <p className="mt-4 max-w-xl text-xs leading-relaxed text-slate-500">
        Changing your password logs out all other devices. Your current session is regenerated, so you stay logged in here.
      </p>
    </AppShell>
  );
}

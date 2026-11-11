// Settings — port of settings.blade.php ("API & Webhooks").
// Sections: API credentials, Sandbox credentials, Webhook, Sandbox webhook,
// Business profile, rotation + redirect domains. Each section saves via its
// own API route and shows success/error.
import Link from "next/link";
import { AppShell } from "@/components/layout";
import { CopyButton } from "@/components/forms";
import {
  ProfileForm, RedirectDomainsForm, RegenerateKeysButton, RegenerateWebhookSecretButton,
  RevokeSandboxKeysButton, RotationForm, WebhookForm,
} from "@/components/settings-forms";
import { DbNotConfigured } from "@/components/ui";
import { dbConfigured, getMerchantSettings, getSessionSafe, requireUser } from "@/components/server-data";

export const dynamic = "force-dynamic";

function Section({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-6 border-t border-slate-800 pt-10 first:border-t-0 first:pt-0 lg:grid-cols-3">
      <div>
        <h2 className="text-base font-semibold text-slate-100">{title}</h2>
        <p className="mt-1 text-sm text-slate-400">{intro}</p>
      </div>
      <div className="card p-6 space-y-5 lg:col-span-2">{children}</div>
    </section>
  );
}

export default async function SettingsPage() {
  const session = await getSessionSafe();
  const user = requireUser(session, "/settings");
  if (!dbConfigured()) {
    return (
      <AppShell user={user} active="/settings" title="API & Webhooks" subtitle="Connect your website or app to accept payments automatically.">
        <DbNotConfigured context="Settings need the database." />
      </AppShell>
    );
  }
  const s = await getMerchantSettings(user.id);
  if (!s) {
    return (
      <AppShell user={user} active="/settings" title="API & Webhooks" subtitle="Connect your website or app to accept payments automatically.">
        <DbNotConfigured context="Could not load your settings." />
      </AppShell>
    );
  }
  return (
    <AppShell
      user={user} active="/settings" title="API & Webhooks"
      subtitle="Connect your website or app to accept payments automatically."
      actions={<Link href="/docs" className="btn btn-secondary">Read API docs</Link>}
    >
      <div className="space-y-10">
        <Section title="API credentials" intro="Send these as X-Api-Key and X-Api-Secret headers. Keep the secret on your server only.">
          <div>
            <label className="label">API key</label>
            <div className="flex gap-2">
              <input readOnly value={s.apiKey ?? "—"} className="input font-mono" />
              {s.apiKey && <CopyButton text={s.apiKey} />}
            </div>
          </div>
          <div>
            <label className="label">API secret</label>
            <input type="text" readOnly value="••••••••••••••••••••••••••••••••••••••••" disabled className="input font-mono text-slate-500" />
            <p className="help">Hidden for security. If you lost your secret, click “Regenerate” below to issue a new pair.</p>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg bg-red-500/10 px-4 py-3 ring-1 ring-red-500/20">
            <div className="text-sm text-red-300"><b>Regenerate keys</b><div className="text-xs text-red-300/70">Old keys stop working immediately.</div></div>
            <RegenerateKeysButton />
          </div>
        </Section>

        <Section title="Sandbox credentials" intro="Create simulated payments without contacting Paytm, PhonePe, banks, or UPI providers.">
          {s.sandboxApiKey ? (
            <>
              <div>
                <label className="label">Sandbox API key</label>
                <div className="flex gap-2">
                  <input readOnly value={s.sandboxApiKey} className="input font-mono" />
                  <CopyButton text={s.sandboxApiKey} />
                </div>
              </div>
              <p className="text-sm text-slate-400">The Sandbox secret is stored encrypted and cannot be displayed again. Regenerate it if lost.</p>
              <div className="flex flex-wrap items-center gap-3">
                <RegenerateKeysButton sandbox />
                <RevokeSandboxKeysButton />
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-400">No sandbox keys yet. Generate a pair to test without real money.</p>
              <RegenerateKeysButton sandbox />
            </>
          )}
        </Section>

        <Section title="Webhook" intro="Live order events are delivered here as signed JSON.">
          <WebhookForm initial={s.webhookUrl} />
          <div>
            <label className="label">Webhook secret</label>
            <input type="text" readOnly value="whsec_••••••••••••••••••••••••" disabled className="input font-mono text-slate-500" />
            <p className="help">Used to sign every webhook (HMAC-SHA256, t=…,v1=…). Regenerate it if it leaks.</p>
          </div>
          <RegenerateWebhookSecretButton />
        </Section>

        <Section title="Sandbox webhook" intro="Test events go here. Must differ from the live webhook URL.">
          <WebhookForm initial={s.sandboxWebhookUrl} sandbox />
          <RegenerateWebhookSecretButton sandbox />
        </Section>

        <Section title="Business profile" intro="Shown on checkout pages and receipts.">
          <ProfileForm initial={{ name: s.name, businessName: s.businessName, phone: s.phone }} />
        </Section>

        <Section title="Rotation & redirect domains" intro="How accounts are picked, and where customers may return after paying.">
          <div>
            <label className="label">Rotation mode</label>
            <RotationForm current={s.rotationMode} />
            <p className="help">Random picks any active account with room today; Default always uses your default account.</p>
          </div>
          <RedirectDomainsForm initial={s.redirectDomains} />
        </Section>

        <Section title="Security" intro="Change your password, or re-confirm it for admin pages.">
          <p className="text-sm text-slate-400">
            Changing your password logs out all other devices (the session embeds a prefix of your password hash).
            Admin pages additionally ask you to re-confirm your password every 15 minutes.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/settings/password" className="btn btn-secondary">Change password</Link>
            <Link href="/confirm-password" className="btn btn-secondary">Re-confirm password</Link>
          </div>
        </Section>
      </div>
    </AppShell>
  );
}

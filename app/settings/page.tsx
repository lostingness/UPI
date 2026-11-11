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
import { QrSettings } from "@/components/qr-settings";
import { dbConfigured, getMerchantSettings, getSessionSafe, requireUser } from "@/components/server-data";

export const dynamic = "force-dynamic";

function Section({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-6 border-t border-[var(--border)] pt-10 first:border-t-0 first:pt-0 lg:grid-cols-3">
      <div>
        <h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{intro}</p>
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
            <input type="text" readOnly value="••••••••••••••••••••••••••••••••••••••••" disabled className="input font-mono text-[var(--muted)]" />
            <p className="help">Hidden for security. If you lost your secret, click “Regenerate” below to issue a new pair.</p>
          </div>
          {/* Round 6: the red "Regenerate keys" banner lives inside
              RegenerateKeysButton now — it used to wrap the whole component
              here, and the revealed secret overflowed the banner's flex row
              and covered the label on phones. */}
          <RegenerateKeysButton />
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
              <p className="text-sm text-[var(--muted)]">The Sandbox secret is stored encrypted and cannot be displayed again. Regenerate it if lost.</p>
              <div className="flex flex-wrap items-center gap-3">
                <RegenerateKeysButton sandbox />
                <RevokeSandboxKeysButton />
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--muted)]">No sandbox keys yet. Generate a pair to test without real money.</p>
              <RegenerateKeysButton sandbox />
            </>
          )}
        </Section>

        <Section title="Webhook" intro="Live order events are delivered here as signed JSON.">
          <WebhookForm initial={s.webhookUrl} />
          <div>
            <label className="label">Webhook secret</label>
            <input type="text" readOnly value="whsec_••••••••••••••••••••••••" disabled className="input font-mono text-[var(--muted)]" />
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

        <Section title="QR settings" intro="How QR codes are generated for new orders — unique amount per order, or one shared QR for a fixed amount.">
          <QrSettings />
        </Section>

        <Section title="Security" intro="Change your password, or re-confirm it for admin pages.">
          <p className="text-sm text-[var(--muted)]">
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

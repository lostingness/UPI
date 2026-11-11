// Public API docs — port of docs.blade.php (583 lines). Content ported
// verbatim where it matters: field tables, webhook signature rules and the
// 31 Mar 2027 migration deadline, error codes, PHP + Node examples.
import Link from "next/link";
import { PublicNav, SiteFooter } from "@/components/layout";
import { CopyButton } from "@/components/forms";
import { getSessionSafe } from "@/components/server-data";

export const dynamic = "force-dynamic";

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  return (
    <div className="relative">
      <div className="absolute right-3 top-3"><CopyButton text={code} /></div>
      <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-[13px] leading-relaxed text-slate-200 ring-1 ring-white/10">
        <code>{code}</code>
      </pre>
      <span className="sr-only">{lang}</span>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-white/10 pt-10 first:border-t-0 first:pt-0">
      <h2 className="text-2xl font-medium tracking-tight text-slate-50">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-slate-400">{children}</div>
    </section>
  );
}

export default async function DocsPage() {
  const user = await getSessionSafe();
  return (
    <div className="flex min-h-screen flex-col">
      <PublicNav user={user} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:py-14">
        <p className="text-sm font-medium text-brand-400">API documentation</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight text-slate-50 sm:text-4xl">UPI Gateway API</h1>
        <p className="mt-3 max-w-2xl text-base text-slate-400">
          Accept UPI payments from your website or app with one API call. Create an order, send your customer to the
          hosted checkout page, and get a signed webhook when the payment lands.
        </p>
        <nav className="mt-8 flex flex-wrap gap-2 text-sm">
          {["Authentication", "Create an order", "Check an order", "Payment accounts", "Rotation & limits", "Webhooks", "Errors", "Examples"].map((s) => (
            <a key={s} href={`#${s.toLowerCase().replace(/[^a-z]+/g, "-")}`} className="rounded-lg bg-slate-900 px-3 py-1.5 text-slate-300 ring-1 ring-white/10 hover:bg-slate-800">{s}</a>
          ))}
        </nav>

        <div className="mt-10 space-y-12">
          <Section id="authentication" title="Authentication">
            <p>
              Every API request sends two headers: <code className="kbd">X-Api-Key</code> and <code className="kbd">X-Api-Secret</code>.
              Find them in <Link href="/settings" className="font-medium text-brand-400">Settings → API credentials</Link>. Keep the secret on your server only — never ship it in a browser or mobile app.
            </p>
            <p>
              <strong className="text-slate-200">Live vs Sandbox.</strong> Live keys start with <code className="kbd">key_</code>, sandbox keys with <code className="kbd">test_key_</code>.
              Sandbox orders are <code className="kbd">TST…</code> numbers, never touch a provider, and can be simulated to any outcome from the sandbox checkout page.
            </p>
            <CodeBlock lang="http" code={`X-Api-Key: key_xxxxxxxxxxxxxxxx\nX-Api-Secret: sec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`} />
          </Section>

          <Section id="create-an-order" title="Create an order">
            <p><code className="kbd">POST /api/v1/orders</code> — creates a payment order and returns the checkout URL. Idempotent: send an <code className="kbd">Idempotency-Key</code> header to safely retry.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead><tr className="border-b border-white/10"><th className="th">Field</th><th className="th">Type</th><th className="th">Description</th></tr></thead>
                <tbody className="divide-y divide-white/5">
                  {[
                    ["amount", "number · 1–100,000", "Required. Amount in INR (up to 2 decimals)."],
                    ["client_order_id", "string · ≤64, [A-Za-z0-9_-]", "Required. Your unique order reference (unique per merchant + environment)."],
                    ["payment_account_id", "number", "Optional. Pay into this account; otherwise rotation picks one. Prohibited in sandbox."],
                    ["customer_name", "string · ≤100", "Optional."],
                    ["customer_email", "string · ≤255", "Optional."],
                    ["customer_mobile", "string · ≤20", "Optional."],
                    ["note", "string · ≤50", "Optional. Shown on the checkout page and in the UPI intent."],
                    ["redirect_url", "https URL · ≤500", "Optional. Where the customer returns after paying. The domain must be allowlisted in Settings first."],
                  ].map(([f, t, d]) => (
                    <tr key={f}><td className="td font-mono text-[13px] text-slate-200">{f}</td><td className="td text-slate-400">{t}</td><td className="td text-slate-400">{d}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>Response — <code className="kbd">201</code> <code className="kbd">{`{success: true, data: …}`}</code>:</p>
            <CodeBlock lang="json" code={JSON.stringify({
              success: true,
              data: {
                order_id: "ORD20261111A1B2C3", client_order_id: "INV-1001", amount: "499.00", currency: "INR",
                status: "pending", verified_by: null, environment: "live", test: false, utr: null,
                payment_url: "https://your-gateway.example/pay/ORD20261111A1B2C3",
                upi_intent: "upi://pay?pa=merchant@okhdfcbank&pn=Your%20Store&am=499.00&cu=INR&tn=INV-1001",
                customer: { name: "Asha", email: null, mobile: null },
                paid_at: null, expires_at: "2026-11-11T07:00:00.000Z", original_expires_at: "2026-11-11T07:00:00.000Z",
                created_at: "2026-11-11T06:45:00.000Z",
              },
            }, null, 2)} />
          </Section>

          <Section id="check-an-order" title="Check an order">
            <p><code className="kbd">GET /api/v1/orders/{`{order_id}`}</code> — accepts an <code className="kbd">order_no</code> (ORD… / TST…) or your <code className="kbd">client_order_id</code>. Before responding, the gateway re-checks the provider, so the status you get is fresh.</p>
            <p>Status values: <code className="kbd">pending</code>, <code className="kbd">paid</code>, <code className="kbd">review</code> (UTR submitted, awaiting merchant approval), <code className="kbd">expired</code>, <code className="kbd">failed</code>.</p>
            <p>
              A payment is only ever marked <code className="kbd">paid</code> when the provider confirms the exact amount, order ID, currency
              and a fresh timestamp — or when a merchant approves a submitted UTR, or an admin performs an audited manual override.
              A UTR alone never marks an order paid.
            </p>
          </Section>

          <Section id="payment-accounts" title="Payment accounts">
            <p><code className="kbd">GET /api/v1/accounts</code> — your live UPI accounts with <code className="kbd">used_today</code> / <code className="kbd">remaining_today</code> against each daily limit. Sandbox credentials return <code className="kbd">{`{environment: "sandbox", rotation_mode: null, data: []}`}</code>.</p>
            <p>Account types: <strong className="text-slate-200">Manual UPI</strong> (personal UPI ID, UTR review), <strong className="text-slate-200">Paytm for Business</strong> (unofficial status API), <strong className="text-slate-200">PhonePe PG v2</strong> and <strong className="text-slate-200">Paytm PG</strong> (hosted checkout). Manage them in <Link href="/accounts" className="font-medium text-brand-400">Payment accounts</Link>.</p>
          </Section>

          <Section id="rotation-limits" title="Rotation & daily limits">
            <p>When you create an order without a <code className="kbd">payment_account_id</code>, the gateway picks an account by your rotation mode: <code className="kbd">random</code> (default) or <code className="kbd">default</code> (always your default account). Accounts that hit their daily limit, are disabled, or (for Paytm Business) are not configured are skipped — never silently fallen back to an account you did not choose.</p>
          </Section>

          <Section id="webhooks" title="Webhooks">
            <p>Every paid, expired, under-review, failed, pending and timeout transition is delivered to your webhook URL as a signed JSON event:</p>
            <CodeBlock lang="json" code={JSON.stringify({
              event_id: "evt_01J…", event_sequence: 3, occurred_at: "2026-11-11T06:50:12.000Z",
              event: "order.paid",
              data: { order_id: "ORD20261111A1B2C3", amount: "499.00", currency: "INR", status: "paid" },
            }, null, 2)} />
            <p>
              <strong className="text-slate-200">Signature verification (HMAC-SHA256).</strong> Each delivery carries a header like{" "}
              <code className="kbd">t=1731300612,v1=…</code> where <code className="kbd">v1</code> is{" "}
              <code className="kbd">HMAC-SHA256(webhook_secret, t + &quot;.&quot; + raw_body)</code>. Accept only timestamps within 5 minutes of now,
              compare in constant time, and dedupe on <code className="kbd">event_id</code> (the <code className="kbd">event_sequence</code> is per-order and strictly increasing).
            </p>
            <div className="rounded-lg bg-amber-500/10 px-4 py-3 text-amber-200 ring-1 ring-amber-500/30">
              <strong>Migration deadline: 31 March 2027.</strong> Timestamped signatures (<code className="kbd">t=…,v1=…</code>) are the only supported scheme after this date.
              The legacy <code className="kbd">X-Signature-Legacy</code> header is retired — verify the timestamped signature now.
            </div>
            <p>Events: <code className="kbd">order.paid</code>, <code className="kbd">order.expired</code>, <code className="kbd">order.under_review</code>, <code className="kbd">order.failed</code>, <code className="kbd">order.pending</code>, <code className="kbd">order.timeout</code>.</p>
          </Section>

          <Section id="errors" title="Errors">
            <p>Errors are JSON: <code className="kbd">{`{message, errors?}`}</code>. Validation failures (422) include an <code className="kbd">errors</code> map. Every response carries an <code className="kbd">X-Request-Id</code> header — include it when reporting a problem.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead><tr className="border-b border-white/10"><th className="th">Code</th><th className="th">Meaning</th></tr></thead>
                <tbody className="divide-y divide-white/5">
                  {[
                    ["401", "Invalid API key / secret."],
                    ["403", "Merchant account is disabled."],
                    ["404", "Order or account not found (also used when a resource belongs to another merchant)."],
                    ["422", "Validation failed — see errors."],
                    ["429", "Rate limited — respect Retry-After and X-RateLimit-* headers."],
                    ["500", "Server error — retry with the same Idempotency-Key."],
                  ].map(([c, d]) => (
                    <tr key={c}><td className="td font-mono text-slate-200">{c}</td><td className="td text-slate-400">{d}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="examples" title="Examples">
            <p>PHP — create an order with cURL:</p>
            <CodeBlock lang="php" code={`<?php
$ch = curl_init('https://your-gateway.example/api/v1/orders');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'X-Api-Key: key_xxxxxxxxxxxxxxxx',
        'X-Api-Secret: sec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        'Idempotency-Key: ' . uniqid('ord_', true),
    ],
    CURLOPT_POSTFIELDS => json_encode([
        'amount' => 499.00,
        'client_order_id' => 'INV-1001',
        'customer_name' => 'Asha',
        'redirect_url' => 'https://your-store.example/thank-you',
    ]),
]);
$res = json_decode(curl_exec($ch), true);
$payUrl = $res['data']['payment_url']; // send the customer here
`} />
            <p>Node — create an order with fetch:</p>
            <CodeBlock lang="js" code={`const res = await fetch('https://your-gateway.example/api/v1/orders', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': process.env.UPI_API_KEY,
    'X-Api-Secret': process.env.UPI_API_SECRET,
    'Idempotency-Key': crypto.randomUUID(),
  },
  body: JSON.stringify({
    amount: 499.00,
    client_order_id: 'INV-1001',
    customer_name: 'Asha',
    redirect_url: 'https://your-store.example/thank-you',
  }),
});
const { data } = await res.json();
// data.payment_url — send the customer here
// data.upi_intent — deep-link straight into a UPI app
`} />
          </Section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

// Landing page — port of welcome.blade.php ("Accept UPI payments directly in
// your bank account"). Keeps the backend's health/setup status visible.
import Link from "next/link";
import { PublicNav, SiteFooter } from "@/components/layout";
import { getInstallState, getSessionSafe } from "@/components/server-data";

export const dynamic = "force-dynamic";

const FEATURES: [string, string][] = [
  ["Direct to your bank", "Payments go straight to your own UPI ID or PG account. The gateway never holds your funds."],
  ["Provider-verified, never trust the browser", "An order is marked paid only on an exact amount + order-ID + currency + timestamp-bound provider response — never on a UTR alone."],
  ["Manual UPI with UTR review", "Accept payments on a personal UPI ID. Customers submit their 12-digit UTR and you approve it against your bank statement."],
  ["Hosted PG checkout", "PhonePe PG v2 and Paytm PG with a secure hosted checkout, plus Paytm for Business status checks."],
  ["Signed webhooks", "Every paid, expired, under-review and failed transition is delivered as an HMAC-SHA256 timestamped webhook with exactly-once-ish sequencing."],
  ["Sandbox first", "Test keys, TST… orders and a payment simulator with six outcomes — no real money, no provider calls."],
];

const STEPS: [string, string][] = [
  ["Create an account", "Sign up as a merchant and log in to your dashboard."],
  ["Add a payment account", "Connect your UPI ID, Paytm for Business, PhonePe PG or Paytm PG."],
  ["Create a payment link", "From the dashboard or with one API call — POST /api/v1/orders."],
  ["Get paid", "Share the link or QR. Your customer pays, you get the money directly."],
];

const FAQS: [string, string][] = [
  ["Does the gateway hold my money?", "No. Payments go directly to your own UPI or PG account. UPI Gateway only verifies and notifies."],
  ["How is a payment confirmed?", "Only a provider status response with the exact amount, order ID, currency and a fresh timestamp marks an order paid. A customer-submitted UTR goes to review until you approve it."],
  ["Can I test without real money?", "Yes — sandbox credentials (test_key_…) create TST… orders you can simulate as success, failure, pending, expiry, timeout or invalid reference."],
  ["Which payment methods are supported?", "Any UPI app (GPay, PhonePe, Paytm, BHIM) via QR or deep link, plus hosted PhonePe and Paytm PG checkout with UPI, card and netbanking."],
  ["What do webhooks look like?", "JSON events (order.paid, order.expired, order.under_review, order.failed, order.pending, order.timeout) signed HMAC-SHA256 as t=…,v1=… with a 5-minute tolerance."],
];

export default async function Home() {
  const [user, state] = await Promise.all([getSessionSafe(), getInstallState()]);
  return (
    <div className="flex min-h-screen flex-col">
      <PublicNav user={user} />
      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 text-center sm:pt-24">
          <span className="inline-flex rounded-full bg-brand-600/15 px-3 py-1 text-xs font-bold tracking-wide text-brand-300 ring-1 ring-brand-500/30">
            SELF-HOSTED · MULTI-MERCHANT · UPI
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-slate-50 sm:text-6xl">
            Accept UPI payments directly in your bank account
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-slate-400 sm:text-lg">
            UPI Gateway is a self-hosted payment gateway for Indian merchants. Create a payment link or call one API —
            your customer pays by UPI QR or deep link, and the money lands straight in your account.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {state.installed ? (
              <Link href="/login" className="btn btn-primary btn-lg">Log in to your dashboard →</Link>
            ) : (
              <Link href="/setup" className="btn btn-primary btn-lg">Set up UPI Gateway →</Link>
            )}
            <Link href="/docs" className="btn btn-secondary btn-lg">Read the API docs</Link>
          </div>
          <div className="mx-auto mt-10 flex max-w-2xl flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-slate-900 px-3 py-1.5 ring-1 ring-slate-800">✓ No aggregator fees</span>
            <span className="rounded-full bg-slate-900 px-3 py-1.5 ring-1 ring-slate-800">✓ Provider-verified payments</span>
            <span className="rounded-full bg-slate-900 px-3 py-1.5 ring-1 ring-slate-800">✓ Sandbox included</span>
            <span className="rounded-full bg-slate-900 px-3 py-1.5 ring-1 ring-slate-800">✓ MIT licensed</span>
          </div>
          {/* Health / setup status (backend status page, kept) */}
          <div className="mx-auto mt-10 max-w-xl rounded-xl bg-slate-900 px-5 py-4 text-left text-sm ring-1 ring-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-400">System status</span>
              <a href="/api/health" className="font-mono text-xs text-brand-400 hover:text-brand-300">/api/health</a>
            </div>
            <dl className="mt-3 space-y-1.5 text-slate-300">
              <div className="flex justify-between"><dt>Database configured</dt><dd className="font-semibold">{state.databaseConfigured ? "Yes" : "No"}</dd></div>
              <div className="flex justify-between"><dt>Installed</dt><dd className="font-semibold">{state.installed ? "Yes — first admin created" : "Not yet"}</dd></div>
            </dl>
            {!state.databaseConfigured && (
              <p className="mt-3 text-xs leading-relaxed text-amber-300">
                Database not configured — set the Neon pooled <code className="kbd">DATABASE_URL</code> and run migrations, then finish <Link href="/setup" className="underline">Setup</Link>.
              </p>
            )}
            {!state.installed && state.databaseConfigured && (
              <p className="mt-3 text-xs text-slate-400">
                Database is reachable but no admin exists yet — <Link href="/setup" className="font-semibold text-brand-400">create the first admin →</Link>
              </p>
            )}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-y border-slate-800/80 bg-slate-900/40 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <p className="text-sm font-semibold text-brand-400">FEATURES</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">Everything a merchant needs, nothing held back</h2>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(([title, body]) => (
                <div key={title} className="card p-5">
                  <h3 className="text-base font-semibold text-slate-100">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Gateway vs aggregator */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <h2 className="text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">Gateway, not aggregator</h2>
          <p className="mt-3 max-w-2xl text-sm text-slate-400 sm:text-base">
            Aggregators pool your money and settle later. UPI Gateway routes every payment straight to your own account.
          </p>
          <div className="card mt-8 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="th"> </th>
                  <th className="th text-brand-300">UPI Gateway</th>
                  <th className="th">Typical aggregator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {[
                  ["Where the money goes", "Directly to your bank account", "Aggregator wallet, settled later"],
                  ["Fees", "None from the gateway", "Per-transaction commission"],
                  ["Payment confirmation", "Provider status API + UTR review", "Webhook only"],
                  ["Your data", "On your own database", "On their servers"],
                  ["Sandbox testing", "Built in, six simulated outcomes", "Often paid or limited"],
                ].map(([f, ours, theirs]) => (
                  <tr key={f}>
                    <td className="td font-medium text-slate-300">{f}</td>
                    <td className="td text-slate-100">{ours}</td>
                    <td className="td text-slate-500">{theirs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Steps */}
        <section id="how" className="border-y border-slate-800/80 bg-slate-900/40 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <p className="text-sm font-semibold text-brand-400">GET STARTED</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">Live in four simple steps</h2>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map(([title, body], i) => (
                <div key={title} className="card p-5">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-600/15 text-sm font-bold text-brand-300 ring-1 ring-brand-500/30">{i + 1}</span>
                  <h3 className="mt-4 text-base font-semibold text-slate-100">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <p className="text-sm font-semibold text-brand-400">PRICING</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">Simple and transparent</h2>
          <div className="card mt-8 max-w-2xl p-6 sm:p-8">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-slate-50">Free</span>
              <span className="text-sm text-slate-400">self-hosted · MIT licensed</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              UPI Gateway is open source. You host it, you keep your data, and you pay nothing to the gateway.
              The only costs are your own hosting and whatever your bank or PG charges you directly.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-slate-300">
              <li>✓ Unlimited merchants, accounts and orders</li>
              <li>✓ Unlimited API calls and webhooks</li>
              <li>✓ Sandbox with simulated outcomes</li>
              <li>✓ No per-transaction fee, ever</li>
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-slate-800/80 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <p className="text-sm font-semibold text-brand-400">FAQ</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">Questions, answered</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {FAQS.map(([q, a]) => (
                <div key={q} className="card p-5">
                  <h3 className="text-base font-semibold text-slate-100">{q}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{a}</p>
                </div>
              ))}
            </div>
            <div className="card mt-10 flex flex-col items-center gap-4 p-8 text-center sm:flex-row sm:justify-between sm:text-left">
              <div>
                <h3 className="text-lg font-bold text-slate-50">Start accepting UPI payments today</h3>
                <p className="mt-1 text-sm text-slate-400">Set up takes a few minutes — database, admin account, first payment link.</p>
              </div>
              <Link href={state.installed ? "/login" : "/setup"} className="btn btn-primary btn-lg shrink-0">
                {state.installed ? "Log in →" : "Set up now →"}
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

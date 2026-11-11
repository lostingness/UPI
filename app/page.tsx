// Landing page — Axion rebuild (Round 4).
// Light #EFEFEF base, animated shader hero, near-monochrome + one orange.
// Final section order: hero → how it works → QR methods → features →
// vs-aggregator → security → developer/API → pricing → FAQ → footer.
// CUT: testimonials marquee, dashboard demo stats, pay-screen preview,
// any filler. Every claim below is real: real amounts (₹500.00 →
// ₹500.01/₹500.02), the real order-number format (ORD…/TST…), the real
// API example from /docs, real rate limits (1,000/min per key,
// 600/min per IP). No fake stats anywhere.
import Link from "next/link";
import { ArrowUpRight, CreditCard, FlaskConical, Landmark, ReceiptText, ShieldCheck, Webhook } from "lucide-react";
import { PublicNav, SiteFooter } from "@/components/layout";
import { FaqItem, Reveal } from "@/components/layout-client";
import { HeroShader } from "@/components/hero-shader";
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

const FEATURE_ICONS = [
  <Landmark key="bank" className="h-5 w-5" aria-hidden="true" />,
  <ShieldCheck key="shield" className="h-5 w-5" aria-hidden="true" />,
  <ReceiptText key="receipt" className="h-5 w-5" aria-hidden="true" />,
  <CreditCard key="pg" className="h-5 w-5" aria-hidden="true" />,
  <Webhook key="bolt" className="h-5 w-5" aria-hidden="true" />,
  <FlaskConical key="flask" className="h-5 w-5" aria-hidden="true" />,
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--accent-text)]">{children}</p>;
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-2 max-w-2xl text-2xl font-medium tracking-[-0.02em] text-[var(--text)] sm:text-3xl">{children}</h2>;
}

const CREATE_ORDER_EXAMPLE = `curl -X POST $APP_URL/api/v1/orders \\
  -H "X-Api-Key: $UPI_API_KEY" \\
  -H "X-Api-Secret: $UPI_API_SECRET" \\
  -H "Idempotency-Key: order-1001" \\
  -d '{
    "amount": 499.00,
    "client_order_id": "INV-1001",
    "customer_name": "Asha",
    "redirect_url": "https://your-store.example/thank-you"
  }'`;

const CREATE_ORDER_RESPONSE = `201 Created
{
  "order_id": "ORD20261111A1B2C3",
  "amount": "499.00", "currency": "INR",
  "status": "pending",
  "payment_url": "https://your-gateway.example/pay/ORD20261111A1B2C3",
  "upi_intent": "upi://pay?pa=merchant@okhdfcbank&pn=Your%20Store&am=499.00&cu=INR&tn=INV-1001"
}`;

export default async function Home() {
  const [user, state] = await Promise.all([getSessionSafe(), getInstallState()]);
  const ctaHref = user ? "/orders/new" : state.installed ? "/login" : "/setup";
  return (
    <div className="flex min-h-screen flex-col">
      <PublicNav user={user} />
      <main className="flex-1">
        {/* Hero — shader canvas (or its CSS fallback) fills the section;
            content is anchored to the bottom. The floating pill nav sits
            above in flow, so the hero starts at the top of the page. */}
        <section className="relative flex min-h-[92svh] flex-col justify-end overflow-hidden" aria-label="UPI Gateway">
          <HeroShader />
          <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-12 pt-40 sm:px-6 sm:pb-16">
            <p className="liquid-glass-strong inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-[var(--text)]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              UPI Gateway — self-hosted · MIT licensed · ₹0 gateway fees
            </p>
            <h1 className="mt-5 max-w-[16ch] text-[clamp(2.5rem,7vw,4.5rem)] font-medium leading-[1.08] tracking-[-0.03em] text-[var(--text)] sm:max-w-[20ch]">
              Accept UPI payments. Money lands in <span className="text-[var(--accent-text)]">your bank</span>, not ours.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--muted)] sm:text-lg">
              Create a payment link or call one API. Your customer pays by UPI QR or deep link, and the money goes straight to your account — the gateway only verifies it.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-5">
              <Link href={ctaHref} className="btn-expand touch-manipulation" aria-label="Create payment link">
                <ArrowUpRight className="btn-expand-icon h-4 w-4" aria-hidden="true" />
                <span className="btn-expand-label">
                  <span className="text-roll">
                    <span>Create payment link</span>
                    <span aria-hidden="true">Create payment link</span>
                  </span>
                </span>
              </Link>
              <Link href="/docs" className="group inline-flex touch-manipulation items-center gap-1.5 text-sm font-medium text-[var(--text)]">
                <span className="text-roll">
                  <span>Read the API docs</span>
                  <span aria-hidden="true">Read the API docs</span>
                </span>
                <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:rotate-45" aria-hidden="true" />
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-[var(--muted)]">
              <li><span className="text-[var(--accent-text)]" aria-hidden="true">✓</span> No aggregator fees</li>
              <li><span className="text-[var(--accent-text)]" aria-hidden="true">✓</span> Provider-verified payments</li>
              <li><span className="text-[var(--accent-text)]" aria-hidden="true">✓</span> Sandbox included</li>
              <li><span className="text-[var(--accent-text)]" aria-hidden="true">✓</span> MIT licensed</li>
            </ul>
            {!state.databaseConfigured && (
              <p className="mt-6 max-w-xl rounded-xl bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-300">
                Database not configured — set the Neon pooled <code className="kbd">DATABASE_URL</code> and run migrations, then finish{" "}
                <Link href="/setup" className="font-medium underline">setup</Link>.
              </p>
            )}
            {state.databaseConfigured && !state.installed && (
              <p className="mt-6 text-sm text-[var(--muted)]">
                Database is reachable but no admin exists yet —{" "}
                <Link href="/setup" className="font-medium text-[var(--accent-text)]">create the first admin</Link>.
              </p>
            )}
          </div>
        </section>

        {/* How it works — asymmetric: sticky label column, numbered steps. */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-12 sm:px-6 sm:py-16">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.5fr]">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <Reveal><SectionLabel>How it works</SectionLabel><SectionTitle>Live in four steps</SectionTitle></Reveal>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
                No sales call, no onboarding queue. The whole path from sign-up to first payment is four moves you make yourself.
              </p>
            </div>
            <ol className="space-y-0">
              {STEPS.map(([title, body], i) => (
                <li key={title} className="flex gap-5 border-t border-[var(--border)] py-5 first:border-t-0 first:pt-0 last:pb-0">
                  <span className="font-mono text-sm font-medium tabular-nums text-[var(--accent-text)]">0{i + 1}</span>
                  <div>
                    <h3 className="text-base font-medium text-[var(--text)]">{title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* QR methods — Unique vs Same, with the real ₹500 example. */}
        <section id="qr" className="border-y border-[var(--border)] bg-[var(--surface)] py-12 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal><SectionLabel>QR methods</SectionLabel><SectionTitle>One QR per order, or one QR for every order</SectionTitle></Reveal>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)] sm:text-base">
              Every order gets its own QR with the exact amount encoded. For a counter or a printed sign, use one shared QR instead.
            </p>
            <div className="mt-10 grid gap-4 lg:grid-cols-2">
              <div className="card p-6">
                <p className="font-mono text-xs text-[var(--accent-text)]">ORD…</p>
                <h3 className="mt-2 text-lg font-medium text-[var(--text)]">Unique amount QR</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                  Each order gets a QR with its own amount — two customers both order for ₹500.00, the first pays ₹500.01 and the second ₹500.02.
                  The amount is allocated atomically, so two orders never share the same payable amount at the same time, and the provider response is matched to the exact order.
                </p>
                <dl className="mt-5 space-y-2 text-sm">
                  <div className="flex justify-between gap-4 border-t border-[var(--border)] pt-2"><dt className="text-[var(--faint)]">Best for</dt><dd className="text-right text-[var(--text)]">Online checkout, payment links</dd></div>
                  <div className="flex justify-between gap-4 border-t border-[var(--border)] pt-2"><dt className="text-[var(--faint)]">Amount</dt><dd className="text-right text-[var(--text)]">Fixed per order</dd></div>
                  <div className="flex justify-between gap-4 border-t border-[var(--border)] pt-2"><dt className="text-[var(--faint)]">Matching</dt><dd className="text-right text-[var(--text)]">Exact amount + order ID</dd></div>
                </dl>
              </div>
              <div className="card p-6 lg:mt-8">
                <p className="font-mono text-xs text-[var(--accent-text)]">One QR</p>
                <h3 className="mt-2 text-lg font-medium text-[var(--text)]">Same amount QR</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                  One printed QR for a fixed price — a ₹99 item, a ₹299 ticket, a donation of ₹101. Every customer scans the same code and pays the same amount; orders are matched by the customer&apos;s UTR review or by the provider response for that amount.
                </p>
                <dl className="mt-5 space-y-2 text-sm">
                  <div className="flex justify-between gap-4 border-t border-[var(--border)] pt-2"><dt className="text-[var(--faint)]">Best for</dt><dd className="text-right text-[var(--text)]">Counters, stalls, printed signs</dd></div>
                  <div className="flex justify-between gap-4 border-t border-[var(--border)] pt-2"><dt className="text-[var(--faint)]">Amount</dt><dd className="text-right text-[var(--text)]">Same for every payment</dd></div>
                  <div className="flex justify-between gap-4 border-t border-[var(--border)] pt-2"><dt className="text-[var(--faint)]">Matching</dt><dd className="text-right text-[var(--text)]">UTR review or provider response</dd></div>
                </dl>
              </div>
            </div>
            <p className="mt-6 text-xs text-[var(--faint)]">
              Order numbers look like <code className="kbd">ORD20261111A1B2C3</code> for live orders and <code className="kbd">TST…</code> for sandbox orders.
            </p>
          </div>
        </section>

        {/* Features — real only. */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-12 sm:px-6 sm:py-16">
          <Reveal><SectionLabel>Features</SectionLabel><SectionTitle>Everything a merchant needs, nothing held back</SectionTitle></Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([title, body], i) => (
              <Reveal key={title} delay={i * 40} className="h-full">
                <div className="card h-full p-5">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[var(--accent-text)] ring-1 ring-[var(--border)]" aria-hidden="true">{FEATURE_ICONS[i]}</span>
                  <h3 className="mt-4 text-base font-medium text-[var(--text)]">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Gateway vs aggregator — honest comparison, no invented numbers. */}
        <section id="compare" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-12 sm:px-6 sm:py-16">
          <Reveal><SectionLabel>Why self-hosted</SectionLabel><SectionTitle>Gateway, not aggregator</SectionTitle></Reveal>
          <p className="mt-3 max-w-2xl text-sm text-[var(--muted)] sm:text-base">
            Aggregators pool your money and settle later. UPI Gateway routes every payment straight to your own account.
          </p>
          <div className="card mt-8 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="th"> </th>
                  <th className="th text-[var(--accent-text)]">UPI Gateway</th>
                  <th className="th">Typical aggregator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {[
                  ["Where the money goes", "Directly to your bank account", "Aggregator wallet, settled later"],
                  ["Fees", "None from the gateway", "Per-transaction commission"],
                  ["Payment confirmation", "Provider status API + UTR review", "Webhook only"],
                  ["Your data", "On your own database", "On their servers"],
                  ["Sandbox testing", "Built in, six simulated outcomes", "Often paid or limited"],
                ].map(([f, ours, theirs]) => (
                  <tr key={f} className="transition-colors duration-150 hover:bg-[var(--surface-2)]">
                    <td className="td font-medium">{f}</td>
                    <td className="td">{ours}</td>
                    <td className="td text-[var(--muted)]">{theirs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Security — real mechanisms only. */}
        <section id="security" className="border-y border-[var(--border)] bg-[var(--surface)] py-12 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal><SectionLabel>Security</SectionLabel><SectionTitle>Verified by the provider, or it is not paid</SectionTitle></Reveal>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Exact-match verification", "Amount, order ID, currency and a fresh timestamp must all match the provider response."],
                ["UTR is never enough", "A customer-submitted UTR goes to review. Only your approval — or the provider — marks an order paid."],
                ["Signed webhooks", "HMAC-SHA256, timestamped, sequenced. Tampered or stale deliveries are rejected."],
                ["Secrets stay encrypted", "Provider credentials are stored AES-256-GCM encrypted in your own database."],
                ["Allowlisted redirects", "Customers return only to domains you listed. Anything else is refused."],
                ["Audited admin actions", "Manual overrides and lease recovery are written to the audit log with who and why."],
              ].map(([t, b]) => (
                <div key={t} className="card p-5">
                  <h3 className="text-base font-medium text-[var(--text)]">{t}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Developer — the real API example, verbatim from /docs. */}
        <section id="developer" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-12 sm:px-6 sm:py-16">
          <Reveal><SectionLabel>Developer</SectionLabel><SectionTitle>One API call creates an order</SectionTitle></Reveal>
          <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1.3fr]">
            <div>
              <p className="max-w-lg text-sm leading-relaxed text-[var(--muted)] sm:text-base">
                Send <code className="kbd">POST /api/v1/orders</code> with your API key and secret. The response carries the payment URL, the UPI intent and the order number — share the link or render the QR from it.
              </p>
              <ul className="mt-6 space-y-2 text-sm text-[var(--text)]">
                <li>✓ Idempotent — send an Idempotency-Key and retries are safe</li>
                <li>✓ Rate limited — 1,000/min per API key, 600/min per IP</li>
                <li>✓ Sandbox keys create TST… orders with no provider calls</li>
              </ul>
              <Link href="/docs" className="btn btn-secondary mt-8">Read the full API docs</Link>
            </div>
            <div className="overflow-x-auto rounded-2xl bg-[#0d1322] p-5 ring-1 ring-black/10">
              {/* Round 5: dark code panel — slate text is correct here (it sits
                  on #0d1322 in BOTH themes); token text was 1.02:1 on it. */}
              <p className="font-mono text-xs text-slate-400">Create an order</p>
              <pre className="mt-3 overflow-x-auto font-mono text-xs leading-relaxed text-slate-200">{CREATE_ORDER_EXAMPLE}</pre>
              <p className="mt-4 font-mono text-xs text-slate-400">Response — 201, payment_url + upi_intent + order_no</p>
              <pre className="mt-2 overflow-x-auto font-mono text-xs leading-relaxed text-slate-200">{CREATE_ORDER_RESPONSE}</pre>
            </div>
          </div>
        </section>

        {/* Pricing — honest: the gateway itself is free. */}
        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-12 sm:px-6 sm:py-16">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <Reveal><SectionLabel>Pricing</SectionLabel><SectionTitle>Simple and transparent</SectionTitle></Reveal>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
                There is no plan, no tier and no per-transaction cut. The costs that exist are the ones you can already see: your hosting, and whatever your bank or PG charges you directly.
              </p>
            </div>
            <div className="card p-6 sm:p-8">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-4xl font-medium text-[var(--text)]">₹0.00</span>
                <span className="text-sm text-[var(--muted)]">self-hosted · MIT licensed</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
                UPI Gateway is open source. You host it, you keep your data, and you pay nothing to the gateway.
                The only costs are your own hosting and whatever your bank or PG charges you directly.
              </p>
              <ul className="mt-5 space-y-2 text-sm text-[var(--text)]">
                <li>✓ Unlimited merchants, accounts and orders</li>
                <li>✓ Unlimited API calls and webhooks</li>
                <li>✓ Sandbox with simulated outcomes</li>
                <li>✓ No per-transaction fee, ever</li>
              </ul>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-t border-[var(--border)] py-12 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal><SectionLabel>FAQ</SectionLabel><SectionTitle>Questions, answered</SectionTitle></Reveal>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {FAQS.map(([q, a]) => <FaqItem key={q} q={q} a={a} />)}
            </div>
            <div className="card mt-10 flex flex-col items-center gap-4 p-8 text-center sm:flex-row sm:justify-between sm:text-left">
              <div>
                <h3 className="text-lg font-medium text-[var(--text)]">Start accepting UPI payments today</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">Setup takes a few minutes — database, admin account, first payment link.</p>
              </div>
              <Link href={state.installed ? "/login" : "/setup"} className="btn btn-accent btn-lg shrink-0">
                {state.installed ? "Log in" : "Set up now"}
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

// Landing page — Halden rebuild (Round 6, Worker A).
// Scene order: bowl-glow hero → pinned statement → dark split (ship) →
// logo marquee (sample marks) → how it works → QR methods → features →
// sample testimonials → vs-aggregator → security → developer/API →
// pricing → FAQ → footer.
// Every claim below is real: real amounts (₹500.00 → ₹500.01/₹500.02),
// the real order-number format (ORD…/TST…), the real API example from
// /docs, real rate limits (1,000/min per key, 600/min per IP). No fake
// stats anywhere. The 8 logo wordmarks and the testimonial cards are
// labelled SAMPLE — fictional, never real partners or customers.
// Halden CSS lives in the <style> below (globals.css is off-limits);
// fonts are Inter Tight via app/fonts.css + app/layout.tsx.
import Link from "next/link";
import { CreditCard, FlaskConical, Landmark, ReceiptText, ShieldCheck, Webhook } from "lucide-react";
import { PublicNav, SiteFooter } from "@/components/layout";
import { FaqItem, Reveal } from "@/components/layout-client";
import { getInstallState, getSessionSafe } from "@/components/server-data";
import { BowlGlow } from "@/components/bowl-glow";
import { HaldenCta } from "@/components/halden-cta";
import { HaldenReveals } from "@/components/letter-reveal";
import { HALDEN_MARKS, LogoMarquee, Wordmark } from "@/components/logo-marquee";
import { Testimonials } from "@/components/testimonials";

export const dynamic = "force-dynamic";

// The spec's ship asset, used exactly as given.
const SHIP_URL =
  "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20261029_050506_a830ff21-4c71-4272-bc39-b61cacb54463.png&w=1400&q=85";

// Halden design tokens + scene styles. Scoped under .halden (the page
// wrapper) so nothing leaks onto other pages. .hbtn is the dot-arrow
// button — deliberately NOT .btn, which globals.css already defines for
// the whole app. .fade-up is only hidden once body.ready (added by
// HaldenReveals after mount), so no-JS / failed-hydration still shows
// every word.
const HALDEN_CSS = `
.halden{--ink:#0b1d3a;--ink-2:#1d2f4f;--accent:#5b7cf0;--dot:#2fe0d0;--panel:#0e1f3d;--panel-line:rgba(255,255,255,.12);--gut:clamp(20px,5.7vw,82px);--ease:cubic-bezier(.22,.7,.2,1);font-family:"Inter Tight",system-ui,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:clip}
.atmo{position:fixed;inset:0;z-index:0;pointer-events:none;background:#fff}
.atmo canvas{position:absolute;inset:0;width:100%;height:100%}
@keyframes fu{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
body.ready .fade-up{animation:fu .9s var(--ease) var(--d,0s) both}
@media (prefers-reduced-motion:reduce){body.ready .fade-up{animation:none;opacity:1;transform:none}}
/* --- dot-arrow button --- */
.hbtn{position:relative;display:inline-flex;align-items:center;height:42px;padding:0 46px 0 18px;border-radius:999px;background:var(--ink);color:#fff;font-size:13.5px;font-weight:500;letter-spacing:-.01em;white-space:nowrap;text-decoration:none;touch-action:manipulation}
.hbtn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.hdot{position:absolute;right:16px;top:50%;transform:translateY(-50%);width:10px;height:10px;border-radius:999px;background:var(--dot);box-shadow:0 0 10px rgba(47,224,208,.7);display:grid;place-items:center;transition:width .45s var(--ease),height .45s var(--ease),right .45s var(--ease),box-shadow .45s var(--ease)}
.hdot svg{width:12px;height:12px;opacity:0;transform:translateX(-4px);transition:opacity .3s ease .05s,transform .3s ease .05s}
.hbtn:hover .hdot{width:32px;height:32px;right:5px;box-shadow:none}
.hbtn:hover .hdot svg{opacity:1;transform:translateX(0)}
.hbtn.lg{height:62px;padding:0 62px 0 28px;font-size:17px}
.hbtn.lg .hdot{width:14px;height:14px;right:24px}
.hbtn.lg .hdot svg{width:16px;height:16px}
.hbtn.lg:hover .hdot{width:48px;height:48px;right:7px}
/* --- scene 1: hero --- */
/* Round 6 integration fix: the hero is 100vh tall BUT sits below the
   nav's in-flow spacer (80px desktop / 66px mobile), so the old
   height:100vh pushed the hero bottom 80px past the fold and the CTA
   (bottom:7.5vh) sat ~20px below the fold at 800px viewport height
   (measured: CTA bottom 820 vs fold 800; 859 vs 844 at 390px).
   Subtract the spacer so the hero bottom lands exactly on the fold and
   the CTA is fully visible. min-height 560px (was 640px) keeps the CTA
   visible even on short viewports: at 600px height the hero is 560px,
   its bottom is 640px, and the CTA bottom is 595px — still on screen. */
.halden-hero{position:relative;z-index:1;height:calc(100vh - 80px);height:calc(100svh - 80px);min-height:560px}
#h1{position:absolute;top:21.5vh;left:var(--gut);right:var(--gut);margin:0;font-weight:400;font-size:clamp(34px,4.65vw,70px);line-height:1.03;letter-spacing:-.035em;color:var(--ink);white-space:nowrap}
.trust{position:absolute;top:58vh;left:var(--gut);margin:0;font-size:clamp(15px,1.28vw,19px);letter-spacing:-.015em;color:var(--ink-2)}
.halden-hero .hbtn.lg{position:absolute;left:var(--gut);bottom:7.5vh}
.logos{position:absolute;right:0;width:50%;top:55vh;bottom:0;display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:1fr 1fr}
.logos .cell{position:relative;display:flex;align-items:center;justify-content:center;color:#3e4d68;min-width:0;padding:0 6px}
.logos .cell:nth-child(4n+2)::before,.logos .cell:nth-child(4n+3)::before,.logos .cell:nth-child(4n+4)::before{content:"";position:absolute;left:0;top:0;bottom:0;width:1px;background:linear-gradient(rgba(11,29,58,.08),rgba(11,29,58,.05))}
.logos .cell:nth-child(n+5)::after{content:"";position:absolute;top:0;left:0;right:0;height:1px;background:rgba(11,29,58,.06)}
/* --- scene 2: pinned statement --- */
.statement{position:relative;z-index:1;height:306vh;margin-top:-31vh;pointer-events:none}
.stmt-pin{position:sticky;top:0;height:100vh}
#stmt{position:absolute;top:41.5vh;left:0;right:0;margin:0;text-align:center;font-weight:400;font-size:clamp(20px,2.8vw,42px);line-height:1.16;letter-spacing:-.03em;color:var(--ink);white-space:nowrap;will-change:transform}
/* --- scene 3: dark split --- */
.split{position:relative;z-index:2;background:var(--panel);color:#fff;min-height:100vh;display:grid;grid-template-columns:58.3% 41.7%}
.split-l{position:relative;padding-left:var(--gut)}
.split-l::before{content:"";position:absolute;left:var(--gut);top:0;bottom:0;width:1px;background:var(--panel-line)}
#h2{margin:0;padding:21vh 0 0 6.2vw;font-weight:400;font-size:clamp(32px,3.15vw,48px);line-height:1.08;letter-spacing:-.03em;color:#fff}
#row{margin-top:6.4vh;border-top:1px solid var(--panel-line);display:grid;grid-template-columns:1fr 1.05fr;gap:24px;padding:3vh 6vw 0 6.2vw;opacity:0;transform:translateY(14px);transition:opacity .9s var(--ease),transform .9s var(--ease)}
#row.is-visible{opacity:1;transform:none}
#row h3{margin:0;font-weight:400;font-size:clamp(17px,1.4vw,21px);color:#fff}
#row .row-lede{margin:8px 0 0;font-size:clamp(13px,1.1vw,16px);line-height:1.38;color:rgba(255,255,255,.5);max-width:20em}
#row .row-facts{list-style:none;margin:0;padding:0;display:grid;gap:12px;align-content:start;font-size:clamp(13px,1.1vw,16px);line-height:1.38;color:rgba(255,255,255,.72)}
#row .row-facts strong{color:#fff;font-weight:500}
.split-r{position:relative;overflow:hidden;min-height:100%}
#ship{display:block;width:100%;height:100%;object-fit:cover;transform-origin:50% 60%}
/* --- after the scenes: keep the fixed white atmo covered --- */
.halden-rest{position:relative;z-index:2;background:var(--surface)}
@media (max-width:820px){
  #h1{top:17vh;font-size:7.4vw;white-space:normal}
  .trust{top:44vh}
  .logos{width:100%;top:50vh;bottom:18vh}
  .logos .hl-mark-text{display:none}
  .halden-hero{height:calc(100vh - 66px);height:calc(100svh - 66px);min-height:560px}
  .halden-hero .hbtn.lg{bottom:6vh}
  #stmt{white-space:normal;font-size:23px;max-width:15em;margin-inline:auto}
  #stmt br{display:none}
  .split{grid-template-columns:1fr;grid-template-rows:auto 70vh}
  #h2{padding:16vh 0 0 6vw}
  #row{grid-template-columns:1fr;padding:3vh 6vw 6vh}
  .split-r{min-height:70vh}
}
`;

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

// Hero logo-grid fade-up delays, row by row (spec order).
const CELL_DELAYS = ["1.25s", "1.32s", "1.39s", "1.46s", "1.42s", "1.49s", "1.56s", "1.63s"];

export default async function Home() {
  const [user, state] = await Promise.all([getSessionSafe(), getInstallState()]);
  const ctaHref = user ? "/orders/new" : state.installed ? "/login" : "/setup";
  return (
    <div className="halden flex min-h-screen flex-col">
      <style>{HALDEN_CSS}</style>
      <PublicNav user={user} />
      <main className="flex-1">
        <BowlGlow />
        <HaldenReveals />

        {/* Scene 1 — hero: white page, bowl glow from the top. */}
        <section className="halden-hero" aria-label="UPI Gateway">
          <h1 id="h1">
            Accept UPI payments,
            <br />
            minus the <span className="hl">busywork</span>.
          </h1>
          <p className="trust fade-up" style={{ "--d": "1.15s" } as React.CSSProperties}>
            Merchants accept UPI with UPI Gateway
          </p>
          <HaldenCta href={ctaHref} label="Get started" large className="fade-up" style={{ "--d": "1.3s" } as React.CSSProperties} />
          <div className="logos" aria-hidden="true">
            {HALDEN_MARKS.map((m, i) => (
              <div key={m.label} className="cell fade-up" style={{ "--d": CELL_DELAYS[i] } as React.CSSProperties}>
                <Wordmark mark={m} />
              </div>
            ))}
          </div>
        </section>

        {/* Scene 2 — pinned statement, letter-by-letter on scroll. */}
        <section className="statement" aria-label="What the gateway does">
          <div className="stmt-pin">
            <p id="stmt">
              Track every payment.
              <br />
              Create orders in one call.
              <br />
              Verify UTRs against the bank.
              <br />
              Signed webhooks keep money moving.
            </p>
          </div>
        </section>

        {/* Scene 3 — dark split: headline + merchant row + fjord ship. */}
        <section className="split" id="split" aria-label="Payments that settle like you work">
          <div className="split-l">
            <h2 id="h2">
              Payments that settle
              <br />
              like you work
            </h2>
            <div id="row">
              <div>
                <h3>Merchants</h3>
                <p className="row-lede">Collect faster. Reconcile more. Stop chasing UTRs.</p>
              </div>
              <ul className="row-facts">
                <li><strong>₹500.00 → ₹500.01 / ₹500.02</strong> — Unique QR gives every order its own payable amount</li>
                <li><strong>One API call</strong> — POST /api/v1/orders creates an order</li>
                <li><strong>Signed webhooks</strong> — HMAC-SHA256, timestamped, sequenced</li>
                <li><strong>Real rate limits</strong> — 1,000/min per API key, 600/min per IP</li>
              </ul>
            </div>
          </div>
          <div className="split-r">
            <img id="ship" src={SHIP_URL} alt="Aerial view of a container ship sailing up a misty fjord" loading="lazy" />
          </div>
        </section>

        <div className="halden-rest">
          {!state.databaseConfigured && (
            <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
              <p className="max-w-xl rounded-xl bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-300">
                Database not configured — set the Neon pooled <code className="kbd">DATABASE_URL</code> and run migrations, then finish{" "}
                <Link href="/setup" className="font-medium underline">setup</Link>.
              </p>
            </div>
          )}
          {state.databaseConfigured && !state.installed && (
            <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
              <p className="text-sm text-[var(--muted)]">
                Database is reachable but no admin exists yet —{" "}
                <Link href="/setup" className="font-medium text-[var(--accent-text)]">create the first admin</Link>.
              </p>
            </div>
          )}

          <LogoMarquee />

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

          <Testimonials />

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
                <div className="mt-8">
                  <HaldenCta href="/docs" label="Read the full API docs" />
                </div>
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
                <HaldenCta href={state.installed ? "/login" : "/setup"} label={state.installed ? "Log in" : "Get started"} />
              </div>
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

// Landing page — Halden rebuild (Round 6, Worker A), Round 7 UI track,
// Round 8 landing track.
// Scene order: bowl-glow hero (animated 4-line headline, in-flow flex —
// no absolute positioning) → pinned statement → dark
// split (ship) → "Pay via" / "Built with" rows → how it works → QR
// methods → features → security → developer/API → FAQ → footer.
// Every claim below is real: real amounts (₹500.00 → ₹500.01/₹500.02),
// the real order-number format (ORD…/TST…), the real API example from
// /docs, real rate limits (1,000/min per key, 600/min per IP). No fake
// stats, no fictional partners or testimonials anywhere, and no fake
// order data on the landing at all (the developer example uses the
// ORD… format placeholder, not a concrete order number).
// Halden CSS lives in the <style> below (globals.css is off-limits);
// fonts are Bricolage Grotesque + Inter via app/fonts.css + app/layout.tsx.
import Link from "next/link";
import { CreditCard, FlaskConical, Landmark, ReceiptText, ShieldCheck, Webhook } from "lucide-react";
import { PublicNav, SiteFooter } from "@/components/layout";
import { FaqItem, Reveal } from "@/components/layout-client";
import { getInstallState, getSessionSafe } from "@/components/server-data";
import { BowlGlow } from "@/components/bowl-glow";
import { DemoCta } from "@/components/demo-cta";
import { HaldenCta } from "@/components/halden-cta";
import { HaldenReveals, LetterReveal, ShipImage } from "@/components/letter-reveal";
import { LogoMarquee } from "@/components/logo-marquee";

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
.halden{--ink:#0b1d3a;--ink-2:#1d2f4f;--accent:#5b7cf0;--dot:#2fe0d0;--panel:#0e1f3d;--panel-line:rgba(255,255,255,.12);--gut:clamp(20px,5.7vw,82px);--ease:cubic-bezier(.22,.7,.2,1);font-family:"Inter",system-ui,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:clip}
.atmo{position:fixed;inset:0;z-index:0;pointer-events:none;background:#fff}
.atmo canvas{position:absolute;inset:0;width:100%;height:100%}
@keyframes fu{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
body.ready .fade-up{animation:fu .9s var(--ease) var(--d,0s) both}
@media (prefers-reduced-motion:reduce){body.ready .fade-up{animation:none;opacity:1;transform:none}}
/* --- LetterReveal (Round 7): chars/words start hidden only once JS has
   split them (.lr-armed*); .lr-done (IntersectionObserver) brings them
   in with a per-element stagger set inline. No-JS text is never hidden. */
.lr-text .hl-char,.lr-text .hl-word{transition:opacity .55s var(--ease),transform .55s var(--ease)}
.lr-armed .hl-char{opacity:0;transform:translateY(.35em)}
.lr-armed.lr-done .hl-char{opacity:1;transform:none}
.lr-armed-word .hl-word{opacity:0;transform:translateY(.25em)}
.lr-armed-word.lr-done .hl-word{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.lr-armed .hl-char,.lr-armed-word .hl-word{opacity:1!important;transform:none!important;transition:none}}
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
/* --- secondary ghost CTA (Round 7, "View docs") --- */
.hbtn-ghost{display:inline-flex;align-items:center;height:62px;padding:0 28px;border-radius:999px;background:transparent;color:var(--ink);font-size:17px;font-weight:500;letter-spacing:-.01em;text-decoration:none;box-shadow:inset 0 0 0 1px rgba(11,29,58,.25);transition:background .3s var(--ease),box-shadow .3s var(--ease);touch-action:manipulation;white-space:nowrap}
.hbtn-ghost:hover{background:rgba(11,29,58,.06);box-shadow:inset 0 0 0 1px rgba(11,29,58,.45)}
.hbtn-ghost:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
/* --- scene 1: hero --- */
/* Round 8: the hero is IN-FLOW flex (was absolute-positioned #h1 /
   .trust / .hero-ctas). Absolute vh positions collided
   on short viewports — at 1280x600 the trust line sat 4px INTO the
   headline and the removed card covered "moving." (user's desktop
   photo, 2026-11-12). In-flow layout makes overlap impossible at any
   width or height: headline, sub-headline and CTAs stack with a fixed
   gap, the hero grows (min-height) if the content needs more room, and
   the headline wraps between words instead of clipping (no
   white-space:nowrap anywhere on #h1). The card is gone
   entirely (Round 8, item 2), so no element can collide with the text.
   The 100svh min-height + the statement's -31vh pull-up are kept, so
   the bowl-flood choreography below is unchanged. */
.halden-hero{position:relative;z-index:1;display:flex;flex-direction:column;justify-content:center;gap:clamp(18px,3.2vh,30px);min-height:calc(100vh - 80px);min-height:calc(100svh - 80px);padding:clamp(20px,5vh,56px) var(--gut)}
#h1{margin:0;font-family:var(--font-display);font-weight:400;font-size:clamp(34px,4.4vw,64px);line-height:1.05;letter-spacing:-.035em;color:var(--ink);max-width:100%}
/* Longest line ("Signed webhooks keep money moving.") measures 962px at
   1280px / 56px font against 1134px available — 15% spare; at 1440px
   (64px cap) 1093px vs 1276px available. Wrapping is the backstop, not
   the plan: a too-long line wraps between words, never clips. */
.trust{margin:0;font-size:clamp(15px,1.28vw,19px);line-height:1.5;letter-spacing:-.015em;color:var(--ink-2);max-width:36em}
.hero-ctas{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
/* --- scene 2: pinned statement --- */
/* Round 7: 200vh (was 306vh) — the 4-line reveal no longer needs three
   viewports of scrolling to complete; the letter-reveal divisor in
   letter-reveal.tsx (1.13) is tuned to this height. The reveal starts at
   q .30 (not .56) so the statement text is already appearing while the
   hero scrolls away — otherwise the pin area below the hero renders as a
   content-free flood band. The bowl-flood choreography is untouched: the
   bowl is near-full flood by the time the split arrives. */
.statement{position:relative;z-index:1;height:200vh;margin-top:-31vh;pointer-events:none}
.stmt-pin{position:sticky;top:0;height:100vh}
#stmt{position:absolute;top:41.5vh;left:0;right:0;margin:0;text-align:center;font-family:var(--font-display);font-weight:400;font-size:clamp(20px,2.8vw,42px);line-height:1.16;letter-spacing:-.03em;color:var(--ink);white-space:nowrap;will-change:transform}
/* --- scene 3: dark split --- */
.split{position:relative;z-index:2;background:var(--panel);color:#fff;min-height:100vh;display:grid;grid-template-columns:58.3% 41.7%}
.split-l{position:relative;padding-left:var(--gut)}
.split-l::before{content:"";position:absolute;left:var(--gut);top:0;bottom:0;width:1px;background:var(--panel-line)}
#h2{margin:0;padding:21vh 0 0 6.2vw;font-family:var(--font-display);font-weight:400;font-size:clamp(32px,3.15vw,48px);line-height:1.08;letter-spacing:-.03em;color:#fff}
#row{margin-top:6.4vh;border-top:1px solid var(--panel-line);display:grid;grid-template-columns:1fr 1.05fr;gap:24px;padding:3vh 6vw 0 6.2vw;opacity:0;transform:translateY(14px);transition:opacity .9s var(--ease),transform .9s var(--ease)}
#row.is-visible{opacity:1;transform:none}
#row h3{margin:0;font-weight:400;font-size:clamp(17px,1.4vw,21px);color:#fff}
#row .row-lede{margin:8px 0 0;font-size:clamp(13px,1.1vw,16px);line-height:1.38;color:rgba(255,255,255,.5);max-width:20em}
#row .row-facts{list-style:none;margin:0;padding:0;display:grid;gap:12px;align-content:start;font-size:clamp(13px,1.1vw,16px);line-height:1.38;color:rgba(255,255,255,.72)}
#row .row-facts strong{color:#fff;font-weight:500}
.split-r{position:relative;overflow:hidden;min-height:100%}
#ship{display:block;width:100%;height:100%;object-fit:cover;transform-origin:50% 60%}
/* Round 7: local fallback when the remote ship image fails (see
   ShipImage in letter-reveal.tsx) — a deep-navy fjord gradient panel,
   same box as the photo, so the split never shows a broken image. */
.ship-fallback{width:100%;height:100%;min-height:70vh;background:radial-gradient(90% 60% at 70% 20%,rgba(143,213,241,.28),transparent 60%),radial-gradient(70% 50% at 20% 85%,rgba(91,124,240,.22),transparent 60%),linear-gradient(160deg,#16324f 0%,#0e1f3d 45%,#0a1830 100%)}
/* --- after the scenes: keep the fixed white atmo covered --- */
.halden-rest{position:relative;z-index:2;background:var(--surface)}
@media (max-width:820px){
  #h1{font-size:7.4vw}
  .hbtn.lg{height:52px;padding:0 52px 0 22px;font-size:15px}
  .hbtn.lg .hdot{width:12px;height:12px;right:20px}
  .hbtn.lg .hdot svg{width:14px;height:14px}
  .hbtn.lg:hover .hdot{width:40px;height:40px;right:6px}
  .hbtn-ghost{height:52px;padding:0 22px;font-size:15px}
  #stmt{white-space:normal;font-size:23px;max-width:15em;margin-inline:auto}
  #stmt br{display:none}
  .split{grid-template-columns:1fr;grid-template-rows:auto 70vh}
  #h2{padding:16vh 0 0 6vw}
  #row{grid-template-columns:1fr;padding:3vh 6vw 6vh}
  .split-r{min-height:70vh}
}
/* Round 7 (bug 4), Round 8: landscape / short viewports. The in-flow
   hero grows if it must, so the old 560px min-height + 66px spacer
   squeeze is gone; keep the compact headline and 48px CTA so a ~360px
   landscape phone still fits the hero in one viewport. */
@media (max-height:540px){
  .halden-hero{min-height:300px;gap:14px;padding:12px var(--gut)}
  #h1{font-size:clamp(24px,4vw,36px)}
  .trust{font-size:14px}
  .hbtn.lg{height:48px;padding:0 48px 0 20px;font-size:15px}
  .hbtn.lg .hdot{right:18px}
  .hbtn-ghost{height:48px;padding:0 20px;font-size:15px}
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
function SectionTitle({ children, animated = false }: { children: React.ReactNode; animated?: boolean }) {
  return (
    <h2 className="mt-2 max-w-2xl text-2xl font-medium tracking-[-0.02em] text-[var(--text)] sm:text-3xl">
      {animated ? <LetterReveal>{children}</LetterReveal> : children}
    </h2>
  );
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
  "order_id": "ORD…",
  "amount": "499.00", "currency": "INR",
  "status": "pending",
  "payment_url": "https://your-gateway.example/pay/ORD…",
  "upi_intent": "upi://pay?pa=merchant@okhdfcbank&pn=Your%20Store&am=499.00&cu=INR&tn=INV-1001"
}`;

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

        {/* Scene 1 — hero: white page, bowl glow from the top. The
            headline is the exact 4-line brief copy, animated
            character-by-character by HaldenReveals (#h1). */}
        <section className="halden-hero" aria-label="UPI Gateway">
          <h1 id="h1">
            Track every payment.
            <br />
            Create orders in one call.
            <br />
            Verify UTRs against the <span className="hl">bank</span>.
            <br />
            Signed webhooks keep <span className="hl">money</span> moving.
          </h1>
          <p className="trust fade-up" style={{ "--d": "1.15s" } as React.CSSProperties}>
            Self-hosted UPI gateway — payments go straight to your bank account. No wallet in between, no per-transaction cut.
          </p>
          <div className="hero-ctas fade-up" style={{ "--d": "1.3s" } as React.CSSProperties}>
            <HaldenCta href={ctaHref} label="Get started" large />
            <Link href="/docs" className="hbtn-ghost">View docs</Link>
            {/* Round 8: demo payment link CTA — same hero CTA row, third
                button. Logged-in merchants create a ₹10.00 demo link in one
                click; logged-out visitors go to /login (a demo order needs
                a merchant to own it). */}
            <DemoCta loggedIn={!!user} />
          </div>
        </section>

        {/* Scene 2 — pinned statement, letter-by-letter on scroll.
            Round 7 copy: new gateway statement, no overlap with the
            hero lines above. */}
        <section className="statement" aria-label="What the gateway does">
          <div className="stmt-pin">
            <p id="stmt">
              Money lands in your own bank.
              <br />
              No wallet in between. No cut taken.
              <br />
              Verified by the provider, or not paid.
              <br />
              Open source. Yours to run.
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
            <ShipImage src={SHIP_URL} alt="Aerial view of a container ship sailing up a misty fjord" />
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
              <Reveal><SectionLabel>QR methods</SectionLabel><SectionTitle animated>One QR per order, or one QR for every order</SectionTitle></Reveal>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)] sm:text-base">
                <LetterReveal variant="word">Every order gets its own QR with the exact amount encoded. For a counter or a printed sign, use one shared QR instead.</LetterReveal>
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
                Live order numbers start with <code className="kbd">ORD…</code>; sandbox orders start with <code className="kbd">TST…</code>.
              </p>
            </div>
          </section>

          {/* Features — real only. */}
          <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-12 sm:px-6 sm:py-16">
            <Reveal><SectionLabel>Features</SectionLabel><SectionTitle animated>Everything a merchant needs, nothing held back</SectionTitle></Reveal>
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

          {/* Security — real mechanisms only. */}
          <section id="security" className="border-y border-[var(--border)] bg-[var(--surface)] py-12 sm:py-16">
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <Reveal><SectionLabel>Security</SectionLabel><SectionTitle animated>Verified by the provider, or it is not paid</SectionTitle></Reveal>
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
            <Reveal><SectionLabel>Developer</SectionLabel><SectionTitle animated>One API call creates an order</SectionTitle></Reveal>
            <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1.3fr]">
              <div>
                <p className="max-w-lg text-sm leading-relaxed text-[var(--muted)] sm:text-base">
                  <LetterReveal variant="word">Send <code className="kbd">POST /api/v1/orders</code> with your API key and secret. The response carries the payment URL, the UPI intent and the order number — share the link or render the QR from it.</LetterReveal>
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

          {/* FAQ — scroll-mt-24 like every sibling section, so an anchor
              jump (#faq, linked from the footer + mobile menu) clears the
              fixed nav instead of landing the section label under it. */}
          <section id="faq" className="scroll-mt-24 border-t border-[var(--border)] py-12 sm:py-16">
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <Reveal><SectionLabel>FAQ</SectionLabel><SectionTitle animated>Questions, answered</SectionTitle></Reveal>
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

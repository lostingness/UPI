// Landing page — Halden rebuild (Round 6, Worker A), Round 7 UI track.
// Scene order: bowl-glow hero (animated 4-line headline + example-order
// preview) → pinned statement → dark split (ship) →
// "Pay via" / "Built with" marquee → how it works → QR methods →
// features → vs-aggregator → security → developer/API → pricing →
// FAQ → footer.
// Every claim below is real: real amounts (₹500.00 → ₹500.01/₹500.02),
// the real order-number format (ORD…/TST…), the real API example from
// /docs, real rate limits (1,000/min per key, 600/min per IP). No fake
// stats, no fictional partners or testimonials anywhere. The hero
// preview card is labelled an illustration, not a live order.
// Halden CSS lives in the <style> below (globals.css is off-limits);
// fonts are Inter Tight via app/fonts.css + app/layout.tsx.
import Link from "next/link";
import { CreditCard, FlaskConical, Landmark, ReceiptText, ShieldCheck, Webhook } from "lucide-react";
import { PublicNav, SiteFooter } from "@/components/layout";
import { FaqItem, Reveal } from "@/components/layout-client";
import { getInstallState, getSessionSafe } from "@/components/server-data";
import { BowlGlow } from "@/components/bowl-glow";
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
.halden{--ink:#0b1d3a;--ink-2:#1d2f4f;--accent:#5b7cf0;--dot:#2fe0d0;--panel:#0e1f3d;--panel-line:rgba(255,255,255,.12);--gut:clamp(20px,5.7vw,82px);--ease:cubic-bezier(.22,.7,.2,1);font-family:"Inter Tight",system-ui,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:clip}
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
/* Round 6 integration fix: the hero is 100vh tall BUT sits below the
   nav's in-flow spacer (80px desktop / 66px mobile), so the old
   height:100vh pushed the hero bottom 80px past the fold and the CTA
   (bottom:7.5vh) sat ~20px below the fold at 800px viewport height
   (measured: CTA bottom 820 vs fold 800; 859 vs 844 at 390px).
   Subtract the spacer so the hero bottom lands exactly on the fold and
   the CTA is fully visible. min-height 560px (was 640px) keeps the CTA
   visible even on short viewports: at 600px height the hero is 560px,
   its bottom is 640px, and the CTA bottom is 595px — still on screen.
   Round 7: headline is now the 4-line brief copy (was 2 lines); the
   trust line is a real supporting description (was tautological); the
   hero logo grid is gone (it duplicated the marquee) and the freed
   bottom-right corner holds the example-order preview card. */
.halden-hero{position:relative;z-index:1;height:calc(100vh - 80px);height:calc(100svh - 80px);min-height:560px}
#h1{position:absolute;top:20vh;left:var(--gut);right:var(--gut);margin:0;font-weight:400;font-size:clamp(34px,4.4vw,64px);line-height:1.03;letter-spacing:-.035em;color:var(--ink);white-space:nowrap}
/* Round 7 integration: the 380px reserve is the preview card, but the
   % in max-width resolves against the FULL hero width while the text
   starts at left:var(--gut) — so the old calc(100% - 380px) let the
   line run ~106px under the card at 1280px. Subtract both gutters too. */
.trust{position:absolute;top:58vh;left:var(--gut);right:var(--gut);margin:0;font-size:clamp(15px,1.28vw,19px);letter-spacing:-.015em;color:var(--ink-2);max-width:calc(100% - 380px - 2 * var(--gut))}
.hero-ctas{position:absolute;left:var(--gut);bottom:7.5vh;display:flex;align-items:center;gap:12px;flex-wrap:wrap;max-width:calc(100% - 2*var(--gut))}
/* --- hero preview card: an EXAMPLE order, labelled illustration --- */
.hero-preview{position:absolute;right:var(--gut);bottom:6vh;width:min(340px,36vw);background:rgba(255,255,255,.78);-webkit-backdrop-filter:blur(16px) saturate(1.4);backdrop-filter:blur(16px) saturate(1.4);border-radius:20px;padding:14px 16px;box-shadow:inset 0 1px 0 rgba(255,255,255,.6),0 16px 40px -18px rgba(11,29,58,.35);color:var(--ink)}
.hp-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.hp-title{margin:0;font-size:12.5px;font-weight:600;letter-spacing:-.01em;color:var(--ink)}
.hp-tag{font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#3b5bdb;background:rgba(91,124,240,.12);border-radius:999px;padding:3px 9px}
.hp-body{display:flex;gap:14px;margin-top:12px;align-items:flex-start}
.hp-qr{flex:none;width:88px;height:88px;border-radius:10px;background:#fff;padding:7px;box-shadow:inset 0 0 0 1px rgba(11,29,58,.1)}
.hp-qr svg{display:block;width:100%;height:100%}
.hp-rows{margin:0;display:grid;gap:7px;font-size:12.5px;line-height:1.35}
.hp-rows dt{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:#5a6b8a}
.hp-rows dd{margin:1px 0 0;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
.hp-rows .mono{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;word-break:break-all}
.hp-foot{margin:12px 0 0;padding-top:10px;border-top:1px solid rgba(11,29,58,.08);display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--ink-2)}
.hp-dot{width:8px;height:8px;border-radius:999px;background:#16a34a;flex:none}
.hp-note{margin:10px 0 0;font-size:11px;line-height:1.45;color:#5a6b8a}
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
/* Round 7: local fallback when the remote ship image fails (see
   ShipImage in letter-reveal.tsx) — a deep-navy fjord gradient panel,
   same box as the photo, so the split never shows a broken image. */
.ship-fallback{width:100%;height:100%;min-height:70vh;background:radial-gradient(90% 60% at 70% 20%,rgba(143,213,241,.28),transparent 60%),radial-gradient(70% 50% at 20% 85%,rgba(91,124,240,.22),transparent 60%),linear-gradient(160deg,#16324f 0%,#0e1f3d 45%,#0a1830 100%)}
/* --- after the scenes: keep the fixed white atmo covered --- */
.halden-rest{position:relative;z-index:2;background:var(--surface)}
@media (max-width:820px){
  #h1{top:17vh;font-size:7.4vw;white-space:normal}
  .trust{top:42vh;max-width:none}
  .hero-ctas{bottom:6vh}
  .hbtn.lg{height:52px;padding:0 52px 0 22px;font-size:15px}
  .hbtn.lg .hdot{width:12px;height:12px;right:20px}
  .hbtn.lg .hdot svg{width:14px;height:14px}
  .hbtn.lg:hover .hdot{width:40px;height:40px;right:6px}
  .hbtn-ghost{height:52px;padding:0 22px;font-size:15px}
  /* Preview card sits in the freed slot between the trust line and the
     CTAs (portrait phones only — hidden on short/landscape screens). */
  .hero-preview{left:var(--gut);right:var(--gut);top:52vh;bottom:auto;width:auto;padding:13px 15px}
  .hp-qr{width:84px;height:84px}
  .hp-note{display:none}
  #stmt{white-space:normal;font-size:23px;max-width:15em;margin-inline:auto}
  #stmt br{display:none}
  .split{grid-template-columns:1fr;grid-template-rows:auto 70vh}
  #h2{padding:16vh 0 0 6vw}
  #row{grid-template-columns:1fr;padding:3vh 6vw 6vh}
  .split-r{min-height:70vh}
}
/* Round 7 (bug 4): landscape / short viewports. The 560px min-height
   plus the 66px nav spacer put the CTA ~230px below the fold on a
   ~360px-high landscape phone. Shrink the hero to 300px, pull the
   headline/trust up, use the compact 48px CTA, and hide the preview
   card — measured fit at 360px height: CTA occupies page y 304–352,
   inside the 360px fold. */
@media (max-height:540px){
  .halden-hero{min-height:300px}
  #h1{top:7vh;font-size:clamp(24px,4vw,36px)}
  .trust{top:47vh;font-size:14px;max-width:52vw}
  .hero-ctas{bottom:4vh}
  .hbtn.lg{height:48px;padding:0 48px 0 20px;font-size:15px}
  .hbtn.lg .hdot{right:18px}
  .hbtn-ghost{height:48px;padding:0 20px;font-size:15px}
  .hero-preview{display:none}
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

/**
 * Decorative QR-style motif for the hero preview card (Round 7). It is
 * NOT a scannable QR code — a fixed 15×15 pattern with finder squares
 * at three corners and deterministic filler. The card is labelled an
 * illustration; nothing here should ever be scanned or paid against.
 */
function QrMotif() {
  const N = 15;
  const cells: { x: number; y: number }[] = [];
  const finder = (ox: number, oy: number) => {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const edge = x === 0 || x === 6 || y === 0 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        if (edge || core) cells.push({ x: ox + x, y: oy + y });
      }
    }
  };
  finder(0, 0);
  finder(N - 7, 0);
  finder(0, N - 7);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const inFinder = (x < 8 && y < 8) || (x >= N - 8 && y < 8) || (x < 8 && y >= N - 8);
      if (inFinder) continue;
      if ((x * 7 + y * 13 + 3) % 5 < 2) cells.push({ x, y });
    }
  }
  return (
    <svg viewBox={`0 0 ${N} ${N}`} aria-hidden="true" focusable="false">
      {cells.map((c, i) => (
        <rect key={i} x={c.x} y={c.y} width="1" height="1" fill="#0b1d3a" />
      ))}
    </svg>
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
          </div>
          <aside className="hero-preview fade-up" style={{ "--d": "1.45s" } as React.CSSProperties} aria-label="Example order — illustration, not a live payment">
            <div className="hp-head">
              <p className="hp-title">Example order</p>
              <span className="hp-tag">Illustration</span>
            </div>
            <div className="hp-body">
              <div className="hp-qr" aria-hidden="true"><QrMotif /></div>
              <dl className="hp-rows">
                <div>
                  <dt>Order</dt>
                  <dd className="mono">ORD20261111A1B2C3</dd>
                </div>
                <div>
                  <dt>Amount</dt>
                  <dd>₹500.00</dd>
                </div>
                <div>
                  <dt>Unique QR payable</dt>
                  <dd>₹500.01</dd>
                </div>
              </dl>
            </div>
            <p className="hp-foot"><span className="hp-dot" aria-hidden="true" /> Paid — provider-verified</p>
            <p className="hp-note">Example only — decorative motif, not a scannable QR.</p>
          </aside>
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
                Order numbers look like <code className="kbd">ORD20261111A1B2C3</code> for live orders and <code className="kbd">TST…</code> for sandbox orders.
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

          {/* Pricing — honest: the gateway itself is free. */}
          <section id="pricing" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-12 sm:px-6 sm:py-16">
            <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
              <div>
                <Reveal><SectionLabel>Pricing</SectionLabel><SectionTitle animated>Simple and transparent</SectionTitle></Reveal>
                <p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
                  <LetterReveal variant="word">There is no plan, no tier and no per-transaction cut. The costs that exist are the ones you can already see: your hosting, and whatever your bank or PG charges you directly.</LetterReveal>
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

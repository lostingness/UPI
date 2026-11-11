// Testimonials marquee (Round 6) — liquid-glass cards, slow scroll,
// pause on hover. Every card carries a visible "Sample" tag and the
// section says so plainly: these are illustrative, generic examples of
// how a merchant might use the gateway — NO invented people, NO fake
// merchant names presented as real customers (Round 3 precedent:
// sample-labelled, never real).
const CARDS: { quote: string; context: string }[] = [
  {
    quote: "We ran the sandbox end to end — six outcomes, no real money — before we ever went live.",
    context: "Sandbox walkthrough",
  },
  {
    quote: "One printed QR on the counter, and every ₹99 sale lands in our own account.",
    context: "Counter QR",
  },
  {
    quote: "The UTR review queue meant we stopped chasing payment screenshots in chat.",
    context: "UTR review",
  },
  {
    quote: "One API call creates the order; the webhook tells us the second it is paid.",
    context: "API orders",
  },
  {
    quote: "Provider-verified or it is not paid — that rule is the whole reason we self-host.",
    context: "Verification",
  },
];

const TESTIMONIAL_CSS = `
.sample-tag{display:inline-flex;align-items:center;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;background:rgba(91,124,240,.12);color:#3b5bdb}
.tst{position:relative;background:var(--surface,#fff)}
.tst .marquee{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)}
.tst .marquee-track{display:flex;width:max-content;gap:16px;animation:tst-marquee 46s linear infinite}
.tst .marquee:hover .marquee-track{animation-play-state:paused}
@keyframes tst-marquee{to{transform:translateX(-50%)}}
.tst-card{position:relative;width:340px;max-width:82vw;flex:none;border-radius:20px;padding:22px;background:rgba(255,255,255,.72);-webkit-backdrop-filter:blur(20px) saturate(1.4);backdrop-filter:blur(20px) saturate(1.4);box-shadow:inset 0 1px 0 0 rgb(255 255 255/.55),inset 0 -1px 0 0 rgb(0 0 0/.04),0 8px 24px -12px rgb(11 29 58/.18)}
.tst-card::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;background:linear-gradient(135deg,rgb(255 255 255/.7),rgb(255 255 255/.08) 40%,rgb(0 0 0/.06) 75%,rgb(255 255 255/.35));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.tst-card blockquote{margin:0;font-size:15px;line-height:1.5;color:#0b1d3a}
.tst-card footer{margin-top:14px;display:flex;align-items:center;gap:8px;font-size:12.5px;color:#1d2f4f}
@media (prefers-reduced-motion:reduce){.tst .marquee-track{animation:none}}
`;

export function Testimonials() {
  const doubled = [...CARDS, ...CARDS];
  return (
    <section className="tst" aria-label="Sample merchant stories">
      <style>{TESTIMONIAL_CSS}</style>
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--accent-text)]">Sample stories</p>
        <h2 className="mt-2 max-w-2xl text-2xl font-medium tracking-[-0.02em] text-[var(--text)] sm:text-3xl">
          How merchants use the gateway
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)] sm:text-base">
          Illustrative examples, not real customer testimonials — no merchant names or quotes here come from a real customer.
        </p>
      </div>
      <div className="marquee pb-14" aria-hidden="true">
        <div className="marquee-track">
          {doubled.map((c, i) => (
            <article key={`${c.context}-${i}`} className="tst-card">
              <span className="sample-tag">Sample</span>
              <blockquote className="mt-3">&ldquo;{c.quote}&rdquo;</blockquote>
              <footer>
                <span aria-hidden="true">—</span> Sample · {c.context}
              </footer>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

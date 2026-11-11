// Halden logo marks + marquee (Round 6).
// The 8 wordmarks are FICTIONAL SAMPLES — never real partners. The
// marquee section carries a visible "Sample" tag and a plain-language
// note saying so; the hero grid reuses the same marks (aria-hidden there,
// the marquee is the labelled copy). Wordmark is also imported by
// app/page.tsx for the hero logo grid.
import type { CSSProperties, ReactNode } from "react";

export type HaldenMark = {
  label: string;
  /** Inline text style for the wordmark (size/weight/spacing per spec). */
  text: CSSProperties;
  /** 20px-tall icon, or null for text-only marks (Nordhavn, TIDELINE). */
  icon?: ReactNode;
};

const MARK_COLOUR = "#3e4d68";

function icon(svg: ReactNode): ReactNode {
  return (
    <span className="hl-mark-icon" aria-hidden="true" style={{ display: "inline-flex", height: 20, alignItems: "center" }}>
      {svg}
    </span>
  );
}

export const HALDEN_MARKS: HaldenMark[] = [
  {
    label: "OCEANEX",
    text: { fontSize: 13, fontWeight: 600, letterSpacing: ".06em" },
    icon: icon(
      <svg width="24" height="20" viewBox="0 0 24 20" fill="none" stroke={MARK_COLOUR} strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
        <path d="M2 7 Q6.5 3 12 7 T22 7" />
        <path d="M2 13.5 Q6.5 9.5 12 13.5 T22 13.5" />
      </svg>,
    ),
  },
  {
    label: "Nordhavn",
    text: { fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", fontWeight: 700, fontSize: 15, letterSpacing: ".02em" },
  },
  {
    label: "BLUEGATE",
    text: { fontSize: 13, fontWeight: 600, letterSpacing: ".06em" },
    icon: icon(
      <svg width="20" height="20" viewBox="0 0 20 20" fill={MARK_COLOUR} aria-hidden="true">
        <rect x="1" y="10" width="4" height="10" />
        <rect x="8" y="5" width="4" height="15" />
        <rect x="15" y="8" width="4" height="12" />
      </svg>,
    ),
  },
  {
    label: "KELPWAY",
    text: { fontSize: 11, fontWeight: 500, letterSpacing: ".32em" },
    icon: icon(
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={MARK_COLOUR} strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 3.5 17.5 17 H2.5 Z" />
      </svg>,
    ),
  },
  {
    label: "TIDELINE",
    text: {
      fontSize: 16,
      fontWeight: 800,
      letterSpacing: "-.02em",
      border: `2px solid ${MARK_COLOUR}`,
      borderRadius: 4,
      padding: "2px 7px",
    },
  },
  {
    label: "HARBORIX",
    text: { fontSize: 13, fontWeight: 600, letterSpacing: ".06em" },
    icon: icon(
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={MARK_COLOUR} strokeWidth="3" strokeLinecap="round" aria-hidden="true">
        <path d="M4 3v14M16 3v14M4 10h12" />
      </svg>,
    ),
  },
  {
    label: "seaflux",
    text: { fontSize: 15, fontWeight: 500, letterSpacing: ".06em", textTransform: "lowercase" },
    icon: icon(
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={MARK_COLOUR} strokeWidth="1.5" aria-hidden="true">
        <circle cx="10" cy="10" r="7" />
        <circle cx="10" cy="10" r="2" fill={MARK_COLOUR} stroke="none" />
      </svg>,
    ),
  },
  {
    label: "PORTERRA",
    text: { fontSize: 11, fontWeight: 600, letterSpacing: ".24em" },
    icon: icon(
      <svg width="24" height="20" viewBox="0 0 24 20" fill={MARK_COLOUR} aria-hidden="true">
        <path d="M1 18 L8 5 L12 12 L15.5 7 L23 18 Z" />
      </svg>,
    ),
  },
];

export function Wordmark({ mark }: { mark: HaldenMark }) {
  return (
    <span className="hl-mark" style={{ display: "inline-flex", alignItems: "center", gap: 7, color: MARK_COLOUR, whiteSpace: "nowrap" }}>
      {mark.icon}
      <span className="hl-mark-text" style={mark.text}>
        {mark.label}
      </span>
    </span>
  );
}

const MARQUEE_CSS = `
.hl-marquee{background:#fff;color:var(--ink,#0b1d3a)}
.hl-marquee .marquee-head{display:flex;flex-wrap:wrap;align-items:center;gap:12px}
.sample-tag{display:inline-flex;align-items:center;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;background:rgba(91,124,240,.12);color:#3b5bdb}
.hl-marquee .marquee{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
.hl-marquee .marquee-track{display:flex;width:max-content;animation:hl-marquee 38s linear infinite}
.hl-marquee .marquee:hover .marquee-track{animation-play-state:paused}
.hl-marquee .marquee-item{display:flex;align-items:center;padding-right:64px}
@keyframes hl-marquee{to{transform:translateX(-50%)}}
@media (prefers-reduced-motion:reduce){.hl-marquee .marquee-track{animation:none}}
`;

/** Infinite scrolling row of the 8 fictional wordmarks, duplicated for a
 * seamless loop. Slow scroll, pause on hover. */
export function LogoMarquee() {
  const doubled = [...HALDEN_MARKS, ...HALDEN_MARKS];
  return (
    <section className="hl-marquee" aria-label="Sample wordmarks">
      <style>{MARQUEE_CSS}</style>
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="marquee-head">
          <span className="sample-tag">Sample</span>
          <p className="m-0 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
            The wordmarks below are fictional samples made for this page — not real partners, customers, or integrations.
          </p>
        </div>
      </div>
      <div className="marquee pb-14" aria-hidden="true">
        <div className="marquee-track">
          {doubled.map((m, i) => (
            <span key={`${m.label}-${i}`} className="marquee-item">
              <Wordmark mark={m} />
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

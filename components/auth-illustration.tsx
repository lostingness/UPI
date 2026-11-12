// Round 8 — payment-themed illustration for the auth pages.
// Purpose-built inline SVG (no stock photo, no fake screenshot, no
// invented logo): a phone showing an abstract UPI QR motif, a paid
// receipt card and a security shield. The ₹500.00 → ₹500.01 amounts
// are the landing page's real Unique-QR example, labelled as an
// illustration by the surrounding panel copy — nothing here claims to
// be a live payment or a scannable code (the QR grid is decorative:
// three finder squares + scattered modules, not a real encoding).
// Colours come from the design tokens (var(--surface) / --text /
// --accent-strong / --border) so the drawing adapts to light + dark.
// The floating groups use .auth-float (globals.css) — gentle rise,
// disabled under prefers-reduced-motion by the global rule.
const QR_MODULES: [number, number][] = [
  [3, 0], [3, 1], [4, 3], [5, 3], [6, 4], [3, 4], [4, 5], [6, 5], [3, 6], [5, 6],
];

/** One QR finder square (3x3 modules) at grid position (gx, gy). */
function Finder({ gx, gy }: { gx: number; gy: number }) {
  const x = 199 + gx * 14;
  const y = 82 + gy * 14;
  return (
    <g fill="var(--text)">
      <rect x={x} y={y} width={40} height={40} rx={3} />
      <rect x={x + 7} y={y + 7} width={26} height={26} rx={2} fill="var(--surface-2)" />
      <rect x={x + 14} y={y + 14} width={12} height={12} rx={2} />
    </g>
  );
}

export function AuthIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 380"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* soft background blobs — accent tints only */}
      <circle cx={240} cy={190} r={175} fill="var(--accent)" opacity={0.06} />
      <circle cx={400} cy={60} r={80} fill="#2fe0d0" opacity={0.07} />
      <circle cx={60} cy={320} r={70} fill="var(--accent)" opacity={0.05} />

      {/* dashed connector: shield -> phone */}
      <path
        d="M112 92 C 138 108, 150 128, 166 150"
        fill="none"
        stroke="var(--faint)"
        strokeWidth={1.5}
        strokeDasharray="4 5"
        opacity={0.6}
      />
      <circle cx={420} cy={200} r={3} fill="var(--accent)" opacity={0.5} />
      <circle cx={140} cy={330} r={3} fill="var(--accent)" opacity={0.4} />
      <circle cx={440} cy={300} r={2.5} fill="#2fe0d0" opacity={0.6} />

      {/* shield badge — provider verification */}
      <g className="auth-float" style={{ "--d": "0s" } as React.CSSProperties}>
        <circle cx={86} cy={80} r={30} fill="var(--surface)" stroke="var(--border)" strokeWidth={1} />
        <path
          d="M86 62 L100 67 V79 C100 89 94 95 86 98 C78 95 72 89 72 79 V67 Z"
          fill="none"
          stroke="var(--accent-text)"
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
        <polyline
          points="79,79 84,84 93,73"
          fill="none"
          stroke="#16a34a"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* rupee coin */}
      <g className="auth-float" style={{ "--d": "1.2s" } as React.CSSProperties}>
        <circle cx={402} cy={104} r={26} fill="var(--accent-strong)" />
        <circle cx={402} cy={104} r={26} fill="none" stroke="var(--border)" strokeWidth={1} />
        <text
          x={402}
          y={112}
          textAnchor="middle"
          fontSize={24}
          fontWeight={700}
          fill="#ffffff"
          fontFamily="Bricolage Grotesque, Inter, sans-serif"
        >
          ₹
        </text>
      </g>

      {/* phone with abstract UPI QR */}
      <g>
        <rect x={170} y={40} width={150} height={290} rx={26} fill="var(--surface)" stroke="var(--border)" strokeWidth={1} />
        <rect x={215} y={52} width={60} height={10} rx={5} fill="var(--text)" opacity={0.15} />
        <rect x={182} y={64} width={126} height={196} rx={12} fill="var(--surface-2)" />
        <Finder gx={0} gy={0} />
        <Finder gx={4} gy={0} />
        <Finder gx={0} gy={4} />
        {QR_MODULES.map(([mx, my]) => (
          <rect
            key={`${mx}-${my}`}
            x={199 + mx * 14}
            y={82 + my * 14}
            width={11.5}
            height={11.5}
            rx={2}
            fill="var(--text)"
            opacity={0.85}
          />
        ))}
        {/* scan line */}
        <rect x={199} y={124} width={96} height={2.5} rx={1.25} fill="var(--accent-text)" opacity={0.55} />
        <text
          x={245}
          y={208}
          textAnchor="middle"
          fontSize={19}
          fontWeight={600}
          fill="var(--text)"
          fontFamily="Bricolage Grotesque, Inter, sans-serif"
        >
          ₹500.00
        </text>
        <text x={245} y={228} textAnchor="middle" fontSize={11} fill="var(--muted)" fontFamily="Inter, sans-serif">
          Scan to pay
        </text>
        <rect x={225} y={246} width={40} height={4} rx={2} fill="var(--faint)" />
      </g>

      {/* paid receipt card */}
      <g className="auth-float" style={{ "--d": "0.6s" } as React.CSSProperties}>
        <rect x={28} y={240} width={196} height={88} rx={16} fill="var(--surface)" stroke="var(--border)" strokeWidth={1} />
        <circle cx={46} cy={264} r={5} fill="#16a34a" />
        <text x={58} y={268} fontSize={13} fontWeight={600} fill="var(--text)" fontFamily="Inter, sans-serif">
          Paid
        </text>
        <circle cx={196} cy={264} r={11} fill="var(--accent-strong)" />
        <polyline
          points="191,264 195,268 201,260"
          fill="none"
          stroke="#ffffff"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <text x={40} y={296} fontSize={17} fontWeight={600} fill="var(--text)" fontFamily="ui-monospace, Menlo, monospace">
          ₹500.01
        </text>
        <text x={40} y={314} fontSize={10.5} fill="var(--muted)" fontFamily="Inter, sans-serif">
          Provider-verified · Unique QR
        </text>
      </g>
    </svg>
  );
}

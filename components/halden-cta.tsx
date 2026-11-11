// Halden dot-arrow button (Round 6). The .hbtn styles live in the page
// <style> (globals.css is off-limits); the class name is .hbtn, not .btn,
// so it never collides with the app-wide .btn in globals.css.
// Base: 42px pill, navy fill, 13.5px/500, dot 10px at right:16px holding a
// 12px chevron (opacity 0, -4px). Hover: dot grows to 32px at right:5px,
// glow off, chevron fades/slides in. Large: 62px, 17px, dot 14px at
// right:24px, chevron 16px, hover dot 48px at right:7px.
// All primary landing CTAs use this, labelled "Get started" on the hero.
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

export function HaldenCta({
  href,
  label,
  large = false,
  className = "",
  style,
  children,
}: {
  href: string;
  label?: string;
  large?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <Link href={href} style={style} className={`hbtn${large ? " lg" : ""}${className ? ` ${className}` : ""}`}>
      <span>{children ?? label}</span>
      <span className="hdot" aria-hidden="true">
        <svg viewBox="0 0 12 12" fill="none" stroke="#0b1d3a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4.5 2.5 8 6l-3.5 3.5" />
        </svg>
      </span>
    </Link>
  );
}

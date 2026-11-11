// Route protection + security headers (port of bootstrap/app.php wiring).
// - /dashboard/* and /admin/* require a valid session cookie; /admin/*
//   additionally requires role=admin (the 900 s password-confirm gate is
//   enforced per-API-route in requireAdminConfirmed).
// - /api/v1/* auth is per-route (API keys), not here.
// - CSP (from SecurityHeaders middleware): default-src 'self'; script-src
//   'self'; style-src 'self' 'unsafe-inline' fonts.googleapis.com; font-src
//   'self' fonts.gstatic.com; img-src 'self' data:; connect-src 'self';
//   form-action 'self' + PG hosts (Paytm sandbox+prod, PhonePe api-preprod +
//   api.phonepe.com); frame-ancestors 'none'; base-uri 'self'; object-src 'none'.
//   Enforcing vs report-only via GATEWAY_CSP_ENFORCE. The matcher covers
//   /pay/:path* too — the public pay page (QR, deep links, UTR form) had no
//   CSP header at all before 2026-11-11 (verified live: /pay returned 200
//   with no content-security-policy while /dashboard had it). Round 4 added
//   "/" and "/login/:path*" — the landing page and login had no CSP either.
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const CSP = [
  "default-src 'self'",
  // 'unsafe-inline' is REQUIRED for script-src: Next.js App Router inlines
  // its RSC/flight bootstrap scripts (self.__next_r / self.__next_f) into
  // every document. Without it the browser blocks those scripts, the
  // request ID is never defined, hydration throws InvariantError and every
  // client interaction on the matched routes (/dashboard, /settings,
  // /orders, /accounts, /admin) is dead on a full page load — verified
  // live 2026-11-11: full-load /dashboard had 0 React fibers + the
  // invariant error, while client-side navigation from /login hydrated.
  // style-src already uses 'unsafe-inline'; React escapes rendered data,
  // so user content cannot inject script through the app.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
  // Meridian fonts are served at runtime from fonts.cdnfonts.com (TeX Gyre
  // woff files — @fontsource/tex-gyre-* does not exist on npm and Google
  // Fonts does not carry them), so it must be an allowed font source here
  // or the fonts are blocked on matcher routes.
  "font-src 'self' fonts.gstatic.com https://fonts.cdnfonts.com",
  "img-src 'self' data: https://d2ol7oe51mr4n9.cloudfront.net",
  // Meridian hero video/poster host (video + poster must not be blocked on
  // matcher routes — the hero video is served from this CloudFront host).
  "media-src 'self' https://d2ol7oe51mr4n9.cloudfront.net",
  "connect-src 'self'",
  "form-action 'self' https://securestage.paytmpayments.com https://secure.paytmpayments.com https://api-preprod.phonepe.com https://api.phonepe.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

function sessionSecret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    // Fail closed in production — no dev fallback is ever trusted there
    // (same rule as lib/auth.ts). Local dev keeps the fixed fallback.
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is not set");
    return new TextEncoder().encode("dev-only-session-secret-do-not-use-in-production");
  }
  return new TextEncoder().encode(s);
}

export async function middleware(req: NextRequest) {
  const headerName = process.env.GATEWAY_CSP_ENFORCE === "false" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
  // Every response the middleware returns — including the /login redirects
  // and the admin 403 — carries the CSP header, not just NextResponse.next().
  const withCsp = <T extends Response>(r: T): T => { r.headers.set(headerName, CSP); return r; };
  const res = withCsp(NextResponse.next());

  const path = req.nextUrl.pathname;
  const isDashboard = path.startsWith("/dashboard") || path.startsWith("/orders") || path.startsWith("/accounts") || path.startsWith("/settings");
  const isAdmin = path.startsWith("/admin");
  if (!isDashboard && !isAdmin) return res;

  const token = req.cookies.get("upi-gateway-session")?.value;
  if (!token) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", path);
    return withCsp(NextResponse.redirect(login));
  }
  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    if (isAdmin && payload.role !== "admin") return withCsp(new Response("Forbidden", { status: 403 }));
  } catch {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", path);
    return withCsp(NextResponse.redirect(login));
  }
  return res;
}

export const config = {
  // Round 4: "/" and "/login" added — the landing page and login had no CSP
  // header at all (only /dashboard, /admin, /orders, /accounts, /settings
  // and /pay/:path* were matched). Round 4 follow-up: "/register/:path*"
  // added too — the public register page served no CSP header at all
  // (verified live 2026-11-11). Directives unchanged: script-src 'self'
  // 'unsafe-inline' stays — Next.js inlines its RSC/flight bootstrap
  // scripts and hydration breaks without it.
  matcher: ["/", "/login/:path*", "/register/:path*", "/dashboard/:path*", "/admin/:path*", "/orders/:path*", "/accounts/:path*", "/settings/:path*", "/pay/:path*"],
};

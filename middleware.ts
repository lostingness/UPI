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
//   Enforcing vs report-only via GATEWAY_CSP_ENFORCE.
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
  "font-src 'self' fonts.gstatic.com",
  "img-src 'self' data:",
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
  const res = NextResponse.next();
  const headerName = process.env.GATEWAY_CSP_ENFORCE === "false" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
  res.headers.set(headerName, CSP);

  const path = req.nextUrl.pathname;
  const isDashboard = path.startsWith("/dashboard") || path.startsWith("/orders") || path.startsWith("/accounts") || path.startsWith("/settings");
  const isAdmin = path.startsWith("/admin");
  if (!isDashboard && !isAdmin) return res;

  const token = req.cookies.get("upi-gateway-session")?.value;
  if (!token) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }
  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    if (isAdmin && payload.role !== "admin") return new Response("Forbidden", { status: 403 });
  } catch {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }
  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/orders/:path*", "/accounts/:path*", "/settings/:path*"],
};

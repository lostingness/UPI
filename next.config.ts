import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  // Security headers that are static. CSP itself is set per-request in
  // middleware.ts (no nonce is used — the policy is a fixed string, so
  // there is nothing to inject per request).
  async headers() {
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    // HSTS only in production: emitting it from a local dev server would
    // pin localhost to HTTPS in the browser and break plain-http dev.
    if (process.env.NODE_ENV === "production") {
      headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
    }
    return [{ source: "/:path*", headers }];
  },
};
export default nextConfig;

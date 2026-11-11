// Port of app/Support/SafeUrl.php (391 lines) — SSRF-safe webhook URL validation.
// Rules: https required (http only if webhook_allow_insecure); no userinfo;
// scheme https|http; host present; port allowlist (443, +80 if insecure);
// reject raw-IP literals in decimal/hex/octal; resolve A/AAAA and reject ANY
// private/reserved/loopback/link-local/CGNAT/multicast/unspecified IPv4 or
// private IPv6 in the answer set. Resolver is injectable for tests.
import dns from "node:dns/promises";
import { gatewayConfig } from "../config/gateway";
import { ApiError } from "../errors";

export type DnsResolver = (host: string) => Promise<string[]>;

export async function defaultResolver(host: string): Promise<string[]> {
  const out: string[] = [];
  try { const a = await dns.resolve4(host); out.push(...a); } catch { /* ignore */ }
  try { const aaaa = await dns.resolve6(host); out.push(...aaaa); } catch { /* ignore */ }
  return out;
}

function fail(msg: string): never { throw new ApiError(422, msg); }

function ipv4Parts(ip: string): number[] | null {
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return m.slice(1).map(Number);
}
function isPrivateIpv4(ip: string): boolean {
  const p = ipv4Parts(ip); if (!p) return false;
  const [a, b] = p;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 0) return true; // unspecified
  if (a >= 224) return true; // multicast + reserved 240/4
  if (a === 192 && b === 0 && p[2] === 0) return true; // 192.0.0.0/24 IETF
  if (a === 192 && b === 0 && p[2] === 2) return true; // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && p[2] === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && p[2] === 113) return true; // TEST-NET-3
  return false;
}
function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true; // fe80::/10 link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local fc00::/7
  if (lower.startsWith("ff")) return true; // multicast
  if (lower.startsWith("::ffff:")) { // IPv4-mapped
    const v4 = lower.slice(7);
    return isPrivateIpv4(v4);
  }
  return false;
}
export function isPublicIp(ip: string): boolean {
  if (ip.includes(":")) return !isPrivateIpv6(ip);
  return !isPrivateIpv4(ip);
}

export interface SafeUrlResult { host: string; port: number; ips: string[]; }

export async function checkSafeUrl(url: string, resolver: DnsResolver = defaultResolver): Promise<SafeUrlResult> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { fail("The webhook URL is malformed."); }
  const scheme = parsed.protocol.replace(":", "").toLowerCase();
  if (parsed.username || parsed.password) fail("The webhook URL must not contain credentials (user:pass@).");
  const allowInsecure = gatewayConfig.webhookAllowInsecure;
  if (scheme === "http" && !allowInsecure) fail("The webhook URL must use HTTPS.");
  if (scheme !== "https" && scheme !== "http") fail("The webhook URL scheme must be https (or http if explicitly allowed).");
  const host = parsed.hostname;
  if (!host) fail("The webhook URL must have a valid host.");
  const port = parsed.port ? Number(parsed.port) : scheme === "https" ? 443 : 80;
  const allowedPorts = [443, ...(allowInsecure ? [80] : [])];
  if (!allowedPorts.includes(port)) fail(`The webhook URL port ${port} is not allowed.`);
  // Reject raw IP literals in decimal/hex/octal encodings.
  if (/^(0x[0-9a-f]+|\d+|0[0-7]+)(\.(0x[0-9a-f]+|\d+|0[0-7]+)){0,3}$/i.test(host) && /^\d/.test(host)) {
    // A dotted-quad / single-integer IP literal is never a public hostname.
    fail("The webhook URL must not use a raw IP address.");
  }
  if (host.includes(":")) {
    // IPv6 literal — check it directly.
    if (!isPublicIp(host)) fail(`The webhook URL resolves to a private IP address (${host}).`);
    return { host, port, ips: [host] };
  }
  const ips = await resolver(host);
  if (!ips.length) fail(`The webhook URL hostname '${host}' could not be resolved.`);
  for (const ip of ips) {
    if (!isPublicIp(ip)) fail(`The webhook URL resolves to a private IP address (${ip}).`);
  }
  return { host, port, ips };
}

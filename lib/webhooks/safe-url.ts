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
/** Expand an IPv6 literal into its 8 16-bit groups. Handles `::`
 * compression, dotted-quad mapped tails (::ffff:127.0.0.1) and zone ids
 * (%eth0, stripped). Returns null when the literal does not parse. */
function expandIpv6(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0];
  // Dotted-quad tail → two hex groups (e.g. ::ffff:127.0.0.1 → ::ffff:7f00:1).
  const dotted = s.match(/:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const parts = dotted[1].split(".").map(Number);
    if (parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
    s = `${s.slice(0, dotted.index)}:${((parts[0] << 8) | parts[1]).toString(16)}:${((parts[2] << 8) | parts[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parse = (side: string): number[] | null => {
    if (side === "") return [];
    const out: number[] = [];
    for (const g of side.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  if (halves.length === 1) {
    const groups = parse(halves[0]);
    return groups && groups.length === 8 ? groups : null;
  }
  const left = parse(halves[0]);
  const right = parse(halves[1]);
  if (!left || !right) return null;
  if (left.length + right.length > 7) return null;
  return [...left, ...Array<number>(8 - left.length - right.length).fill(0), ...right];
}

function isPrivateIpv6(ip: string): boolean {
  const groups = expandIpv6(ip);
  if (!groups) return true; // unparseable literal: fail closed
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  // IPv4-mapped ::ffff:a.b.c.d (dotted or hex tail) — judge the IPv4.
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    return isPrivateIpv4(`${g6 >> 8}.${g6 & 0xff}.${g7 >> 8}.${g7 & 0xff}`);
  }
  const allZero = groups.every((g) => g === 0);
  if (allZero) return true; // :: unspecified
  if (groups.slice(0, 7).every((g) => g === 0) && g7 === 1) return true; // ::1 loopback
  if (g0 >= 0xfe80 && g0 <= 0xfebf) return true; // fe80::/10 link-local
  if (g0 >= 0xfc00 && g0 <= 0xfdff) return true; // fc00::/7 unique-local
  if (g0 >= 0xff00) return true; // ff00::/8 multicast
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

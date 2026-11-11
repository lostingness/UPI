// Port of app/Support/WebhookSignature.php — byte-identical.
// sign(body, secret, timestamp?): signedPayload = "{ts}.{body}";
//   signature = HMAC-SHA256 hex; header = "t={ts},v1={signature}".
// verify: strict parse (only t and v1 allowed, exactly one '=' per pair, no
//   empty segments, no duplicates), v1 must be 64 hex chars, t digits > 0,
//   |now - t| <= tolerance (default 300 s), then timing-safe HMAC compare.
// Legacy body-only X-Signature-Legacy is retired — neither sent nor accepted.
// Docs keep the 31 Mar 2027 migration deadline for timestamped signatures.
import crypto from "node:crypto";
import { timingSafeEqual } from "../crypto";

export const DEFAULT_TOLERANCE_SECONDS = 300;

export function signWebhook(body: string, secret: string, timestamp?: number): { header: string; timestamp: number; signature: string } {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  return { header: `t=${ts},v1=${signature}`, timestamp: ts, signature };
}

export function parseSignatureHeader(header: string): Record<string, string> {
  const h = header.trim();
  if (!h) return {};
  const items: Record<string, string> = {};
  const allowed = new Set(["t", "v1"]);
  for (const pairRaw of h.split(",")) {
    const pair = pairRaw.trim();
    if (pair === "") return {};
    const parts = pair.split("=");
    if (parts.length !== 2) return {};
    const key = parts[0].trim(), val = parts[1].trim();
    if (!key || !val) return {};
    if (!allowed.has(key)) return {};
    if (key in items) return {};
    items[key] = val;
  }
  return items;
}

export function verifyWebhook(body: string, signatureHeader: string | null | undefined, secret: string, tolerance = DEFAULT_TOLERANCE_SECONDS, currentTime?: number): boolean {
  if (!signatureHeader || !signatureHeader.trim() || !secret.trim()) return false;
  const now = currentTime ?? Math.floor(Date.now() / 1000);
  const parts = parseSignatureHeader(signatureHeader);
  if (!parts.t || !parts.v1 || !/^\d+$/.test(parts.t)) return false;
  if (parts.v1.length !== 64 || !/^[0-9a-fA-F]+$/.test(parts.v1)) return false;
  const ts = Number(parts.t);
  if (ts <= 0) return false;
  if (Math.abs(now - ts) > tolerance) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  return timingSafeEqual(expected, parts.v1.toLowerCase());
}

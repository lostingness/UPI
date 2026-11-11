// Envelope encryption for stored credentials / API secrets.
// AES-256-GCM via Node crypto, keyed by ENCRYPTION_KEY (32-byte secret, base64
// or hex). NOT compatible with Laravel Crypt (APP_KEY) — there is no migration
// path for existing encrypted rows (fresh install, no production data exists).
// Format: "v1:<base64 iv>:<base64 authTag>:<base64 ciphertext>".
import crypto from "node:crypto";

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY is not set");
  // Accept base64 (44 chars incl. =) or hex (64 chars) or a raw 32-char string.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  const b64 = Buffer.from(raw, "base64");
  if (b64.length === 32) return b64;
  const buf = Buffer.from(raw, "utf8");
  if (buf.length === 32) return buf;
  throw new Error("ENCRYPTION_KEY must be a 32-byte key (base64 or hex)");
}

export function encryptText(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ct.toString("base64")}`;
}

export function decryptText(enc: string | null | undefined): string | null {
  if (!enc) return null;
  const parts = enc.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Unsupported encrypted value format");
  const key = getKey();
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const ct = Buffer.from(parts[3], "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** Constant-time string comparison (hash_equals equivalent). */
export function timingSafeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8"), bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function randomToken(prefix: string, bytes = 24): string {
  return prefix + crypto.randomBytes(bytes).toString("hex").slice(0, bytes === 40 ? 40 : 24);
}
export function newApiKey(sandbox: boolean): { key: string; secret: string } {
  const key = (sandbox ? "test_key_" : "key_") + crypto.randomBytes(18).toString("hex").slice(0, 24);
  const secret = (sandbox ? "test_sec_" : "sec_") + crypto.randomBytes(30).toString("hex").slice(0, 40);
  return { key, secret };
}
export function newWebhookSecret(sandbox: boolean): string {
  return (sandbox ? "test_whsec_" : "whsec_") + crypto.randomBytes(30).toString("hex").slice(0, 40);
}
export function sha256Hex(s: string): string { return crypto.createHash("sha256").update(s).digest("hex"); }

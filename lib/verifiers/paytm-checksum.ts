// Port of app/Support/PaytmChecksum.php (Paytm official checksum lib v2.0.2).
//
// Algorithm: signature = AES-128-CBC( SHA256_hex(payload + "|" + salt) + salt )
//   - salt: 4 chars drawn uniformly at random from a 72-char alphabet
//     '9876543210ZYXWVUTSRQPONMLKJIHGFEDCBAabcdefghijklmnopqrstuvwxyz!@#$&_'
//   - hash input = SHA256 hex of (payload + "|" + salt), then the 4-char salt
//     appended (68 ASCII chars total), encrypted with AES-128-CBC.
//   - IV is the fixed 16-char string '@@@@&&&&####$$$$'.
//   - Key = merchant key with HTML entities decoded first (PHP
//     html_entity_decode) — reproduced here with a small entity decoder for
//     the entities Paytm keys can contain (&amp; &lt; &gt; &quot; &#39; etc.).
//   - OpenSSL default options = base64 output, PKCS#7 padding.
// KEY HANDLING (important): PHP/OpenSSL silently truncates a key longer than
// 16 bytes to 16 bytes and zero-pads a shorter key to 16 bytes. Node's
// crypto.createCipheriv throws for a non-16-byte key, so this port reproduces
// the OpenSSL behaviour explicitly: take the first 16 bytes, zero-pad if
// shorter. Verified against a known vector in tests/paytm-checksum.test.ts
// (round-trip + cross-check with openssl CLI semantics via a fixed salt).
// Verify: decrypt(signature) must be >= 4 chars; recompute
// SHA256(payload + "|" + last4) + last4 and compare with timingSafeEqual.
import crypto from "node:crypto";
import { timingSafeEqual } from "../crypto";

export const PAYTM_CHECKSUM_IV = "@@@@&&&&####$$$$";
const SALT_CHARS = "9876543210ZYXWVUTSRQPONMLKJIHGFEDCBAabcdefghijklmnopqrstuvwxyz!@#$&_";

export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

/** Reproduce OpenSSL AES-128 key handling: truncate to 16 bytes / zero-pad. */
export function paytmKeyBytes(key: string): Buffer {
  const raw = Buffer.from(decodeHtmlEntities(key), "utf8");
  const out = Buffer.alloc(16, 0);
  raw.copy(out, 0, 0, Math.min(16, raw.length));
  return out;
}

function hashWithSalt(payload: string, salt: string): string {
  return crypto.createHash("sha256").update(payload + "|" + salt).digest("hex") + salt;
}

export function generatePaytmChecksum(payload: string, key: string, saltOverride?: string): string {
  const salt = saltOverride ?? Array.from({ length: 4 }, () => SALT_CHARS[crypto.randomInt(SALT_CHARS.length)]).join("");
  const cipher = crypto.createCipheriv("aes-128-cbc", paytmKeyBytes(key), Buffer.from(PAYTM_CHECKSUM_IV, "utf8"));
  return Buffer.concat([cipher.update(hashWithSalt(payload, salt), "utf8"), cipher.final()]).toString("base64");
}

export function verifyPaytmChecksum(payload: string, key: string, signature: string): boolean {
  let decrypted: string;
  try {
    const decipher = crypto.createDecipheriv("aes-128-cbc", paytmKeyBytes(key), Buffer.from(PAYTM_CHECKSUM_IV, "utf8"));
    decrypted = Buffer.concat([decipher.update(Buffer.from(signature, "base64")), decipher.final()]).toString("utf8");
  } catch { return false; }
  if (decrypted.length < 4) return false;
  return timingSafeEqual(decrypted, hashWithSalt(payload, decrypted.slice(-4)));
}

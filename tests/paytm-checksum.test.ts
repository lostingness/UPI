// MOCKED (pure crypto, no DB, no network).
// Verifies the PaytmChecksum port (lib/verifiers/paytm-checksum.ts) against the
// source algorithm: signature = AES-128-CBC(SHA256(payload|salt)+salt), fixed
// IV '@@@@&&&&####$$$$', key = merchant key with HTML entities decoded and
// OpenSSL-style truncation/zero-padding to 16 bytes.
import { describe, it, expect } from "vitest";
import { generatePaytmChecksum, verifyPaytmChecksum, paytmKeyBytes, decodeHtmlEntities } from "../lib/verifiers/paytm-checksum";
import crypto from "node:crypto";

describe("PaytmChecksum", () => {
  it("round-trips generate → verify", () => {
    const sig = generatePaytmChecksum('{"mid":"TESTMID","orderId":"ORD123"}', "testmerchantkey16");
    expect(verifyPaytmChecksum('{"mid":"TESTMID","orderId":"ORD123"}', "testmerchantkey16", sig)).toBe(true);
  });
  it("rejects a tampered payload", () => {
    const sig = generatePaytmChecksum('{"mid":"TESTMID","orderId":"ORD123"}', "testmerchantkey16");
    expect(verifyPaytmChecksum('{"mid":"TESTMID","orderId":"ORD999"}', "testmerchantkey16", sig)).toBe(false);
  });
  it("rejects a wrong key", () => {
    const sig = generatePaytmChecksum("payload", "correctkey123456");
    expect(verifyPaytmChecksum("payload", "wrongkey12345678", sig)).toBe(false);
  });
  it("rejects garbage signatures", () => {
    expect(verifyPaytmChecksum("payload", "somekey123456789", "not-base64!!!")).toBe(false);
    expect(verifyPaytmChecksum("payload", "somekey123456789", "")).toBe(false);
  });
  it("reproduces OpenSSL key handling: >16 bytes truncated, <16 zero-padded", () => {
    expect(paytmKeyBytes("12345678901234567890")).toEqual(Buffer.from("1234567890123456"));
    const short = paytmKeyBytes("abc");
    expect(short.length).toBe(16);
    expect(short.subarray(0, 3)).toEqual(Buffer.from("abc"));
    expect(short.subarray(3).every((b) => b === 0)).toBe(true);
  });
  it("decodes HTML entities on the key before use (html_entity_decode parity)", () => {
    expect(decodeHtmlEntities("a&amp;b&lt;c&gt;")).toBe("a&b<c>");
    const sig = generatePaytmChecksum("p", "a&amp;b12345678901");
    expect(verifyPaytmChecksum("p", "a&b12345678901", sig)).toBe(true);
  });
  it("matches a fixed-salt known vector computed independently with Node crypto", () => {
    // Independent computation of the algorithm (same steps, written inline).
    const payload = '{"mid":"M1","orderId":"ORD1"}', salt = "A1b2", key = "1234567890123456";
    const hash = crypto.createHash("sha256").update(payload + "|" + salt).digest("hex") + salt;
    const cipher = crypto.createCipheriv("aes-128-cbc", Buffer.from(key), Buffer.from("@@@@&&&&####$$$$"));
    const expected = Buffer.concat([cipher.update(hash, "utf8"), cipher.final()]).toString("base64");
    expect(generatePaytmChecksum(payload, key, salt)).toBe(expected);
    expect(verifyPaytmChecksum(payload, key, expected)).toBe(true);
  });
  it("salt uses only the 72-char alphabet and is 4 chars", () => {
    const sig = generatePaytmChecksum("p", "1234567890123456");
    const decipher = crypto.createDecipheriv("aes-128-cbc", Buffer.from("1234567890123456"), Buffer.from("@@@@&&&&####$$$$"));
    const plain = Buffer.concat([decipher.update(Buffer.from(sig, "base64")), decipher.final()]).toString("utf8");
    expect(plain.length).toBe(68);
    expect(/^[0-9a-f]{64}[9876543210ZYXWVUTSRQPONMLKJIHGFEDCBAabcdefghijklmnopqrstuvwxyz!@#$&_]{4}$/.test(plain)).toBe(true);
  });
});

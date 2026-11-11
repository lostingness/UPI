// MOCKED (pure HMAC, no DB, no network).
// Port of WebhookSignature tests: valid passes, tampered fails, strict header
// parsing, 5-minute tolerance, timing-safe compare.
import { describe, it, expect } from "vitest";
import { signWebhook, verifyWebhook, parseSignatureHeader } from "../lib/webhooks/signature";

const SECRET = "whsec_testsecret123";
const BODY = JSON.stringify({ event: "order.paid", data: { order_id: "ORD123" } });

describe("webhook signature", () => {
  it("valid signature passes", () => {
    const { header } = signWebhook(BODY, SECRET);
    expect(verifyWebhook(BODY, header, SECRET)).toBe(true);
  });
  it("tampered body fails", () => {
    const { header } = signWebhook(BODY, SECRET);
    expect(verifyWebhook(BODY + "x", header, SECRET)).toBe(false);
  });
  it("tampered signature fails", () => {
    const { header } = signWebhook(BODY, SECRET);
    const bad = header.replace(/v1=[0-9a-f]+/, "v1=" + "0".repeat(64));
    expect(verifyWebhook(BODY, bad, SECRET)).toBe(false);
  });
  it("wrong secret fails", () => {
    const { header } = signWebhook(BODY, SECRET);
    expect(verifyWebhook(BODY, header, "whsec_othersecret")).toBe(false);
  });
  it("stale timestamp fails (beyond 300 s tolerance)", () => {
    const { header } = signWebhook(BODY, SECRET, Math.floor(Date.now() / 1000) - 301);
    expect(verifyWebhook(BODY, header, SECRET)).toBe(false);
  });
  it("timestamp within tolerance passes", () => {
    const { header } = signWebhook(BODY, SECRET, Math.floor(Date.now() / 1000) - 299);
    expect(verifyWebhook(BODY, header, SECRET)).toBe(true);
  });
  it("future timestamp beyond tolerance fails", () => {
    const { header } = signWebhook(BODY, SECRET, Math.floor(Date.now() / 1000) + 301);
    expect(verifyWebhook(BODY, header, SECRET)).toBe(false);
  });
  it("rejects empty secret / empty header", () => {
    const { header } = signWebhook(BODY, SECRET);
    expect(verifyWebhook(BODY, header, "")).toBe(false);
    expect(verifyWebhook(BODY, "", SECRET)).toBe(false);
    expect(verifyWebhook(BODY, null, SECRET)).toBe(false);
  });
  it("strict parse: unknown params, duplicates, empty segments, multiple '=' rejected", () => {
    expect(parseSignatureHeader("t=1,v1=abc,foo=bar")).toEqual({});
    expect(parseSignatureHeader("t=1,t=2,v1=abc")).toEqual({});
    expect(parseSignatureHeader("t=1,,v1=abc")).toEqual({});
    expect(parseSignatureHeader("t=1=2,v1=abc")).toEqual({});
    expect(parseSignatureHeader("t=,v1=abc")).toEqual({});
    expect(parseSignatureHeader("t=123,v1=" + "a".repeat(64))).toEqual({ t: "123", v1: "a".repeat(64) });
  });
  it("rejects non-hex or short v1", () => {
    expect(verifyWebhook(BODY, "t=9999999999,v1=zzzz", SECRET, 300, 9999999999)).toBe(false);
    expect(verifyWebhook(BODY, "t=9999999999,v1=abcd", SECRET, 300, 9999999999)).toBe(false);
  });
});

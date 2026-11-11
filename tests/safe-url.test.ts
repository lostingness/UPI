// MOCKED (injectable DNS resolver, no DB, no real network).
// Port of WebhookSsrfTest: private/reserved IPs blocked, public hosts pass,
// http blocked in production, userinfo and bad ports rejected.
import { describe, it, expect } from "vitest";
import { checkSafeUrl, isPublicIp } from "../lib/webhooks/safe-url";

const resolver = (ips: string[]) => async (_host: string) => ips;

describe("SafeUrl", () => {
  it("public host passes", async () => {
    const r = await checkSafeUrl("https://example.com/hook", resolver(["93.184.216.34"]));
    expect(r.host).toBe("example.com"); expect(r.port).toBe(443);
  });
  it("private IPv4 answers are blocked", async () => {
    await expect(checkSafeUrl("https://evil.example/hook", resolver(["10.0.0.5"]))).rejects.toThrow();
    await expect(checkSafeUrl("https://evil.example/hook", resolver(["192.168.1.1"]))).rejects.toThrow();
    await expect(checkSafeUrl("https://evil.example/hook", resolver(["172.16.0.9"]))).rejects.toThrow();
    await expect(checkSafeUrl("https://evil.example/hook", resolver(["127.0.0.1"]))).rejects.toThrow();
    await expect(checkSafeUrl("https://evil.example/hook", resolver(["169.254.169.254"]))).rejects.toThrow();
    await expect(checkSafeUrl("https://evil.example/hook", resolver(["100.64.0.1"]))).rejects.toThrow();
  });
  it("one private IP among public answers blocks the whole host", async () => {
    await expect(checkSafeUrl("https://evil.example/hook", resolver(["93.184.216.34", "10.1.2.3"]))).rejects.toThrow();
  });
  it("raw IP literals are rejected", async () => {
    await expect(checkSafeUrl("https://93.184.216.34/hook", resolver(["93.184.216.34"]))).rejects.toThrow();
  });
  it("http is rejected when insecure webhooks are off", async () => {
    await expect(checkSafeUrl("http://example.com/hook", resolver(["93.184.216.34"]))).rejects.toThrow(/HTTPS/);
  });
  it("userinfo is rejected", async () => {
    await expect(checkSafeUrl("https://user:pass@example.com/hook", resolver(["93.184.216.34"]))).rejects.toThrow(/credentials/);
  });
  it("non-allowlisted ports are rejected", async () => {
    await expect(checkSafeUrl("https://example.com:8443/hook", resolver(["93.184.216.34"]))).rejects.toThrow(/port/);
  });
  it("unresolvable host is rejected", async () => {
    await expect(checkSafeUrl("https://nope.example/hook", resolver([]))).rejects.toThrow(/resolved/);
  });
  it("isPublicIp: IPv6 loopback / link-local / ULA blocked, public passes", () => {
    expect(isPublicIp("::1")).toBe(false);
    expect(isPublicIp("fe80::1")).toBe(false);
    expect(isPublicIp("fd00::1")).toBe(false);
    expect(isPublicIp("2606:4700:4700::1111")).toBe(true);
    expect(isPublicIp("8.8.8.8")).toBe(true);
  });
  it("isPublicIp: expanded + mapped IPv6 forms are normalised before the check", () => {
    // Expanded loopback / unspecified (the old prefix match missed these).
    expect(isPublicIp("0:0:0:0:0:0:0:1")).toBe(false);
    expect(isPublicIp("0:0:0:0:0:0:0:0")).toBe(false);
    // IPv4-mapped loopback / private, dotted and hex tails.
    expect(isPublicIp("::ffff:127.0.0.1")).toBe(false);
    expect(isPublicIp("::ffff:7f00:1")).toBe(false);
    expect(isPublicIp("0:0:0:0:0:ffff:7f00:1")).toBe(false);
    expect(isPublicIp("::ffff:192.168.0.5")).toBe(false);
    // IPv4-mapped public stays public.
    expect(isPublicIp("::ffff:93.184.216.34")).toBe(true);
    // Expanded link-local / ULA.
    expect(isPublicIp("fe80:0:0:0:0:0:0:1")).toBe(false);
    expect(isPublicIp("fc00:0:0:0:0:0:0:1")).toBe(false);
  });
  it("mapped private IPv6 answers are blocked", async () => {
    await expect(checkSafeUrl("https://evil.example/hook", resolver(["::ffff:127.0.0.1"]))).rejects.toThrow();
    await expect(checkSafeUrl("https://evil.example/hook", resolver(["0:0:0:0:0:ffff:7f00:1"]))).rejects.toThrow();
  });
});

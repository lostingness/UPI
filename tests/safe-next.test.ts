// Pure unit tests for safeNext (lib/safe-next.ts) — the open-redirect
// guard for the ?next= redirect after login / admin password confirmation.
// No DB, no network.
import { describe, it, expect } from "vitest";
import { safeNext } from "../lib/safe-next";

describe("safeNext", () => {
  it("rejects protocol-relative URLs", () => {
    expect(safeNext("//evil.example", "/dashboard")).toBe("/dashboard");
    expect(safeNext("//evil.example/admin", "/admin")).toBe("/admin");
  });
  it("rejects triple-slash URLs", () => {
    expect(safeNext("///evil.example", "/dashboard")).toBe("/dashboard");
  });
  it("rejects backslash-normalised URLs", () => {
    expect(safeNext("/\\evil.example", "/dashboard")).toBe("/dashboard");
  });
  it("rejects absolute URLs", () => {
    expect(safeNext("https://evil.example", "/dashboard")).toBe("/dashboard");
  });
  it("rejects javascript: URLs", () => {
    expect(safeNext("javascript:alert(1)", "/dashboard")).toBe("/dashboard");
  });
  it("rejects empty and null values", () => {
    expect(safeNext("", "/dashboard")).toBe("/dashboard");
    expect(safeNext(null, "/dashboard")).toBe("/dashboard");
    expect(safeNext(null, "/admin")).toBe("/admin");
  });
  it("keeps same-origin single-slash paths", () => {
    expect(safeNext("/dashboard", "/dashboard")).toBe("/dashboard");
    expect(safeNext("/admin/orders", "/admin")).toBe("/admin/orders");
  });
  it("keeps a single-slash path with a query string", () => {
    expect(safeNext("/login?x=1", "/dashboard")).toBe("/login?x=1");
  });
  it("rejects values containing control characters", () => {
    expect(safeNext("/dash" + String.fromCharCode(0) + "board", "/dashboard")).toBe("/dashboard");
  });
});

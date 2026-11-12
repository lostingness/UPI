// Round 6 Halden nav — CTA morph rule (components/liquid-nav.tsx).
// Pure logic only: the DOM measurements (wrapper width 42→142px, label
// opacity) are verified by the Playwright run, not here.
import { describe, it, expect } from "vitest";
import {
  shouldShowNavCta,
  HALDEN_STMT_THRESHOLD,
  HALDEN_HERO_SCROLL_FRACTION,
} from "../components/liquid-nav";

describe("shouldShowNavCta", () => {
  const base = { scrollY: 0, viewportH: 800 };

  it("is off on the landing page at the top with no statement progress", () => {
    expect(shouldShowNavCta({ isLanding: true, stmtP: null, ...base })).toBe(false);
    expect(shouldShowNavCta({ isLanding: true, stmtP: 0, ...base })).toBe(false);
    expect(shouldShowNavCta({ isLanding: true, stmtP: HALDEN_STMT_THRESHOLD, ...base })).toBe(false);
  });

  it("turns on once statement progress passes the threshold", () => {
    expect(
      shouldShowNavCta({ isLanding: true, stmtP: HALDEN_STMT_THRESHOLD + 0.01, ...base }),
    ).toBe(true);
  });

  it("turns back off when the statement progress drops again", () => {
    expect(shouldShowNavCta({ isLanding: true, stmtP: 0.1, ...base })).toBe(false);
  });

  it("turns on when scrolled past the hero even with no statement event", () => {
    expect(
      shouldShowNavCta({
        isLanding: true,
        stmtP: null,
        scrollY: 800 * HALDEN_HERO_SCROLL_FRACTION + 1,
        viewportH: 800,
      }),
    ).toBe(true);
    expect(
      shouldShowNavCta({
        isLanding: true,
        stmtP: null,
        scrollY: 800 * HALDEN_HERO_SCROLL_FRACTION,
        viewportH: 800,
      }),
    ).toBe(false);
  });

  it("is always on off the landing page for a guest (dashboard/docs/etc.)", () => {
    expect(shouldShowNavCta({ isLanding: false, stmtP: null, ...base })).toBe(true);
    expect(shouldShowNavCta({ isLanding: false, stmtP: 0, ...base })).toBe(true);
    expect(shouldShowNavCta({ isLanding: false, stmtP: null, authed: false, ...base })).toBe(true);
  });

  it("is never on for an authed user, on any page (Round 9)", () => {
    // Landing, even past the statement threshold / past the hero.
    expect(shouldShowNavCta({ isLanding: true, stmtP: 1, authed: true, ...base })).toBe(false);
    expect(
      shouldShowNavCta({
        isLanding: true,
        stmtP: null,
        authed: true,
        scrollY: 800 * HALDEN_HERO_SCROLL_FRACTION + 1,
        viewportH: 800,
      }),
    ).toBe(false);
    // Dashboard / orders / settings / admin — the CTA must not show.
    expect(shouldShowNavCta({ isLanding: false, stmtP: null, authed: true, ...base })).toBe(false);
    expect(shouldShowNavCta({ isLanding: false, stmtP: 0, authed: true, ...base })).toBe(false);
  });
});

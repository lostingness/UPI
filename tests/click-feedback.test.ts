// Round 9 (Worker E): click bubble pop — pure logic, no audio hardware,
// no DOM. The throttle helper, the pop spec (short, quiet, pitch drops),
// the gesture gate (silent no-op in node, never throws), and the shared
// selector / opt-out constants the global listener uses.
import { describe, it, expect, beforeEach } from "vitest";
import {
  BUBBLE_POP_SPEC,
  BUBBLE_POP_THROTTLE_MS,
  bubblePopDue,
  playBubblePop,
  __resetSoundStateForTests,
} from "../lib/sounds";
import {
  CLICKABLE_SELECTOR,
  NO_CLICK_POP_ATTR,
  PRESS_HOLD_MS,
} from "../components/click-feedback";

beforeEach(() => {
  __resetSoundStateForTests();
});

describe("bubble pop spec (short, quiet, pitch drops)", () => {
  it("is ~0.1 s, quiet, and sweeps down in pitch", () => {
    expect(BUBBLE_POP_SPEC.dur).toBeLessThanOrEqual(0.12);
    expect(BUBBLE_POP_SPEC.dur).toBeGreaterThan(0);
    expect(BUBBLE_POP_SPEC.peak).toBeLessThanOrEqual(0.15);
    expect(BUBBLE_POP_SPEC.fromHz).toBeGreaterThan(BUBBLE_POP_SPEC.toHz);
    expect(BUBBLE_POP_SPEC.toHz).toBeGreaterThan(0);
  });
  it("throttle is 80–100 ms so rapid taps never overlap into noise", () => {
    expect(BUBBLE_POP_THROTTLE_MS).toBeGreaterThanOrEqual(80);
    expect(BUBBLE_POP_THROTTLE_MS).toBeLessThanOrEqual(100);
  });
});

describe("bubble pop throttle (pure, fake clock)", () => {
  it("is due when never played, and due again after the throttle window", () => {
    expect(bubblePopDue(0, 1_000)).toBe(true);
    expect(bubblePopDue(1_000, 1_000 + BUBBLE_POP_THROTTLE_MS)).toBe(true);
    expect(bubblePopDue(1_000, 1_000 + BUBBLE_POP_THROTTLE_MS + 50)).toBe(true);
  });
  it("is NOT due inside the throttle window (rapid-click dedupe)", () => {
    expect(bubblePopDue(1_000, 1_000)).toBe(false);
    expect(bubblePopDue(1_000, 1_000 + 10)).toBe(false);
    expect(bubblePopDue(1_000, 1_000 + BUBBLE_POP_THROTTLE_MS - 1)).toBe(false);
  });
});

describe("bubble pop gate (no audio hardware here)", () => {
  it("is a silent no-op before any user gesture — never throws", () => {
    expect(playBubblePop()).toBe(false);
    expect(playBubblePop(Date.now() + 10_000)).toBe(false);
  });
});

describe("click-feedback shared constants", () => {
  it("clickable selector covers links, buttons, role=button, summary and submit inputs", () => {
    for (const part of ["a", "button", "[role='button']", "summary", "input[type='submit']"]) {
      expect(CLICKABLE_SELECTOR).toContain(part);
    }
  });
  it("opt-out attribute is a data-* attribute the SoundToggle carries", () => {
    expect(NO_CLICK_POP_ATTR).toBe("data-no-click-pop");
  });
  it("press class hold matches the 150 ms pulse animation", () => {
    expect(PRESS_HOLD_MS).toBe(140);
  });
});

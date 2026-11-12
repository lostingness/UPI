// MP3 sounds (Round 7) — file resolution, gesture gate, mute, synth
// fallback when a file cannot play, and the timer-warning dedupe
// (at most once per order per moment, never looped).
// MOCKED: lib/sounds (toggle + synth fallbacks) and the Audio element —
// no audio hardware, no network, no real files played.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const soundMocks = vi.hoisted(() => ({
  enabled: true,
  chime: vi.fn(() => true),
  tick: vi.fn(() => true),
}));

vi.mock("../lib/sounds", () => ({
  isSoundEnabled: () => soundMocks.enabled,
  playOrderCreatedTick: soundMocks.tick,
  playSuccessChime: soundMocks.chime,
  unlockAudio: () => true,
}));

import {
  MP3_FILES,
  MP3_FILE_NAMES,
  playLoginSuccessMp3,
  playOrderCreatedMp3,
  playTimerWarningMp3,
  playTxnSuccessMp3,
  unlockMp3Audio,
  __resetMp3StateForTests,
  __setAudioFactoryForTests,
  __setMp3UnlockedForTests,
} from "../lib/mp3-sounds";

const soundsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "sounds");

// Fake Audio element: records every construction + play() call. The
// behaviour switch lets a test simulate a missing/broken file.
let playBehaviour: "ok" | "throw" | "reject" = "ok";
class FakeAudio {
  static instances: FakeAudio[] = [];
  src: string;
  loop = false;
  preload = "";
  playCalls = 0;
  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }
  play(): Promise<void> {
    this.playCalls += 1;
    if (playBehaviour === "throw") throw new Error("file missing");
    if (playBehaviour === "reject") return Promise.reject(new Error("autoplay blocked"));
    return Promise.resolve();
  }
}

beforeEach(() => {
  __resetMp3StateForTests();
  FakeAudio.instances = [];
  playBehaviour = "ok";
  soundMocks.enabled = true;
  soundMocks.chime.mockClear();
  soundMocks.tick.mockClear();
  __setAudioFactoryForTests((src) => new FakeAudio(src));
  __setMp3UnlockedForTests(true);
});

describe("file resolution", () => {
  it("maps each event to a URL-encoded /sounds/ path that decodes to the real filename", () => {
    expect(Object.keys(MP3_FILES)).toEqual(["orderCreated", "txnSuccess", "loginSuccess", "timerWarning"]);
    for (const [key, url] of Object.entries(MP3_FILES)) {
      expect(url.startsWith("/sounds/")).toBe(true);
      expect(url).not.toContain(" "); // spaces must be %20
      expect(decodeURIComponent(url)).toBe(`/sounds/${MP3_FILE_NAMES[key as keyof typeof MP3_FILE_NAMES]}`);
    }
  });

  it("all four MP3 files exist on disk at the expected sizes", () => {
    const expected: Record<string, number> = {
      "payment order created.mp3": 15327,
      "txnsuccessful effect.mp3": 24807,
      "login successful.mp3": 40385,
      "timer in order.mp3": 28515,
    };
    for (const [name, size] of Object.entries(expected)) {
      const p = join(soundsDir, name);
      expect(existsSync(p), `${name} must exist in public/sounds/`).toBe(true);
      expect(statSync(p).size).toBe(size);
    }
  });
});

describe("gesture gate + mute", () => {
  it("returns false and creates no Audio before the first gesture", () => {
    __setMp3UnlockedForTests(false);
    expect(playOrderCreatedMp3()).toBe(false);
    expect(playTxnSuccessMp3()).toBe(false);
    expect(playLoginSuccessMp3()).toBe(false);
    expect(playTimerWarningMp3("ORD1", "warning")).toBe(false);
    expect(FakeAudio.instances).toHaveLength(0);
    expect(soundMocks.chime).not.toHaveBeenCalled();
  });

  it("unlockMp3Audio() arms playback", () => {
    __setMp3UnlockedForTests(false);
    expect(unlockMp3Audio()).toBe(true);
    expect(playOrderCreatedMp3()).toBe(true);
    expect(FakeAudio.instances).toHaveLength(1);
  });

  it("mute respected: no Audio created, no synth fallback, returns false", () => {
    soundMocks.enabled = false;
    expect(playOrderCreatedMp3()).toBe(false);
    expect(playTxnSuccessMp3()).toBe(false);
    expect(FakeAudio.instances).toHaveLength(0);
    expect(soundMocks.chime).not.toHaveBeenCalled();
    expect(soundMocks.tick).not.toHaveBeenCalled();
  });
});

describe("playback + synth fallback", () => {
  it("order-created plays the order MP3 (loop never set)", () => {
    expect(playOrderCreatedMp3()).toBe(true);
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].src).toBe(MP3_FILES.orderCreated);
    expect(FakeAudio.instances[0].playCalls).toBe(1);
    expect(FakeAudio.instances[0].loop).toBe(false);
    expect(soundMocks.tick).not.toHaveBeenCalled(); // no fallback needed
  });

  it("txn success and login success resolve their own files and fall back to the chime", () => {
    expect(playTxnSuccessMp3()).toBe(true);
    expect(FakeAudio.instances[0].src).toBe(MP3_FILES.txnSuccess);
    expect(playLoginSuccessMp3()).toBe(true);
    expect(FakeAudio.instances[1].src).toBe(MP3_FILES.loginSuccess);
    expect(soundMocks.chime).not.toHaveBeenCalled();
  });

  it("sync play() throw → synth fallback runs and its result is returned", () => {
    playBehaviour = "throw";
    expect(playOrderCreatedMp3()).toBe(true); // tick mock returns true
    expect(soundMocks.tick).toHaveBeenCalledTimes(1);
    expect(playTxnSuccessMp3()).toBe(true);
    expect(soundMocks.chime).toHaveBeenCalledTimes(1);
  });

  it("async play() rejection → synth fallback runs (after a tick)", async () => {
    playBehaviour = "reject";
    expect(playOrderCreatedMp3()).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(soundMocks.tick).toHaveBeenCalledTimes(1);
  });

  it("never throws when the Audio factory itself throws", () => {
    __setAudioFactoryForTests(() => {
      throw new Error("no Audio support");
    });
    expect(() => playOrderCreatedMp3()).not.toThrow();
    expect(soundMocks.tick).toHaveBeenCalledTimes(1); // fallback still runs
    expect(() => playTimerWarningMp3("ORD1", "warning")).not.toThrow();
  });
});

describe("timer warning dedupe (no double-play on re-render)", () => {
  it("same order + same moment plays once, even when called every second", () => {
    for (let i = 0; i < 60; i++) {
      expect(playTimerWarningMp3("ORD1", "warning")).toBe(i === 0);
    }
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].src).toBe(MP3_FILES.timerWarning);
  });

  it("warning and expiry are separate moments; a new order starts fresh", () => {
    expect(playTimerWarningMp3("ORD1", "warning")).toBe(true);
    expect(playTimerWarningMp3("ORD1", "expiry")).toBe(true);
    expect(playTimerWarningMp3("ORD1", "warning")).toBe(false);
    expect(playTimerWarningMp3("ORD1", "expiry")).toBe(false);
    expect(playTimerWarningMp3("ORD2", "warning")).toBe(true);
    expect(FakeAudio.instances).toHaveLength(3);
  });

  it("timer has no synth fallback — a failed play is silent, not a tick/chime", () => {
    playBehaviour = "throw";
    expect(playTimerWarningMp3("ORD1", "warning")).toBe(false);
    expect(soundMocks.tick).not.toHaveBeenCalled();
    expect(soundMocks.chime).not.toHaveBeenCalled();
  });
});

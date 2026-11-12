// MP3 payment sounds (Round 7) — real audio files in public/sounds/.
// Each event plays its own file; when a file cannot play (missing file,
// autoplay block, no Audio support) the Round 5 synthesised sound from
// lib/sounds.ts plays instead, so the merchant still hears something.
// Nothing here ever throws, and nothing plays on a UTR submit.
//
// Files (all under 90 KB, served from /sounds/):
//   - order created:  "payment order created.mp3"   (~0.9 s)
//   - txn success:    "txnsuccessful effect.mp3"    (~1.5 s)
//   - login success:  "login successful.mp3"        (~0.9 s)
//   - timer warning:  "timer in order.mp3"          (~7 s — play once at a
//     defined moment only, NEVER looped, NEVER retriggered)
//
// AUTOPLAY RULES: same as lib/sounds.ts — browsers block audio before any
// user gesture. installMp3GestureUnlock() arms one-time pointerdown /
// keydown listeners (call it wherever installGestureUnlock() is called);
// unlockMp3Audio() is safe to call from a click/submit handler. Before
// the first gesture every play function is a silent no-op returning
// false — never an error, never a rejected promise.
//
// TOGGLE: the same SOUND_ENABLED_KEY localStorage preference as the synth
// sounds (lib/sounds.ts isSoundEnabled, default ON). Mute respected
// everywhere: a muted call creates no Audio element.
//
// This module is safe to import on the server: every browser access is
// guarded, and the pure helpers (the FILES map, timer dedupe) are
// unit-tested without audio hardware.
"use client";

import {
  isSoundEnabled,
  playOrderCreatedTick,
  playSuccessChime,
  unlockAudio,
} from "./sounds";

/** URL-encoded public paths. Spaces are %20 so the URL is valid as-is. */
export const MP3_FILES = {
  /** Plays when an order is created (confirmed 201 only). */
  orderCreated: "/sounds/payment%20order%20created.mp3",
  /** Plays when a payment flips to paid (server-confirmed only). */
  txnSuccess: "/sounds/txnsuccessful%20effect.mp3",
  /** Plays after a successful login (res.ok only). */
  loginSuccess: "/sounds/login%20successful.mp3",
  /** Plays at most once in the last 60 s and once at expiry (never loops). */
  timerWarning: "/sounds/timer%20in%20order.mp3",
} as const;

export type Mp3SoundKey = keyof typeof MP3_FILES;

/** The real on-disk filenames (decoded) — kept in sync with public/sounds/. */
export const MP3_FILE_NAMES: Record<Mp3SoundKey, string> = {
  orderCreated: "payment order created.mp3",
  txnSuccess: "txnsuccessful effect.mp3",
  loginSuccess: "login successful.mp3",
  timerWarning: "timer in order.mp3",
};

// --- Gesture gate -----------------------------------------------------------
let mp3Unlocked = false;
let gestureListenersInstalled = false;

/** Test seam: reset module state (gesture flag, listeners, audio factory, timer dedupe). */
export function __resetMp3StateForTests(): void {
  if (typeof window !== "undefined") {
    window.removeEventListener("pointerdown", unlockMp3Audio);
    window.removeEventListener("keydown", unlockMp3Audio);
  }
  mp3Unlocked = false;
  gestureListenersInstalled = false;
  audioFactory = null;
  timerPlayed.clear();
}

/** Test seam: force the gesture flag (real browsers set it via a gesture). */
export function __setMp3UnlockedForTests(unlocked: boolean): void {
  mp3Unlocked = unlocked;
}

export function __isMp3UnlockedForTests(): boolean {
  return mp3Unlocked;
}

/**
 * Mark audio as unlocked (call from a user gesture: a click / submit).
 * Also unlocks the synth AudioContext so the fallback can sound.
 */
export function unlockMp3Audio(): boolean {
  mp3Unlocked = true;
  try {
    unlockAudio();
  } catch {
    /* synth unlock never breaks MP3 playback */
  }
  return mp3Unlocked;
}

/**
 * Register one-time pointerdown/keydown listeners that unlock MP3 audio
 * on the user's first interaction. Safe to call repeatedly and on the
 * server (no-op there). Call once from a root client component next to
 * installGestureUnlock().
 */
export function installMp3GestureUnlock(): void {
  if (typeof window === "undefined" || gestureListenersInstalled) return;
  gestureListenersInstalled = true;
  window.addEventListener("pointerdown", unlockMp3Audio, { passive: true });
  window.addEventListener("keydown", unlockMp3Audio);
}

// --- Playback ---------------------------------------------------------------
interface AudioLike {
  play: () => Promise<void> | void;
  loop?: boolean;
  preload?: string;
}

type AudioFactory = (src: string) => AudioLike;
let audioFactory: AudioFactory | null = null;

/** Test seam: inject a fake Audio implementation (node tests have none). */
export function __setAudioFactoryForTests(factory: AudioFactory | null): void {
  audioFactory = factory;
}

function createAudio(src: string): AudioLike | null {
  if (audioFactory) {
    try {
      return audioFactory(src);
    } catch {
      return null;
    }
  }
  if (typeof window === "undefined") return null;
  const AC = (window as unknown as { Audio?: new (src: string) => AudioLike }).Audio;
  if (typeof AC !== "function") return null;
  try {
    const audio = new AC(src);
    audio.preload = "auto";
    audio.loop = false; // never loop — the 7 s timer file is long enough once
    return audio;
  } catch {
    return null;
  }
}

/**
 * Play one MP3 file. Returns true when playback started (or the synth
 * fallback played); false when muted, before the first gesture, or when
 * no audio path exists. Never throws. A rejected play() (autoplay block,
 * missing file) falls back to the synth sound.
 */
function playMp3(key: Mp3SoundKey, fallback: () => boolean): boolean {
  if (!mp3Unlocked) return false;
  if (!isSoundEnabled()) return false;
  const audio = createAudio(MP3_FILES[key]);
  if (!audio) return fallback();
  try {
    const result = audio.play();
    if (result && typeof (result as Promise<void>).catch === "function") {
      (result as Promise<void>).catch(() => {
        fallback();
      });
    }
    return true;
  } catch {
    return fallback();
  }
}

/**
 * Order-created sound. Call ONLY after the server confirms the order
 * was created (201). Replaces the synth tick for this event; the tick
 * is the fallback when the file cannot play.
 */
export function playOrderCreatedMp3(): boolean {
  return playMp3("orderCreated", playOrderCreatedTick);
}

/**
 * Transaction-success sound. Call ONLY on the server-confirmed flip to
 * paid (pay-page poll, or a genuinely new payment_received notification).
 * Falls back to the synth success chime.
 */
export function playTxnSuccessMp3(): boolean {
  return playMp3("txnSuccess", playSuccessChime);
}

/**
 * Login-success sound. Call ONLY when the login round-trip returned ok.
 * Falls back to the synth success chime.
 */
export function playLoginSuccessMp3(): boolean {
  return playMp3("loginSuccess", playSuccessChime);
}

// --- Timer warning (dedupe: at most once per order per moment) --------------
export type TimerWarningMoment = "warning" | "expiry";
const timerPlayed = new Map<string, Set<TimerWarningMoment>>();

/**
 * Timer-warning sound for the pay page. Plays at most once per order
 * when crossing into the last 60 s ("warning") and once at expiry
 * ("expiry"). The orderNo key is the reset: a new order starts fresh.
 * The ~7 s file plays once — never looped, never retriggered for the
 * same moment. The timer has no synth fallback (there is no timer synth
 * sound); a failed play is simply silent. Returns false when already
 * played for this order + moment, muted, or before the first gesture.
 */
export function playTimerWarningMp3(orderNo: string, moment: TimerWarningMoment): boolean {
  const moments = timerPlayed.get(orderNo);
  if (moments?.has(moment)) return false;
  // A muted / pre-gesture attempt must NOT consume the one-shot moment:
  // the payer may gesture later and still deserves the warning.
  if (!mp3Unlocked || !isSoundEnabled()) return false;
  const set = moments ?? new Set<TimerWarningMoment>();
  set.add(moment); // mark before playing so a re-render never replays
  timerPlayed.set(orderNo, set);
  return playMp3("timerWarning", () => false);
}

// Payment sounds — Web Audio API synthesised sounds, NO audio files
// (Round 5). Two sounds:
//   - success chime: a pleasant 3-note ascending chime (E5 → G5 → B5)
//     when a payment succeeds — pay page when the polled status flips to
//     paid, dashboard when polling sees a new paid order.
//   - order-created tick: one soft short tick when an order is created.
// Sounds fire ONLY on real API-confirmed status changes — never on page
// load alone, never fake. The call sites (see the mount instructions in
// the Round 5 report) are responsible for that: they call these functions
// only after a server response confirms the transition.
//
// AUTOPLAY RULES: browsers block audio before any user gesture. The
// AudioContext is therefore created/resumed ONLY inside a user gesture
// (pointerdown / keydown / click). installGestureUnlock() registers the
// one-time listeners; unlockAudio() is also safe to call from a click
// handler (e.g. the SoundToggle preview). Before the first gesture every
// play function is a silent no-op that returns false — never an error,
// never a rejected promise.
//
// TOGGLE: persisted in localStorage under SOUND_ENABLED_KEY, default ON
// (but still silent until the first gesture — default ON is a preference,
// not a bypass of the autoplay rule). play functions read the stored
// value at call time, so the toggle takes effect immediately everywhere.
//
// This module is safe to import on the server: every browser access is
// guarded, and the pure helpers (noteFrequency, the note sequences, the
// storage helpers with an injected store) are unit-tested without audio
// hardware.
"use client";

export const SOUND_ENABLED_KEY = "upi-sounds-enabled";

/** Window event fired whenever the preference changes, so several mounted
 * SoundToggle instances (desktop sidebar + mobile sheet) stay in sync. */
export const SOUND_CHANGED_EVENT = "upi-sounds-changed";

export interface NoteEvent {
  /** Scientific pitch notation, e.g. "E5", "C#4", "Bb3". */
  note: string;
  /** Seconds after the sequence starts. */
  at: number;
  /** Note length in seconds. */
  dur: number;
}

/** Success chime: E5 → G5 → B5, a bright major arpeggio, ~0.65 s total. */
export const SUCCESS_CHIME_NOTES: NoteEvent[] = [
  { note: "E5", at: 0, dur: 0.22 },
  { note: "G5", at: 0.12, dur: 0.22 },
  { note: "B5", at: 0.24, dur: 0.42 },
];

/** Order-created tick: a single soft high note, ~0.12 s. */
export const ORDER_CREATED_TICK_NOTES: NoteEvent[] = [
  { note: "C6", at: 0, dur: 0.12 },
];

// --- Round 9 (Worker E): click bubble pop -----------------------------------
// A short synthesised bubble/pop for EVERY real user click, site-wide
// (see components/click-feedback.tsx). One sine blip that drops in pitch
// fast (520 Hz → 170 Hz) with a quick decay — a pop, not a beep. Quiet
// (peak 0.12) and ~0.1 s so rapid clicks never become noise; the
// throttle below dedupes them as well.
export const BUBBLE_POP_SPEC = {
  /** Pitch at the start of the pop, Hz. */
  fromHz: 520,
  /** Pitch at the end of the pop, Hz. */
  toHz: 170,
  /** Total length in seconds. */
  dur: 0.1,
  /** Peak gain (0–1). Quieter than the chime (0.18). */
  peak: 0.12,
} as const;

/** Minimum gap between two bubble pops, ms. Clicks faster than this
 * (double-taps, rapid tapping) play at most one pop — no overlap noise. */
export const BUBBLE_POP_THROTTLE_MS = 90;

/**
 * Pure throttle check: true when enough time has passed since the last
 * pop. Exported for unit tests (the real clock path is playBubblePop).
 */
export function bubblePopDue(lastPlayedAt: number, now: number = Date.now()): boolean {
  return now - lastPlayedAt >= BUBBLE_POP_THROTTLE_MS;
}

let lastBubblePopAt = 0;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    /* storage unavailable (private mode, SSR) */
  }
  return null;
}

/** True unless the merchant explicitly turned sounds off. Default ON. */
export function isSoundEnabled(storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return true;
  try {
    const v = storage.getItem(SOUND_ENABLED_KEY);
    return v !== "0" && v !== "false";
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(SOUND_ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    /* storage unavailable — the in-memory session keeps the old value */
  }
  // Notify other mounted toggles (sidebar + mobile sheet) in this tab.
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent<boolean>(SOUND_CHANGED_EVENT, { detail: enabled }));
    }
  } catch {
    /* event dispatch never breaks the toggle */
  }
}

// --- Pure pitch helper ------------------------------------------------------
// A4 = 440 Hz; semitone offsets from C. Returns null for a malformed note.
const SEMITONES: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

export function noteFrequency(note: string): number | null {
  const m = /^([A-G])(#|b)?(\d)$/.exec(note.trim());
  if (!m) return null;
  const base = SEMITONES[m[1]];
  const accidental = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  const octave = Number(m[3]);
  const midi = (octave + 1) * 12 + base + accidental;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// --- Gesture-gated AudioContext ---------------------------------------------
let audioCtx: AudioContext | null = null;
let gestureUnlocked = false;
let gestureListenersInstalled = false;

/** Test seam: reset module state (gesture flag, context, listeners, pop throttle). */
export function __resetSoundStateForTests(): void {
  if (typeof window !== "undefined") {
    window.removeEventListener("pointerdown", unlockAudio);
    window.removeEventListener("keydown", unlockAudio);
  }
  audioCtx = null;
  gestureUnlocked = false;
  gestureListenersInstalled = false;
  lastBubblePopAt = 0;
}

/**
 * Create/resume the AudioContext. MUST be called from a user gesture
 * (click / pointerdown / keydown) — calling it elsewhere creates a
 * suspended context that stays silent. Returns true when audio can play.
 */
export function unlockAudio(): boolean {
  if (typeof window === "undefined") return false;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return false;
  try {
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    gestureUnlocked = audioCtx.state === "running" || audioCtx.state === "suspended";
    return gestureUnlocked;
  } catch {
    return false;
  }
}

/**
 * Register one-time pointerdown/keydown listeners that unlock audio on
 * the merchant's first interaction with the page. Safe to call repeatedly
 * and on the server (no-op there). Call once from a root client component
 * (see the Round 5 mount instructions) — the SoundToggle click also
 * unlocks, so a page with only the toggle still works.
 */
export function installGestureUnlock(): void {
  if (typeof window === "undefined" || gestureListenersInstalled) return;
  gestureListenersInstalled = true;
  window.addEventListener("pointerdown", unlockAudio, { once: false, passive: true });
  window.addEventListener("keydown", unlockAudio, { once: false, passive: true });
}

// --- Playback ---------------------------------------------------------------
function playNotes(notes: NoteEvent[]): boolean {
  if (!gestureUnlocked || !audioCtx) return false;
  if (!isSoundEnabled()) return false;
  try {
    const ctx = audioCtx;
    const t0 = ctx.currentTime + 0.01;
    for (const n of notes) {
      const freq = noteFrequency(n.note);
      if (freq === null) continue;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      // Gentle envelope: quick attack, exponential decay — a chime, not a beep.
      const start = t0 + n.at;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + n.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + n.dur + 0.05);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Play the success chime. Returns true only when a sound actually played.
 * Call ONLY after a server response confirms a payment (pay-page poll
 * flip to paid, dashboard poll seeing a new paid order). Silent no-op
 * (false) before the first user gesture, when sounds are off, or when
 * Web Audio is unavailable — never throws.
 */
export function playSuccessChime(): boolean {
  return playNotes(SUCCESS_CHIME_NOTES);
}

/**
 * Play the soft order-created tick. Same gating as playSuccessChime:
 * call only after the server confirms the order was created (201).
 */
export function playOrderCreatedTick(): boolean {
  return playNotes(ORDER_CREATED_TICK_NOTES);
}

/**
 * Play the click bubble pop (Round 9). Returns true only when a pop
 * actually played. Call ONLY from a real user click (the global listener
 * in components/click-feedback.tsx checks event.isTrusted first) —
 * never on page load, never on a programmatic click. Gating, in order:
 *   1. throttle — at most one pop per BUBBLE_POP_THROTTLE_MS, so rapid
 *      taps never overlap into noise;
 *   2. the `upi-sounds-enabled` mute toggle (read at call time, so the
 *      toggle takes effect immediately);
 *   3. the gesture gate — silent no-op before the first user gesture
 *      (the click handler calls unlockAudio() first, so a real click
 *      always passes this).
 * Silent no-op (false) when throttled, muted, ungated, or when Web Audio
 * is unavailable — never throws.
 */
export function playBubblePop(now: number = Date.now()): boolean {
  if (!bubblePopDue(lastBubblePopAt, now)) return false;
  if (!isSoundEnabled()) return false;
  if (!gestureUnlocked || !audioCtx) return false;
  try {
    const ctx = audioCtx;
    const t0 = ctx.currentTime + 0.005;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    // Fast downward pitch sweep = the "pop": a bubble bursting.
    osc.frequency.setValueAtTime(BUBBLE_POP_SPEC.fromHz, t0);
    osc.frequency.exponentialRampToValueAtTime(BUBBLE_POP_SPEC.toHz, t0 + BUBBLE_POP_SPEC.dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(BUBBLE_POP_SPEC.peak, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + BUBBLE_POP_SPEC.dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + BUBBLE_POP_SPEC.dur + 0.02);
    lastBubblePopAt = now;
    return true;
  } catch {
    return false;
  }
}

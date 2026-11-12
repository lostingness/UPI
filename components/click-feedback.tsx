// Round 9 (Worker E): site-wide click feedback — press animation + bubble
// pop sound on EVERY clickable element, via global event delegation + global
// CSS. No component is edited to get this (notification-bell and liquid-nav
// included — the listeners below cover them automatically); the only other
// touchpoints are the `data-no-click-pop` opt-out on the SoundToggle (its
// own onClick already plays the tick preview when unmuting) and the CSS in
// app/globals.css. Mounted once in the root layout, next to BlurOverlay.
//
// MECHANISM
// - pointerdown (capture): the nearest clickable ancestor gets the
//   .click-pressed class (a 150ms scale pulse, see globals.css) and a
//   fixed-position .click-bubble ring spawns at the tap point. Both are
//   skipped under prefers-reduced-motion.
// - click (capture): if it is a REAL user click (event.isTrusted — a
//   programmatic el.click() has isTrusted=false and stays silent) on a
//   clickable element, unlockAudio() runs (the click IS a gesture, so the
//   AudioContext resumes) and playBubblePop() plays the synth pop —
//   throttled to one pop per 90ms and muted-aware (see lib/sounds.ts).
//   Keyboard activation (Enter/Space) fires click without pointerdown, so
//   the click handler also adds the press class — keyboard users get the
//   visual feedback too.
// - The press class is only added when the element has no computed
//   transform of its own (translated nav sheets, animated icons, ...),
//   so the pulse never fights an existing transform; those elements still
//   get the bubble ring. The bubble is a single fixed div appended to
//   <body> — the target element itself is never mutated (no position /
//   overflow / inline-style changes), so badges and dropdown anchors
//   anchored to a clickable element cannot shift.
"use client";

import { useEffect } from "react";
import { installGestureUnlock, playBubblePop, unlockAudio } from "@/lib/sounds";

/** What counts as clickable for press + pop feedback. */
export const CLICKABLE_SELECTOR =
  "a, button, [role='button'], summary, input[type='submit'], input[type='button'], [data-clickable]";

/**
 * Opt out of the POP SOUND for one element subtree (the press animation
 * still applies). The SoundToggle carries this: its own onClick already
 * plays the tick preview when sounds are turned back on, so a pop on the
 * same click would double the sound — and a pop when turning sounds OFF
 * would play a sound for muting.
 */
export const NO_CLICK_POP_ATTR = "data-no-click-pop";

/** How long the .click-pressed class stays on after the pointer lifts. */
export const PRESS_HOLD_MS = 140;

export function ClickFeedback() {
  useEffect(() => {
    installGestureUnlock();

    const reducedMotion = () =>
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const findClickable = (e: Event): HTMLElement | null => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest) return null;
      const el = t.closest(CLICKABLE_SELECTOR) as HTMLElement | null;
      if (!el) return null;
      if ((el as HTMLButtonElement).disabled) return null;
      if (el.getAttribute("aria-disabled") === "true") return null;
      return el;
    };

    // Element -> timer that removes .click-pressed. Cleared + re-armed on
    // every press so a fast tap-tap never leaves the class stuck.
    const pressTimers = new Map<HTMLElement, number>();

    const press = (el: HTMLElement) => {
      if (reducedMotion()) return;
      // Never override an element's own transform (translated sheet,
      // animated icon, ...). The bubble ring still shows for it.
      if (window.getComputedStyle(el).transform !== "none") return;
      el.classList.add("click-pressed");
      const prev = pressTimers.get(el);
      if (prev !== undefined) window.clearTimeout(prev);
      pressTimers.set(
        el,
        window.setTimeout(() => {
          el.classList.remove("click-pressed");
          pressTimers.delete(el);
        }, PRESS_HOLD_MS),
      );
    };

    const bubble = (x: number, y: number, size: number) => {
      if (reducedMotion()) return;
      const s = document.createElement("span");
      s.className = "click-bubble";
      s.setAttribute("aria-hidden", "true");
      s.style.left = `${x - size / 2}px`;
      s.style.top = `${y - size / 2}px`;
      s.style.width = `${size}px`;
      s.style.height = `${size}px`;
      document.body.appendChild(s);
      const remove = () => s.remove();
      s.addEventListener("animationend", remove, { once: true });
      window.setTimeout(remove, 700); // backstop if animationend never fires
    };

    const onPointerDown = (e: PointerEvent) => {
      // Right-click / aux buttons are not taps.
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const el = findClickable(e);
      if (!el) return;
      press(el);
      const rect = el.getBoundingClientRect();
      const size = Math.max(28, Math.min(Math.max(rect.width, rect.height) * 1.1, 120));
      bubble(e.clientX, e.clientY, size);
    };

    const onClick = (e: MouseEvent) => {
      const el = findClickable(e);
      // Keyboard activation has no pointerdown — the press still shows.
      if (el) press(el);
      // Sound: real user clicks on clickable elements only. A
      // programmatic el.click() has isTrusted=false and stays silent, as
      // does a click on plain text / empty space.
      if (!e.isTrusted || !el) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(`[${NO_CLICK_POP_ATTR}]`)) return;
      // The click is a user gesture: resume the AudioContext now, then the
      // pop plays (throttled + mute-checked inside playBubblePop).
      unlockAudio();
      playBubblePop();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick, true);
      pressTimers.forEach((t) => window.clearTimeout(t));
      pressTimers.clear();
    };
  }, []);

  return null;
}

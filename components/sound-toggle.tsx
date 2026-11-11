// Sound toggle — merchant preference for payment sounds (Round 5).
// Persists in localStorage `upi-sounds-enabled`, default ON (but still
// silent until the first user gesture — see lib/sounds.ts). Renders a
// neutral placeholder until mounted so SSR HTML never mismatches
// hydration (same pattern as components/theme-toggle.tsx).
// The click itself is a user gesture, so turning sounds ON unlocks audio
// and plays the soft tick once as a preview; turning OFF plays nothing.
// NOT mounted by this file — see the Round 5 mount instructions.
"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import {
  isSoundEnabled,
  setSoundEnabled,
  unlockAudio,
  playOrderCreatedTick,
  SOUND_CHANGED_EVENT,
} from "@/lib/sounds";

export function SoundToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    setEnabled(isSoundEnabled());
    // Stay in sync with the other mounted toggle (desktop sidebar +
    // mobile sheet) and with other tabs.
    const sync = (e: Event) => {
      const v = (e as CustomEvent<boolean>).detail;
      setEnabled(typeof v === "boolean" ? v : isSoundEnabled());
    };
    const syncStorage = () => setEnabled(isSoundEnabled());
    window.addEventListener(SOUND_CHANGED_EVENT, sync);
    window.addEventListener("storage", syncStorage);
    return () => {
      window.removeEventListener(SOUND_CHANGED_EVENT, sync);
      window.removeEventListener("storage", syncStorage);
    };
  }, []);

  const toggle = () => {
    const next = !(enabled ?? true);
    setSoundEnabled(next);
    setEnabled(next);
    if (next) {
      // The click is a gesture: unlock audio, then preview the tick so the
      // merchant hears that sounds are back on.
      unlockAudio();
      playOrderCreatedTick();
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={enabled === null ? "Payment sounds" : enabled ? "Turn payment sounds off" : "Turn payment sounds on"}
      title={enabled === null ? "Payment sounds" : enabled ? "Payment sounds on — click to mute" : "Payment sounds off — click to unmute"}
      style={{ touchAction: "manipulation" }}
      className="grid h-9 w-9 shrink-0 touch-manipulation place-items-center rounded-full transition-colors duration-150 hover:bg-[var(--surface-2)]"
    >
      {enabled === null ? (
        <span className="h-4 w-4 rounded-full border border-[var(--faint)]" aria-hidden="true" />
      ) : enabled ? (
        <Volume2 className="h-4 w-4" aria-hidden="true" />
      ) : (
        <VolumeX className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}

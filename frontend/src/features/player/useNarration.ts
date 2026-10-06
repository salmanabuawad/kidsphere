import { useCallback, useEffect, useRef, useState } from "react";
import type { AppLocale } from "@/i18n/config";
import { SPEECH_LANG } from "./content-locale";

function synth(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  if (!("speechSynthesis" in window) || typeof window.SpeechSynthesisUtterance !== "function") return null;
  return window.speechSynthesis;
}

/**
 * Read text aloud with the browser's own speech synthesis (local only, no
 * network calls from our side). `supported` is false when the browser has no
 * speechSynthesis; the caller then hides the button. `speak(text, onEnd)` calls
 * `onEnd` only when that text was read to the end (never after stop() or a newer speak()).
 */
export function useNarration(lang: AppLocale) {
  const [supported] = useState(() => synth() !== null);
  const [speaking, setSpeaking] = useState(false);
  const run = useRef(0);

  const stop = useCallback(() => {
    run.current += 1;
    synth()?.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      const s = synth();
      if (!s) return;
      const id = ++run.current;
      s.cancel();
      const u = new window.SpeechSynthesisUtterance(text);
      u.lang = SPEECH_LANG[lang];
      u.rate = 0.9;
      u.onend = () => {
        if (run.current !== id) return;
        setSpeaking(false);
        onEnd?.();
      };
      u.onerror = () => {
        if (run.current === id) setSpeaking(false);
      };
      setSpeaking(true);
      s.speak(u);
    },
    [lang],
  );

  // Stop talking when the player goes away.
  useEffect(
    () => () => {
      run.current += 1;
      synth()?.cancel();
    },
    [],
  );

  return { supported, speaking, speak, stop };
}

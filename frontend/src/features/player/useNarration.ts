import { useCallback, useEffect, useState } from "react";
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
 * speechSynthesis; the caller then hides the button.
 */
export function useNarration(lang: AppLocale) {
  const [supported] = useState(() => synth() !== null);
  const [speaking, setSpeaking] = useState(false);

  const stop = useCallback(() => {
    synth()?.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      const s = synth();
      if (!s) return;
      s.cancel();
      const u = new window.SpeechSynthesisUtterance(text);
      u.lang = SPEECH_LANG[lang];
      u.rate = 0.9;
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      setSpeaking(true);
      s.speak(u);
    },
    [lang],
  );

  // Stop talking when the player goes away.
  useEffect(() => () => synth()?.cancel(), []);

  return { supported, speaking, speak, stop };
}

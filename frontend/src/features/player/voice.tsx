import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Volume2, VolumeX } from "lucide-react";
import type { AppLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { SPEECH_LANG, usePlayerText } from "./content-locale";

/**
 * The games' voice: most children who play cannot read yet, so the words a game needs
 * (the question, how to play, the feedback, a card's name) are spoken with the browser's
 * own speech synthesis (local, no network calls from our side), and the screen shows
 * pictures. When sound is off or the device cannot speak, the words come back on screen
 * (`useShowWords`), so a game always works.
 */
type Voice = {
  /** Speech is possible on this device and switched on. */
  active: boolean;
  supported: boolean;
  /** "replace" stops what is being said first; "queue" waits for it. */
  say: (text: string | null | undefined, mode?: "replace" | "queue") => void;
  toggle: () => void;
};

const SILENT: Voice = { active: false, supported: false, say: () => {}, toggle: () => {} };
const VoiceContext = createContext<Voice>(SILENT);
const STORAGE_KEY = "ks_game_voice";

function synth(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  if (!("speechSynthesis" in window) || typeof window.SpeechSynthesisUtterance !== "function") return null;
  return window.speechSynthesis;
}

function storedOn(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function VoiceProvider({ lang, children }: { lang: AppLocale; children: ReactNode }) {
  const [supported] = useState(() => synth() !== null);
  const [on, setOn] = useState(storedOn);
  const active = supported && on;

  const say = useCallback(
    (text: string | null | undefined, mode: "replace" | "queue" = "replace") => {
      const s = synth();
      const words = text?.trim();
      if (!s || !active || !words) return;
      if (mode === "replace") s.cancel();
      const u = new window.SpeechSynthesisUtterance(words);
      u.lang = SPEECH_LANG[lang];
      u.rate = 0.9;
      s.speak(u);
    },
    [lang, active],
  );

  const toggle = useCallback(() => {
    setOn((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
      } catch {
        /* per-device convenience only */
      }
      if (!next) synth()?.cancel();
      return next;
    });
  }, []);

  // Stop talking when the game goes away.
  useEffect(() => () => synth()?.cancel(), []);

  const value = useMemo(() => ({ active, supported, say, toggle }), [active, supported, say, toggle]);
  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useVoice(): Voice {
  return useContext(VoiceContext);
}

/** Words are shown on screen only when they cannot be heard. */
export function useShowWords(): boolean {
  return !useVoice().active;
}

/** Say `text` each time `key` changes (a new round, a new step), replacing what was being said. */
export function useSayOnShow(text: string | null | undefined, key: unknown) {
  const { say, active } = useVoice();
  useEffect(() => {
    say(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new key (or switching sound on) speaks again
  }, [key, active]);
}

/** Text a pre-reader hears: visible only when there is no voice, always there for screen readers. */
export function Spoken({ text, className }: { text: string | null | undefined; className?: string }) {
  const show = useShowWords();
  if (!text) return null;
  return (
    <p dir="auto" className={show ? className : "sr-only"}>
      {text}
    </p>
  );
}

/** A small round speaker that says `text` again. Hidden when there is no voice. */
export function ListenButton({ text, lang, className }: { text: string | null | undefined; lang: AppLocale; className?: string }) {
  const { active, say } = useVoice();
  const t = usePlayerText(lang);
  if (!active || !text) return null;
  return (
    <button
      type="button"
      aria-label={t("player.listen")}
      title={t("player.listen")}
      onClick={() => say(text)}
      className={cn(
        "ks-press inline-flex size-14 shrink-0 items-center justify-center rounded-full border-[3px] border-ink bg-paint-sun text-on-paint shadow-lip select-none active:translate-y-[3px] active:shadow-none",
        className,
      )}
      data-testid="listen"
    >
      <Volume2 className="size-7" aria-hidden />
    </button>
  );
}

/** Sound on/off for the games (remembered on this device); absent when the device cannot speak. */
export function SoundToggle({ lang, className }: { lang: AppLocale; className?: string }) {
  const { supported, active, toggle } = useVoice();
  const t = usePlayerText(lang);
  if (!supported) return null;
  const label = active ? t("player.soundOff") : t("player.soundOn");
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={toggle}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-full border-2 border-line-strong bg-surface text-ink-muted hover:bg-tray",
        className,
      )}
      data-testid="sound-toggle"
    >
      {active ? <Volume2 className="size-5" aria-hidden /> : <VolumeX className="size-5" aria-hidden />}
    </button>
  );
}

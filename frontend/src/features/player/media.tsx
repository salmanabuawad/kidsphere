import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Music, Music2 } from "lucide-react";
import type { AppLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { usePlayerText } from "./content-locale";

/**
 * Library media of a piece of content (backend services/library_media.py): one file per slot.
 * Slots: cover, music, page:N (story picture), narration:N (story audio), step:N (activity
 * picture or clip). Files come from GET /api/library/media/{id} (same origin, so the CSP allows them).
 */
export type MediaRef = {
  id: string;
  slot: string;
  kind: "image" | "audio" | "video";
  mime: string;
  url: string;
  alt: string | null;
  credit: string | null;
  updated_at?: string | null;
};

export type MediaResolver = { get: (slot: string) => MediaRef | null; all: MediaRef[] };

export const NO_MEDIA: MediaResolver = { get: () => null, all: [] };

export function mediaResolver(media: MediaRef[] | null | undefined): MediaResolver {
  if (!media || media.length === 0) return NO_MEDIA;
  const bySlot = new Map(media.map((m) => [m.slot, m]));
  return { get: (slot) => bySlot.get(slot) ?? null, all: media };
}

const MediaContext = createContext<MediaResolver>(NO_MEDIA);

export function MediaProvider({ value, children }: { value: MediaResolver; children: ReactNode }) {
  return <MediaContext.Provider value={value}>{children}</MediaContext.Provider>;
}

export function useMedia(): MediaResolver {
  return useContext(MediaContext);
}

/** Start playback; `onFail` runs when the browser refuses (some return no promise at all). */
function start(a: HTMLAudioElement, onFail: () => void) {
  try {
    const p = a.play() as Promise<void> | undefined;
    if (p && typeof p.catch === "function") p.catch(onFail);
  } catch {
    onFail();
  }
}

/** Plays one audio file; `play(url, onEnd)` stops whatever was playing first. */
export function useAudioClip() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const stop = useCallback(() => {
    audio.current?.pause();
    audio.current = null;
    setPlaying(false);
  }, []);
  const play = useCallback(
    (url: string, onEnd?: () => void) => {
      stop();
      const a = new Audio(url);
      audio.current = a;
      a.onended = () => {
        if (audio.current !== a) return;
        setPlaying(false);
        onEnd?.();
      };
      setPlaying(true);
      start(a, () => setPlaying(false));
    },
    [stop],
  );
  useEffect(() => stop, [stop]);
  return { playing, play, stop };
}

/**
 * Background music of the content: off until tapped, soft and looping; it stops when the
 * player closes. Hidden when the content has no music.
 */
export function MusicToggle({ lang, className }: { lang: AppLocale; className?: string }) {
  const t = usePlayerText(lang);
  const music = useMedia().get("music");
  const audio = useRef<HTMLAudioElement | null>(null);
  const [on, setOn] = useState(false);
  useEffect(
    () => () => {
      audio.current?.pause();
      audio.current = null;
    },
    [],
  );
  if (!music) return null;
  const toggle = () => {
    if (on) {
      audio.current?.pause();
      setOn(false);
      return;
    }
    if (!audio.current) {
      audio.current = new Audio(music.url);
      audio.current.loop = true;
      audio.current.volume = 0.25;
    }
    setOn(true);
    start(audio.current, () => setOn(false));
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      className={cn(
        "ks-press inline-flex h-11 items-center gap-2 rounded-full border-[1.5px] border-line-strong bg-surface px-4 text-sm font-semibold text-ink shadow-lip hover:bg-tray",
        on && "border-brand bg-brand-soft",
        className,
      )}
      data-testid="music-toggle"
    >
      {on ? <Music2 className="size-4" aria-hidden /> : <Music className="size-4" aria-hidden />}
      {on ? t("player.musicOff") : t("player.musicOn")}
    </button>
  );
}

/** A step's picture or clip (activities). The clip never plays by itself. */
export function StepMedia({ media, className }: { media: MediaRef; className?: string }) {
  if (media.kind === "video")
    return (
      <video
        src={media.url}
        controls
        preload="metadata"
        playsInline
        aria-label={media.alt ?? undefined}
        className={cn("w-full max-w-md rounded-md bg-ink/5", className)}
        data-testid="step-clip"
      />
    );
  if (media.kind === "image")
    return <img src={media.url} alt={media.alt ?? ""} loading="lazy" className={cn("w-full max-w-md rounded-md", className)} data-testid="step-picture" />;
  return null;
}

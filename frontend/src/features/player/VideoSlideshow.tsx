import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import type { AppLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { castDeep, useCast } from "./cast";
import { contentDir, usePlayerText, type Dir } from "./content-locale";
import { BackArrow, Dots, KidButton, NextArrow, PhotoStack, playPaint, RoundButton } from "./kid-ui";
import { parseVideoPlan } from "./parse";
import { PlayerFallback } from "./PlayerFallback";
import type { VideoPlan } from "./types";
import { useNarration } from "./useNarration";

export type VideoSlideshowProps = {
  plan: VideoPlan | unknown;
  /** Content language: drives direction, player strings and the speech voice. */
  lang: AppLocale;
  dir?: Dir;
  /** Called once, the first time the last scene has played. */
  onFinish?: () => void;
};

/** A scene stays at least this long when the browser cannot read aloud. */
const MIN_SCENE_MS = 4000;
/** A short breath between scenes after the narration ends. */
const PAUSE_MS = 700;

/**
 * The video plan played as a narrated slideshow, made entirely in the browser: one scene
 * at a time with its picture (the photos of the people of the child's life it mentions,
 * else its emoji) and its narration, read aloud with the browser's own speech synthesis
 * and moving on by itself. Nothing is uploaded or generated elsewhere. Play starts it (a
 * tap is needed before a browser may speak); Back and Next step through by hand.
 */
export function VideoSlideshow({ plan: raw, lang, dir: dirProp, onFinish }: VideoSlideshowProps) {
  const t = usePlayerText(lang);
  const dir = contentDir(lang, dirProp);
  const cast = useCast();
  const parsed = useMemo(() => parseVideoPlan(raw), [raw]);
  const photos = useMemo(() => parsed?.scenes.map((sc) => cast.photos(sc.narration)) ?? [], [parsed, cast]);
  const plan = useMemo(() => (parsed ? castDeep(parsed, cast) : null), [parsed, cast]);
  const { supported, speak, stop } = useNarration(lang);
  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const finished = useRef(false);

  const total = plan?.scenes.length ?? 0;
  const sceneMs = plan ? Math.max(MIN_SCENE_MS, Math.round((plan.duration_seconds * 1000) / Math.max(total, 1))) : MIN_SCENE_MS;

  const advance = useCallback(() => {
    if (scene + 1 < total) setScene(scene + 1);
    else {
      setPlaying(false);
      setEnded(true);
    }
  }, [scene, total]);

  useEffect(() => {
    if (!playing || !plan) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (supported) speak(plan.scenes[scene]!.narration, () => (timer = setTimeout(advance, PAUSE_MS)));
    else timer = setTimeout(advance, sceneMs);
    return () => {
      if (timer) clearTimeout(timer);
      stop();
    };
  }, [playing, scene, plan, supported, speak, stop, advance, sceneMs]);

  useEffect(() => {
    if (ended && !finished.current) {
      finished.current = true;
      onFinish?.();
    }
  }, [ended, onFinish]);

  if (!plan)
    return (
      <div dir={dir} lang={lang}>
        <PlayerFallback lang={lang} />
      </div>
    );

  const go = (to: number) => {
    setEnded(false);
    setScene(Math.max(0, Math.min(total - 1, to)));
  };
  const toggle = () => {
    if (ended) {
      setScene(0);
      setEnded(false);
      setPlaying(true);
    } else setPlaying((p) => !p);
  };

  const current = plan.scenes[scene]!;
  const scenePhotos = photos[scene] ?? [];

  return (
    <div dir={dir} lang={lang} className="flex flex-col gap-5" data-testid="video-slideshow">
      <h2 dir="auto" className="font-display text-display-lg text-center font-semibold text-ink">
        {plan.title}
      </h2>

      <div className={cn("relative mx-auto aspect-video w-full max-w-3xl overflow-hidden rounded-xl shadow-lip-lg", playPaint(scene))}>
        <span aria-hidden className="pointer-events-none absolute inset-0 z-10 rounded-xl border-[3px] border-ink" />
        <div key={scene} className="animate-rise flex h-full items-center justify-center gap-[4%] p-[4%]" data-testid="slideshow-scene">
          {scenePhotos.length > 0 && (
            <span className="flex aspect-square h-[88%] items-center justify-center">
              <PhotoStack photos={scenePhotos} className="size-full" />
            </span>
          )}
          {current.emoji && (
            <span
              aria-hidden
              className={cn(
                "flex aspect-square items-center justify-center rounded-full bg-surface leading-none",
                scenePhotos.length > 0 ? "h-[40%] text-[3rem] md:text-[4rem]" : "h-[70%] text-[5rem] md:text-[7rem]",
              )}
            >
              {current.emoji}
            </span>
          )}
          {!current.emoji && scenePhotos.length === 0 && (
            <span aria-hidden className="flex aspect-square h-[70%] items-center justify-center rounded-full bg-surface text-[5rem] leading-none md:text-[7rem]">
              🎬
            </span>
          )}
        </div>
      </div>

      <p dir="auto" aria-live="polite" className="font-display text-kid-story mx-auto min-h-24 max-w-[34ch] text-center font-medium text-ink" data-testid="slideshow-narration">
        {current.narration}
      </p>

      <nav className="flex items-center justify-center gap-6" aria-label={plan.title}>
        <RoundButton label={t("player.back")} tone="plain" onClick={() => go(scene - 1)} disabled={scene === 0} data-testid="slideshow-back">
          <BackArrow dir={dir} />
        </RoundButton>
        <RoundButton
          label={ended ? t("player.video.watchAgain") : playing ? t("player.video.pause") : t("player.video.play")}
          tone="brand"
          onClick={toggle}
          data-testid="slideshow-play"
          data-playing={playing ? "true" : "false"}
        >
          {ended ? <RotateCcw className="size-8" aria-hidden /> : playing ? <Pause className="size-8" aria-hidden /> : <Play className="size-8" aria-hidden />}
        </RoundButton>
        <RoundButton label={t("player.next")} tone="plain" onClick={() => go(scene + 1)} disabled={scene >= total - 1} data-testid="slideshow-next">
          <NextArrow dir={dir} />
        </RoundButton>
      </nav>
      <Dots total={total} current={scene} />
      {ended && (
        <div className="flex justify-center">
          <KidButton tone="plain" onClick={toggle} data-testid="slideshow-again">
            <RotateCcw aria-hidden />
            {t("player.video.watchAgain")}
          </KidButton>
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Home, RotateCcw, Volume2 } from "lucide-react";
import type { ActivityBody, ContentBody, GuideBody, RoutineBody, StoryBody } from "@/lib/ai/schemas";
import { useI18n } from "@/lib/i18n/client";
import { dirOf } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

export type PlayerNarration = { sceneId: string | null; url: string };
export type PlayerCharacter = { id: string; url: string };

type Props = {
  body: ContentBody;
  narrations?: PlayerNarration[];
  characters?: PlayerCharacter[];
  onHome?: () => void;
};

/**
 * Child-facing player. Content language drives direction, independent of
 * the adult UI language. No scores, no labels, no links out.
 */
export function ContentPlayer({ body, narrations = [], characters = [], onHome }: Props) {
  const dir = dirOf(body.language);
  return (
    <div dir={dir} lang={body.language} className="flex min-h-[70vh] flex-col">
      {body.kind === "story" && <StoryPlayer body={body} narrations={narrations} characters={characters} onHome={onHome} />}
      {body.kind === "routine" && <RoutinePlayer body={body} narrations={narrations} onHome={onHome} />}
      {body.kind === "activity" && <ActivityPlayer body={body} onHome={onHome} />}
      {body.kind === "guide" && <GuideView body={body} />}
    </div>
  );
}

/** Teacher narration first; otherwise the browser's text-to-speech (TTS fallback). */
function useNarration(language: string, narrations: PlayerNarration[]) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const stop = useCallback(() => {
    audio.current?.pause();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);
  /** auto=true: only play a recording made for this exact scene (no surprise TTS). */
  const play = useCallback(
    (sceneId: string, text: string, auto = false) => {
      stop();
      const rec = narrations.find((n) => n.sceneId === sceneId) ?? (auto ? undefined : narrations.find((n) => n.sceneId === null));
      if (auto && !rec) return;
      if (rec) {
        audio.current = new Audio(rec.url);
        audio.current.play().catch(() => undefined);
        return;
      }
      if ("speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = { ar: "ar", he: "he-IL", en: "en-US" }[language] ?? language;
        u.rate = 0.9;
        window.speechSynthesis.speak(u);
      }
    },
    [narrations, stop, language],
  );
  useEffect(() => stop, [stop]);
  return { play, stop };
}

function BigButton({
  onClick,
  children,
  label,
  className,
  testId,
}: {
  onClick: () => void;
  children: React.ReactNode;
  label: string;
  className?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      data-testid={testId}
      className={cn(
        "text-ink flex size-20 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-stone-200 transition active:scale-95 md:size-24",
        className,
      )}
    >
      {children}
    </button>
  );
}

function Finish({ onAgain, onHome }: { onAgain: () => void; onHome?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="animate-pop flex flex-1 flex-col items-center justify-center gap-6 py-10 text-center" data-testid="player-finished">
      <div className="text-[7rem] leading-none" aria-hidden>
        🌟
      </div>
      <p className="text-4xl font-semibold">{t("child.done")}</p>
      <div className="flex gap-4">
        <BigButton onClick={onAgain} label={t("child.again")}>
          <RotateCcw className="size-9" />
        </BigButton>
        {onHome && (
          <BigButton onClick={onHome} label={t("child.home")}>
            <Home className="size-9" />
          </BigButton>
        )}
      </div>
    </div>
  );
}

function StoryPlayer({
  body,
  narrations,
  characters,
  onHome,
}: {
  body: StoryBody;
  narrations: PlayerNarration[];
  characters: PlayerCharacter[];
  onHome?: () => void;
}) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const scene = body.scenes[index]!;
  const { play, stop } = useNarration(body.language, narrations);
  const charMap = useMemo(() => new Map(characters.map((c) => [c.id, c.url])), [characters]);
  const rtl = dirOf(body.language) === "rtl";

  useEffect(() => {
    if (!done) play(scene.id, scene.narration, true);
  }, [scene.id, scene.narration, play, done]);

  const goTo = (i: number) => {
    setHistory((h) => [...h, index]);
    setIndex(i);
  };
  const next = () => {
    if (index < body.scenes.length - 1) goTo(index + 1);
    else {
      stop();
      setDone(true);
    }
  };
  const back = () => {
    const prev = history[history.length - 1];
    if (prev === undefined) return;
    setHistory((h) => h.slice(0, -1));
    setIndex(prev);
  };

  if (done)
    return (
      <Finish
        onAgain={() => {
          setIndex(0);
          setHistory([]);
          setDone(false);
        }}
        onHome={onHome}
      />
    );

  const photos = scene.characterIds.map((id) => charMap.get(id)).filter((u): u is string => !!u);
  const NextIcon = rtl ? ArrowLeft : ArrowRight;
  const BackIcon = rtl ? ArrowRight : ArrowLeft;

  return (
    <div className="flex flex-1 flex-col gap-6" data-testid="story-player">
      <h1 className="text-center text-2xl font-semibold text-stone-700 md:text-3xl">{body.title}</h1>
      <div className="relative mx-auto flex aspect-[4/3] w-full max-w-2xl items-center justify-center overflow-hidden rounded-[2rem] bg-gradient-to-br from-amber-100 via-orange-50 to-sky-100 shadow-inner">
        <span className="animate-pop text-[9rem] leading-none md:text-[11rem]" aria-hidden key={scene.id}>
          {scene.illustration}
        </span>
        {photos.length > 0 && (
          <div className="absolute end-4 bottom-4 flex -space-x-3 rtl:space-x-reverse">
            {photos.map((u) => (
              // eslint-disable-next-line @next/next/no-img-element -- private authorized image
              <img key={u} src={u} alt="" className="size-20 rounded-full border-4 border-white object-cover shadow" />
            ))}
          </div>
        )}
      </div>
      <p className="mx-auto max-w-2xl text-center text-2xl leading-relaxed md:text-3xl" data-testid="scene-text">
        {scene.narration}
      </p>

      {scene.choices && scene.choices.length > 0 ? (
        <div className="mx-auto grid w-full max-w-2xl gap-4 sm:grid-cols-2">
          {scene.choices.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() =>
                goTo(
                  Math.max(
                    0,
                    body.scenes.findIndex((s) => s.id === c.nextSceneId),
                  ),
                )
              }
              className="flex items-center justify-center gap-3 rounded-3xl bg-white px-6 py-6 text-2xl font-medium shadow-md ring-2 ring-amber-200 transition active:scale-95"
              data-testid="story-choice"
            >
              {c.illustration && (
                <span className="text-4xl" aria-hidden>
                  {c.illustration}
                </span>
              )}
              {c.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-4">
        <BigButton onClick={back} label={t("child.back")} className={cn(history.length === 0 && "invisible")}>
          <BackIcon className="size-9" />
        </BigButton>
        <BigButton onClick={() => play(scene.id, scene.narration)} label={t("child.listen")} className="size-16 md:size-16">
          <Volume2 className="size-7" />
        </BigButton>
        {!(scene.choices && scene.choices.length > 0) && (
          <BigButton onClick={next} label={t("child.next")} className="bg-brand text-white ring-0" testId="story-next">
            <NextIcon className="size-9" />
          </BigButton>
        )}
        {scene.choices && scene.choices.length > 0 && <span className="size-20 md:size-24" />}
      </div>
      <div className="flex justify-center gap-1.5" aria-hidden>
        {body.scenes.map((s, i) => (
          <span key={s.id} className={cn("size-2.5 rounded-full", i === index ? "bg-brand" : "bg-stone-300")} />
        ))}
      </div>
    </div>
  );
}

function RoutinePlayer({ body, narrations, onHome }: { body: RoutineBody; narrations: PlayerNarration[]; onHome?: () => void }) {
  const { t } = useI18n();
  const [doneSteps, setDoneSteps] = useState<string[]>([]);
  const { play } = useNarration(body.language, narrations);
  const allDone = doneSteps.length === body.steps.length;
  if (allDone) return <Finish onAgain={() => setDoneSteps([])} onHome={onHome} />;
  const current = body.steps.find((s) => !doneSteps.includes(s.id));
  return (
    <div className="flex flex-1 flex-col gap-6" data-testid="routine-player">
      <h1 className="text-center text-2xl font-semibold text-stone-700 md:text-3xl">{body.title}</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {body.steps.map((s) => {
          const isDone = doneSteps.includes(s.id);
          const isCurrent = current?.id === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                if (!isDone) {
                  play(s.id, s.narration);
                  setDoneSteps([...doneSteps, s.id]);
                }
              }}
              className={cn(
                "relative flex flex-col items-center gap-2 rounded-3xl p-6 text-center shadow-md ring-2 transition active:scale-95",
                isDone ? "bg-emerald-50 ring-emerald-300" : isCurrent ? "bg-white ring-amber-400" : "bg-white opacity-80 ring-stone-200",
              )}
            >
              <span className="text-7xl" aria-hidden>
                {s.illustration}
              </span>
              <span className="text-2xl font-semibold">{s.label}</span>
              <span className="text-lg text-stone-600">{s.narration}</span>
              {isDone && (
                <span className="absolute end-3 top-3 rounded-full bg-emerald-500 p-1.5 text-white">
                  <Check className="size-6" />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {onHome && (
        <div className="mt-auto flex justify-center">
          <BigButton onClick={onHome} label={t("child.home")}>
            <Home className="size-9" />
          </BigButton>
        </div>
      )}
    </div>
  );
}

function ActivityPlayer({ body, onHome }: { body: ActivityBody; onHome?: () => void }) {
  const { t } = useI18n();
  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const r = body.rounds[round]!;
  const rtl = dirOf(body.language) === "rtl";
  const NextIcon = rtl ? ArrowLeft : ArrowRight;
  if (done)
    return (
      <Finish
        onAgain={() => {
          setRound(0);
          setPicked(null);
          setDone(false);
        }}
        onHome={onHome}
      />
    );
  return (
    <div className="flex flex-1 flex-col gap-6" data-testid="activity-player">
      <h1 className="text-center text-xl font-medium text-stone-500">{body.title}</h1>
      <p className="text-center text-3xl font-semibold">{r.prompt}</p>
      <div className={cn("mx-auto grid w-full max-w-3xl gap-4", r.options.length > 2 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2")}>
        {r.options.map((o) => {
          const chosen = picked === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setPicked(o.id)}
              className={cn(
                "flex flex-col items-center gap-3 rounded-3xl bg-white p-6 shadow-md ring-4 transition active:scale-95",
                chosen ? (o.isPreferred ? "ring-emerald-400" : "ring-amber-300") : "ring-transparent",
              )}
            >
              <span className="text-8xl" aria-hidden>
                {o.illustration}
              </span>
              <span className="text-2xl font-medium">{o.label}</span>
            </button>
          );
        })}
      </div>
      {picked && (
        <div className="animate-pop flex flex-col items-center gap-4">
          <p className="text-3xl font-semibold text-emerald-700">
            {r.options.find((o) => o.id === picked)?.isPreferred ? "⭐ " : "💛 "}
            {r.encouragement}
          </p>
          <BigButton
            onClick={() => {
              setPicked(null);
              if (round < body.rounds.length - 1) setRound(round + 1);
              else setDone(true);
            }}
            label={t("child.next")}
            className="bg-brand text-white ring-0"
          >
            <NextIcon className="size-9" />
          </BigButton>
        </div>
      )}
    </div>
  );
}

/** Adult-facing guide (movement, role play, home and discussion activities). */
export function GuideView({ body }: { body: GuideBody }) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">{body.title}</h1>
      {body.materials.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {body.materials.map((m) => (
            <li key={m} className="rounded-full bg-stone-100 px-3 py-1 text-sm">
              {m}
            </li>
          ))}
        </ul>
      )}
      <ol className="space-y-3">
        {body.steps.map((s, i) => (
          <li key={s.id} className="border-line flex gap-4 rounded-2xl border bg-white p-4">
            <span className="text-4xl" aria-hidden>
              {s.illustration}
            </span>
            <div>
              <p className="font-semibold">
                {i + 1}. {s.label}
              </p>
              <p className="text-stone-600">{s.instructions}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

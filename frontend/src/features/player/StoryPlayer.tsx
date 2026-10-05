import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Square, Volume2 } from "lucide-react";
import { NoteQuoteIcon } from "@/icons";
import type { AppLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { contentDir, usePlayerText, type Dir } from "./content-locale";
import { BackArrow, Dots, KidButton, NextArrow, playPaint, RoundButton } from "./kid-ui";
import { parseStory } from "./parse";
import { PlayerFallback } from "./PlayerFallback";
import type { Story } from "./types";
import { useNarration } from "./useNarration";

export type StoryPlayerProps = {
  story: Story;
  /** Content language: drives direction, player strings and the speech voice. */
  lang: AppLocale;
  /** Overrides the direction derived from `lang`. */
  dir?: Dir;
  /** Show the teacher note on the last (discussion) page. Off for children. */
  showTeacherNote?: boolean;
  /** Called once, the first time the discussion page is reached. */
  onFinish?: () => void;
};

/**
 * Page-by-page story: one big paragraph with its emoji picture per page, then
 * the discussion questions. Back/Next follow the reading direction (in RTL
 * Next sits on the left and the arrows flip). Optional read-aloud uses the
 * browser's speech synthesis in the content language.
 */
export function StoryPlayer({ story: raw, lang, dir: dirProp, showTeacherNote = false, onFinish }: StoryPlayerProps) {
  const t = usePlayerText(lang);
  const dir = contentDir(lang, dirProp);
  const story = useMemo(() => parseStory(raw), [raw]);
  const [page, setPage] = useState(0);
  const { supported, speaking, speak, stop } = useNarration(lang);
  const finished = useRef(false);

  const pages = story ? story.story.length + 1 : 0;
  const onQuestions = story !== null && page === story.story.length;

  useEffect(() => {
    if (onQuestions && !finished.current) {
      finished.current = true;
      onFinish?.();
    }
  }, [onQuestions, onFinish]);

  if (!story)
    return (
      <div dir={dir} lang={lang}>
        <PlayerFallback lang={lang} />
      </div>
    );

  const go = (to: number) => {
    stop();
    setPage(Math.max(0, Math.min(pages - 1, to)));
  };

  const pageText = onQuestions ? [t("player.story.questionsTitle"), ...story.questions].join(". ") : story.story[page]!;
  const picture = onQuestions ? "💬" : (story.illustrations?.[page] ?? "📖");

  return (
    <div dir={dir} lang={lang} className="flex min-h-[70vh] flex-col gap-6" data-testid="story-player">
      <h1 dir="auto" className="font-display text-display-lg text-center font-semibold text-ink">
        {story.title}
      </h1>

      {!onQuestions ? (
        <section key={page} className="animate-rise flex flex-1 flex-col items-center gap-6" data-testid="story-page">
          {/* The picture: a colouring-book frame around a painted block, the emoji in a surface pod. */}
          <div className="relative flex aspect-[4/3] w-full max-w-xl items-center justify-center rounded-xl bg-surface shadow-lip-lg">
            <span aria-hidden className="pointer-events-none absolute inset-0 rounded-xl border-[3px] border-ink" />
            <span aria-hidden className={cn("flex aspect-square h-[66%] items-center justify-center rounded-lg", playPaint(page))}>
              <span className="flex size-[78%] items-center justify-center rounded-full bg-surface">
                <span className="text-[6rem] leading-none md:text-[8rem]" data-testid="story-illustration">
                  {picture}
                </span>
              </span>
            </span>
          </div>
          <p dir="auto" className="font-display text-kid-story mx-auto max-w-[30ch] text-center font-medium text-ink">
            {story.story[page]}
          </p>
        </section>
      ) : (
        <section className="animate-rise mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5" data-testid="story-questions">
          <h2 className="font-display text-display-lg flex items-center justify-center gap-3 text-center font-semibold text-ink">
            <NoteQuoteIcon className="size-10 shrink-0" aria-hidden />
            {t("player.story.questionsTitle")}
          </h2>
          <ul className="space-y-4">
            {story.questions.map((q, i) => (
              <li key={i} className="animate-bounce-place flex items-start gap-4 rounded-xl bg-brand-soft px-6 py-5 text-ink">
                <span aria-hidden className={cn("mt-1 size-6 shrink-0 rounded-sm border-2 border-ink", playPaint(i + 1))} />
                <p dir="auto" className="font-display text-kid-label font-medium">
                  {q}
                </p>
              </li>
            ))}
          </ul>
          {showTeacherNote && (
            <aside className="rounded-md bg-tray p-4 text-ink" data-testid="story-teacher-note">
              <p className="text-sm font-semibold">{t("player.story.teacherNote")}</p>
              <p dir="auto" className="mt-1">
                {story.teacher_note}
              </p>
            </aside>
          )}
          <div className="flex justify-center">
            <KidButton tone="plain" onClick={() => go(0)} data-testid="story-again">
              <RotateCcw aria-hidden />
              {t("player.story.readAgain")}
            </KidButton>
          </div>
        </section>
      )}

      <nav className="mt-auto flex items-center justify-between gap-4" aria-label={story.title}>
        <RoundButton
          label={t("player.back")}
          tone="plain"
          onClick={() => go(page - 1)}
          disabled={page === 0}
          className={cn(page === 0 && "invisible")}
          data-testid="story-back"
        >
          <BackArrow dir={dir} />
        </RoundButton>
        {supported ? (
          <RoundButton
            label={speaking ? t("player.stopReading") : t("player.listen")}
            tone="plain"
            onClick={() => (speaking ? stop() : speak(pageText))}
            data-testid="story-listen"
          >
            {speaking ? <Square className="size-7" aria-hidden /> : <Volume2 className="size-8" aria-hidden />}
          </RoundButton>
        ) : (
          <span className="size-[72px] md:size-20" aria-hidden />
        )}
        <RoundButton
          label={t("player.next")}
          onClick={() => go(page + 1)}
          disabled={onQuestions}
          className={cn(onQuestions && "invisible")}
          data-testid="story-next"
        >
          <NextArrow dir={dir} />
        </RoundButton>
      </nav>
      <Dots total={pages} current={page} />
    </div>
  );
}

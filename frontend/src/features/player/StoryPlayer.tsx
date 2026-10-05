import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircleQuestion, RotateCcw, Square, Volume2 } from "lucide-react";
import type { AppLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { contentDir, usePlayerText, type Dir } from "./content-locale";
import { BackArrow, Dots, KidButton, NextArrow, RoundButton } from "./kid-ui";
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
      <h1 dir="auto" className="text-center text-2xl font-semibold text-stone-700 md:text-3xl">
        {story.title}
      </h1>

      {!onQuestions ? (
        <section key={page} className="animate-rise flex flex-1 flex-col items-center gap-6" data-testid="story-page">
          <div className="flex aspect-[4/3] w-full max-w-xl items-center justify-center rounded-[2rem] bg-gradient-to-br from-amber-50 via-orange-50 to-sky-100 shadow-inner">
            <span className="text-[8rem] leading-none md:text-[10rem]" aria-hidden data-testid="story-illustration">
              {picture}
            </span>
          </div>
          <p dir="auto" className="mx-auto max-w-3xl text-center text-2xl leading-relaxed text-ink md:text-3xl md:leading-relaxed">
            {story.story[page]}
          </p>
        </section>
      ) : (
        <section className="animate-rise mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5" data-testid="story-questions">
          <h2 className="flex items-center justify-center gap-3 text-center text-2xl font-bold text-brand md:text-3xl">
            <MessageCircleQuestion className="size-8" aria-hidden />
            {t("player.story.questionsTitle")}
          </h2>
          <ul className="space-y-4">
            {story.questions.map((q, i) => (
              <li key={i} className="flex items-start gap-4 rounded-3xl bg-white p-5 shadow-sm ring-2 ring-sky-100">
                <span className="text-4xl leading-none" aria-hidden>
                  💭
                </span>
                <p dir="auto" className="text-xl leading-relaxed md:text-2xl">
                  {q}
                </p>
              </li>
            ))}
          </ul>
          {showTeacherNote && (
            <aside className="rounded-2xl bg-stone-100 p-4 text-stone-700" data-testid="story-teacher-note">
              <p className="text-sm font-semibold">{t("player.story.teacherNote")}</p>
              <p dir="auto" className="mt-1">
                {story.teacher_note}
              </p>
            </aside>
          )}
          <div className="flex justify-center">
            <KidButton tone="plain" onClick={() => go(0)} data-testid="story-again">
              <RotateCcw className="size-6" aria-hidden />
              {t("player.story.readAgain")}
            </KidButton>
          </div>
        </section>
      )}

      <nav className="mt-auto flex items-center justify-between gap-4" aria-label={story.title}>
        <RoundButton
          label={t("player.back")}
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
            onClick={() => (speaking ? stop() : speak(pageText))}
            data-testid="story-listen"
          >
            {speaking ? <Square className="size-7" aria-hidden /> : <Volume2 className="size-8" aria-hidden />}
          </RoundButton>
        ) : (
          <span className="size-16 md:size-20" aria-hidden />
        )}
        <RoundButton
          label={t("player.next")}
          tone="brand"
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

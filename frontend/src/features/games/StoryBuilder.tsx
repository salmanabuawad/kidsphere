import { useState } from "react";
import { Mic } from "lucide-react";
import type { StoryBuilderGame } from "@/features/player/types";
import { usePlayerText } from "@/features/player/content-locale";
import { BackArrow, ChoiceCard, Dots, KidHeading, Pic, RoundButton, StarSticker } from "@/features/player/kid-ui";
import { ListenButton, Spoken, useSayOnShow, useShowWords } from "@/features/player/voice";
import type { TemplateProps } from "./template-props";

/**
 * Story builder (PLAN-ADJUSTMENTS B8): step through 3–5 prompts (e.g. animal
 * → place → challenge → idea), choosing one card each. Choices have no
 * correct answer. The last screen shows the child's story built from their
 * choices and invites them to tell it ("Now tell your story!").
 */
export function StoryBuilder({ game, lang, dir, onDone }: TemplateProps<StoryBuilderGame>) {
  const t = usePlayerText(lang);
  const [chosen, setChosen] = useState<number[]>([]);
  const step = chosen.length;
  const finished = step >= game.steps.length;
  const showWords = useShowWords();
  const tellIt = [t("player.game.storyBuilder.tellYourStory"), game.closing_prompt].filter(Boolean).join(" ");
  const prompt = finished ? null : game.steps[step]!.prompt;
  // Each step says its prompt (the intro first); the last screen invites the child to tell the story.
  useSayOnShow(finished ? tellIt : [step === 0 ? game.intro : null, prompt].filter(Boolean).join(". "), step);

  const choose = (i: number) => setChosen([...chosen, i]);
  const back = () => setChosen(chosen.slice(0, -1));

  if (finished) {
    return (
      <div className="animate-rise flex flex-1 flex-col items-center gap-6" data-testid="story-builder-story">
        <KidHeading title={game.title} />
        <Spoken text={t("player.game.storyBuilder.yourStory")} className="font-display text-center text-xl font-semibold text-ink-muted" />
        <ol dir={dir} className="flex w-full max-w-4xl flex-row flex-wrap items-stretch justify-center gap-3" data-testid="story-builder-cards">
          {game.steps.map((s, si) => {
            const c = s.choices[chosen[si]!]!;
            return (
              <li key={si} className="animate-bounce-place flex min-w-28 flex-col items-center gap-2 rounded-xl border-[3px] border-ink bg-surface p-4 text-center shadow-lip-lg" data-testid="story-builder-card">
                <Pic emoji={c.emoji} photo={c.photo} className="text-6xl" />
                <span dir="auto" className={showWords || !(c.emoji || c.photo) ? "font-display text-kid-label font-semibold text-ink" : "sr-only"}>
                  {c.label}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="mx-auto max-w-[640px] rounded-xl bg-helps-soft px-6 py-5 text-center text-ink">
          <p className="font-display text-display-lg flex items-center justify-center gap-3 font-semibold">
            <Mic className={showWords ? "size-8 shrink-0" : "size-16 shrink-0"} aria-hidden />
            <span className={showWords ? undefined : "sr-only"}>{t("player.game.storyBuilder.tellYourStory")}</span>
            <ListenButton text={tellIt} lang={lang} />
          </p>
          <p dir="auto" className={showWords ? "font-display mt-3 text-xl leading-[1.875rem] font-medium" : "sr-only"} data-testid="story-builder-closing">
            {game.closing_prompt}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <RoundButton label={t("player.back")} onClick={back} data-testid="story-builder-back">
            <BackArrow dir={dir} />
          </RoundButton>
          <RoundButton label={t("player.game.storyBuilder.toldIt")} tone="brand" onClick={onDone} data-testid="story-builder-done">
            <StarSticker size={44} />
          </RoundButton>
        </div>
      </div>
    );
  }

  const s = game.steps[step]!;
  return (
    <div className="flex flex-1 flex-col gap-6" data-testid="game-story_builder">
      <KidHeading title={game.title} intro={step === 0 ? game.intro : null} spoken />
      {step > 0 && (
        <ol dir={dir} className="flex flex-row flex-wrap justify-center gap-2" aria-label={t("player.game.storyBuilder.yourStory")}>
          {chosen.map((ci, si) => {
            const c = game.steps[si]!.choices[ci]!;
            return (
              <li key={si} className="rounded-md border-2 border-ink bg-surface px-3 py-1 text-lg text-ink">
                <Pic emoji={c.emoji} photo={c.photo} className={showWords ? "me-1" : "text-3xl"} />
                <span dir="auto" className={showWords || !(c.emoji || c.photo) ? undefined : "sr-only"}>
                  {c.label}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <section key={step} className="animate-rise flex flex-col gap-6">
        <div className="flex items-center justify-center gap-3">
          <p dir="auto" className="font-display text-display-lg text-center font-semibold text-ink" data-testid="story-builder-prompt">
            {s.prompt}
          </p>
          <ListenButton text={s.prompt} lang={lang} />
        </div>
        <div className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-4">
          {s.choices.map((c, i) => (
            <ChoiceCard key={i} label={c.label} emoji={c.emoji} photo={c.photo} size="lg" paint={i + step} onClick={() => choose(i)} data-testid={`story-choice-${i}`} />
          ))}
        </div>
      </section>
      <div className="flex items-center justify-between">
        {step > 0 ? (
          <RoundButton label={t("player.back")} onClick={back} data-testid="story-builder-back">
            <BackArrow dir={dir} />
          </RoundButton>
        ) : (
          <span />
        )}
      </div>
      <Dots total={game.steps.length} current={step} />
    </div>
  );
}

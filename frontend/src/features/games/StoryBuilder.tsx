import { useState } from "react";
import { Mic } from "lucide-react";
import type { StoryBuilderGame } from "@/features/player/types";
import { usePlayerText } from "@/features/player/content-locale";
import { BackArrow, ChoiceCard, Dots, KidButton, KidHeading, Pic, RoundButton } from "@/features/player/kid-ui";
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

  const choose = (i: number) => setChosen([...chosen, i]);
  const back = () => setChosen(chosen.slice(0, -1));

  if (finished) {
    return (
      <div className="animate-rise flex flex-1 flex-col items-center gap-6" data-testid="story-builder-story">
        <KidHeading title={game.title} />
        <p className="text-center text-xl font-semibold text-stone-600">{t("player.game.storyBuilder.yourStory")}</p>
        <ol dir={dir} className="flex w-full max-w-4xl flex-row flex-wrap items-stretch justify-center gap-3" data-testid="story-builder-cards">
          {game.steps.map((s, si) => {
            const c = s.choices[chosen[si]!]!;
            return (
              <li key={si} className="flex min-w-28 flex-col items-center gap-2 rounded-3xl bg-white p-4 text-center shadow-sm ring-2 ring-amber-200" data-testid="story-builder-card">
                <Pic emoji={c.emoji} className="text-6xl" />
                <span dir="auto" className="text-xl font-semibold">
                  {c.label}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="mx-auto max-w-2xl rounded-3xl bg-emerald-50 px-6 py-5 text-center ring-2 ring-emerald-200">
          <p className="flex items-center justify-center gap-3 text-3xl font-bold text-emerald-900 md:text-4xl">
            <Mic className="size-8" aria-hidden />
            {t("player.game.storyBuilder.tellYourStory")}
          </p>
          <p dir="auto" className="mt-3 text-xl text-emerald-950 md:text-2xl" data-testid="story-builder-closing">
            {game.closing_prompt}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <RoundButton label={t("player.back")} onClick={back} data-testid="story-builder-back">
            <BackArrow dir={dir} />
          </RoundButton>
          <KidButton onClick={onDone} data-testid="story-builder-done">
            {t("player.game.storyBuilder.toldIt")}
          </KidButton>
        </div>
      </div>
    );
  }

  const s = game.steps[step]!;
  return (
    <div className="flex flex-1 flex-col gap-6" data-testid="game-story_builder">
      <KidHeading title={game.title} intro={step === 0 ? game.intro : null} />
      {step > 0 && (
        <ol dir={dir} className="flex flex-row flex-wrap justify-center gap-2" aria-label={t("player.game.storyBuilder.yourStory")}>
          {chosen.map((ci, si) => {
            const c = game.steps[si]!.choices[ci]!;
            return (
              <li key={si} className="rounded-full bg-amber-50 px-3 py-1 text-lg ring-1 ring-amber-200">
                <Pic emoji={c.emoji} className="me-1" />
                <span dir="auto">{c.label}</span>
              </li>
            );
          })}
        </ol>
      )}
      <section key={step} className="animate-rise flex flex-col gap-6">
        <p dir="auto" className="text-center text-2xl font-semibold text-ink md:text-3xl" data-testid="story-builder-prompt">
          {s.prompt}
        </p>
        <div className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-4">
          {s.choices.map((c, i) => (
            <ChoiceCard key={i} label={c.label} emoji={c.emoji} size="lg" onClick={() => choose(i)} data-testid={`story-choice-${i}`} />
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

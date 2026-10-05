import { useState } from "react";
import type { ChoiceGame } from "@/features/player/types";
import { usePlayerText } from "@/features/player/content-locale";
import { ChoiceCard, Dots, Feedback, KidButton, KidHeading, NextArrow, type CardState } from "@/features/player/kid-ui";
import { cn } from "@/lib/utils";
import type { TemplateProps } from "./template-props";

/**
 * MultipleChoice, EmotionChoice and WhatHappensNext: tap a big choice card and
 * get gentle feedback. The preferred answer gets a warm "Great idea!"; any
 * other choice gets "Let's think together" plus the explanation, and the
 * child can try again or move on. No scores, timers or right/wrong counts.
 */
export function ChoiceRounds({ game, lang, dir, onDone }: TemplateProps<ChoiceGame>) {
  const t = usePlayerText(lang);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const round = game.rounds[index]!;
  const preferred = round.correct_or_preferred_answer;
  const last = index === game.rounds.length - 1;
  const big = game.template === "emotion_choice";

  const next = () => {
    setPicked(null);
    if (last) onDone();
    else setIndex(index + 1);
  };

  const stateOf = (i: number): CardState => {
    if (picked === null) return "idle";
    if (i === picked) return preferred === null ? "selected" : i === preferred ? "preferred" : "other";
    if (preferred !== null && i === preferred && picked !== preferred) return "suggested";
    return "idle";
  };

  let feedback = null;
  if (picked !== null) {
    if (preferred === null) feedback = <Feedback tone="calm" title={t("player.game.thanks")}>{round.explanation}</Feedback>;
    else if (picked === preferred) feedback = <Feedback tone="warm" title={t("player.game.greatIdea")}>{round.explanation}</Feedback>;
    else feedback = <Feedback tone="think" title={t("player.game.thinkTogether")}>{round.explanation}</Feedback>;
  }

  return (
    <div className="flex flex-1 flex-col gap-6" data-testid={`game-${game.template}`}>
      <KidHeading title={game.title} intro={index === 0 ? game.intro : null} />
      <section key={index} className="animate-rise flex flex-col gap-6">
        {game.template === "what_happens_next" && (
          <p className="text-center text-lg font-semibold tracking-wide text-brand uppercase">{t("player.game.whatHappensNext")}</p>
        )}
        <p dir="auto" className="text-center text-2xl font-semibold text-ink md:text-3xl" data-testid="round-question">
          {round.question}
        </p>
        <div className={cn("mx-auto grid w-full max-w-3xl grid-cols-2 gap-4", round.choices.length === 3 && "md:grid-cols-3")}>
          {round.choices.map((c, i) => (
            <ChoiceCard
              key={i}
              label={c.label}
              emoji={c.emoji}
              size={big ? "lg" : "md"}
              state={stateOf(i)}
              onClick={() => setPicked(i)}
              data-testid={`choice-${i}`}
            />
          ))}
        </div>
        {feedback}
        {picked !== null && (
          <div className="flex justify-center">
            <KidButton onClick={next} data-testid="round-next">
              {last ? t("player.game.allDone") : t("player.next")}
              <NextArrow dir={dir} className="size-6" />
            </KidButton>
          </div>
        )}
      </section>
      {game.rounds.length > 1 && <Dots total={game.rounds.length} current={index} />}
    </div>
  );
}

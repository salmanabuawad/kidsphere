import { useMemo, useState } from "react";
import type { SequenceGame } from "@/features/player/types";
import { usePlayerText } from "@/features/player/content-locale";
import { ChoiceCard, Feedback, KidHeading, Pic } from "@/features/player/kid-ui";
import { ListenButton, Spoken, useSayOnShow, useShowWords } from "@/features/player/voice";
import { seedOf, shuffledIndices } from "./shuffle";
import type { TemplateProps } from "./template-props";

/**
 * Put in order: the cards start shuffled; the child taps the one that comes
 * next and it joins the line. The line follows the reading direction (it
 * grows from the right in RTL). A card tapped too early just gets a gentle
 * "what comes next?".
 */
export function Sequence({ game, lang, dir, replay, onDone }: TemplateProps<SequenceGame>) {
  const t = usePlayerText(lang);
  const howTo = t("player.game.sequence.hint");
  useSayOnShow([game.intro, howTo].filter(Boolean).join(". "), "start");
  // Each tap that brings feedback is a new beat, so the same words are said again.
  const [beat, setBeat] = useState(0);
  const showWords = useShowWords();
  const n = game.items.length;
  const pool = useMemo(() => shuffledIndices(n, seedOf(game.items.map((i) => i.label), replay)), [game, n, replay]);
  const [placed, setPlaced] = useState<number[]>([]);
  const [hint, setHint] = useState<number | null>(null);

  const tap = (i: number) => {
    if (placed.includes(i)) return;
    if (i === placed.length) {
      const next = [...placed, i];
      setPlaced(next);
      setHint(null);
      if (next.length === n) onDone();
    } else {
      setHint(i);
      setBeat((b) => b + 1);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-6" data-testid="game-sequence">
      <KidHeading title={game.title} intro={game.intro} spoken />
      <div className="flex items-center justify-center gap-3">
        <Spoken text={howTo} className="text-center text-lg text-ink-muted" />
        <ListenButton text={howTo} lang={lang} />
      </div>

      <ol dir={dir} className="mx-auto flex w-full max-w-4xl flex-row flex-wrap justify-center gap-3 rounded-xl bg-tray p-4" data-testid="sequence-track">
        {game.items.map((_, slot) => {
          const item = placed[slot] !== undefined ? game.items[placed[slot]!]! : null;
          return (
            <li
              key={slot}
              className={
                item
                  ? "animate-bounce-place flex min-h-24 min-w-24 flex-col items-center justify-center gap-1 rounded-lg border-[3px] border-ink bg-surface p-3 shadow-lip"
                  : "flex min-h-24 min-w-24 items-center justify-center rounded-lg border-[3px] border-dashed border-line-strong"
              }
              data-testid={item ? "sequence-placed" : "sequence-slot"}
            >
              {item && (
                <>
                  <Pic emoji={item.emoji} photo={item.photo} className="text-4xl" />
                  <span dir="auto" className={showWords || !(item.emoji || item.photo) ? "font-display text-lg font-semibold text-ink" : "sr-only"}>
                    {item.label}
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-4 md:grid-cols-3" data-testid="sequence-pool">
        {pool
          .filter((i) => !placed.includes(i))
          .map((i) => (
            <ChoiceCard
              key={i}
              label={game.items[i]!.label}
              emoji={game.items[i]!.emoji}
              photo={game.items[i]!.photo}
              state={hint === i ? "hint" : "idle"}
              paint={i}
              onClick={() => tap(i)}
              data-testid={`sequence-item-${i}`}
            />
          ))}
      </div>
      {hint !== null && <Feedback key={beat} tone="think" title={placed.length === 0 ? t("player.game.sequence.whatFirst") : t("player.game.sequence.whatNext")} />}
    </div>
  );
}

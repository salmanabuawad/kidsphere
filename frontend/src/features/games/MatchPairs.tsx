import { useMemo, useState } from "react";
import type { MatchPairsGame } from "@/features/player/types";
import { usePlayerText } from "@/features/player/content-locale";
import { ChoiceCard, Feedback, KidHeading, type CardState } from "@/features/player/kid-ui";
import { seedOf, shuffledIndices } from "./shuffle";
import type { TemplateProps } from "./template-props";

type Side = "a" | "b";
type Pick = { side: Side; pair: number };


/**
 * Tap a card in the first column, then its partner in the second column
 * (either order works). Columns follow the reading direction: in RTL the
 * first column is on the right. Taps only, no dragging.
 */
export function MatchPairs({ game, lang, replay, onDone }: TemplateProps<MatchPairsGame>) {
  const t = usePlayerText(lang);
  const order = useMemo(() => shuffledIndices(game.pairs.length, seedOf(game.pairs.map((p) => p.right.label), replay)), [game, replay]);
  const [pick, setPick] = useState<Pick | null>(null);
  const [matched, setMatched] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<"match" | "again" | null>(null);

  const tap = (side: Side, pair: number) => {
    if (matched.includes(pair)) return;
    if (!pick || pick.side === side) {
      setPick(pick && pick.side === side && pick.pair === pair ? null : { side, pair });
      setFeedback(null);
      return;
    }
    setPick(null);
    if (pick.pair === pair) {
      const next = [...matched, pair];
      setMatched(next);
      setFeedback("match");
      if (next.length === game.pairs.length) onDone();
    } else {
      setFeedback("again");
    }
  };

  const stateOf = (side: Side, pair: number): CardState => {
    if (matched.includes(pair)) return "done";
    if (pick?.side === side && pick.pair === pair) return "selected";
    return "idle";
  };
  // Each card is painted by its place in its column; once a pair is matched, both cards share the pair's paint.
  const paintOf = (pair: number, position: number) => (matched.includes(pair) ? pair : position);

  return (
    <div className="flex flex-1 flex-col gap-6" data-testid="game-match_pairs">
      <KidHeading title={game.title} intro={game.intro} />
      <p className="text-center text-lg text-ink-muted">{t("player.game.match.hint")}</p>
      <div className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-x-8 gap-y-4 md:gap-x-16">
        <div className="flex flex-col gap-4" data-testid="match-column-a">
          {game.pairs.map((p, i) => (
            <ChoiceCard
              key={i}
              label={p.left.label}
              emoji={p.left.emoji}
              state={stateOf("a", i)}
              paint={paintOf(i, i)}
              disabled={matched.includes(i)}
              onClick={() => tap("a", i)}
              data-testid={`match-a-${i}`}
            />
          ))}
        </div>
        <div className="flex flex-col gap-4" data-testid="match-column-b">
          {order.map((i, position) => (
            <ChoiceCard
              key={i}
              label={game.pairs[i]!.right.label}
              emoji={game.pairs[i]!.right.emoji}
              state={stateOf("b", i)}
              paint={paintOf(i, position + 3)}
              disabled={matched.includes(i)}
              onClick={() => tap("b", i)}
              data-testid={`match-b-${i}`}
            />
          ))}
        </div>
      </div>
      {feedback === "match" && <Feedback tone="warm" title={t("player.game.match.yes")} />}
      {feedback === "again" && <Feedback tone="think" title={t("player.game.tryAnother")} />}
    </div>
  );
}

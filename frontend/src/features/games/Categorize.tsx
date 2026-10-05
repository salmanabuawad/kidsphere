import { useMemo, useState } from "react";
import type { CategorizeGame } from "@/features/player/types";
import { usePlayerText } from "@/features/player/content-locale";
import { ChoiceCard, Feedback, KidHeading, Pic } from "@/features/player/kid-ui";
import { cn } from "@/lib/utils";
import { seedOf, shuffledIndices } from "./shuffle";
import type { TemplateProps } from "./template-props";

const BASKETS = ["bg-sky-50 ring-sky-200", "bg-violet-50 ring-violet-200", "bg-amber-50 ring-amber-200"];

/**
 * Tap-to-place (PLAN-ADJUSTMENTS B16): tap a picture, then tap the basket it
 * belongs in. No drag library, so it works with taps on any tablet.
 */
export function Categorize({ game, lang, replay, onDone }: TemplateProps<CategorizeGame>) {
  const t = usePlayerText(lang);
  const order = useMemo(() => shuffledIndices(game.items.length, seedOf(game.items.map((i) => i.label), replay)), [game, replay]);
  const [selected, setSelected] = useState<number | null>(null);
  const [placed, setPlaced] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<"yes" | "again" | "pickFirst" | null>(null);

  const pickItem = (i: number) => {
    setSelected(selected === i ? null : i);
    setFeedback(null);
  };

  const pickBasket = (key: string) => {
    if (selected === null) {
      setFeedback("pickFirst");
      return;
    }
    if (game.items[selected]!.category === key) {
      const next = [...placed, selected];
      setPlaced(next);
      setSelected(null);
      setFeedback("yes");
      if (next.length === game.items.length) onDone();
    } else {
      setFeedback("again");
    }
  };

  const remaining = order.filter((i) => !placed.includes(i));

  return (
    <div className="flex flex-1 flex-col gap-6" data-testid="game-categorize">
      <KidHeading title={game.title} intro={game.intro} />
      <p className="text-center text-lg text-stone-600">{t("player.game.categorize.hint")}</p>

      <div className={cn("mx-auto grid w-full max-w-4xl gap-4", game.categories.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {game.categories.map((c, ci) => (
          <button
            key={c.key}
            type="button"
            onClick={() => pickBasket(c.key)}
            aria-label={c.label}
            className={cn(
              "flex min-h-40 flex-col items-center gap-2 rounded-3xl p-4 ring-4 transition select-none active:scale-[0.98]",
              BASKETS[ci % BASKETS.length],
              selected !== null && "ring-brand/50",
            )}
            data-testid={`basket-${c.key}`}
          >
            <Pic emoji={c.emoji ?? "🧺"} className="text-6xl" />
            <span dir="auto" className="text-xl font-bold text-ink md:text-2xl">
              {c.label}
            </span>
            <span className="flex flex-wrap justify-center gap-1" data-testid={`basket-${c.key}-items`}>
              {placed
                .filter((i) => game.items[i]!.category === c.key)
                .map((i) => (
                  <span key={i} className="animate-pop rounded-full bg-white px-2 py-1 text-base shadow-sm" title={game.items[i]!.label}>
                    {game.items[i]!.emoji ? <Pic emoji={game.items[i]!.emoji} className="text-2xl" /> : null}
                    <span className={game.items[i]!.emoji ? "sr-only" : ""}>{game.items[i]!.label}</span>
                  </span>
                ))}
            </span>
          </button>
        ))}
      </div>

      {remaining.length > 0 && (
        <div className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-4 md:grid-cols-4" data-testid="categorize-pool">
          {remaining.map((i) => (
            <ChoiceCard
              key={i}
              label={game.items[i]!.label}
              emoji={game.items[i]!.emoji}
              state={selected === i ? "selected" : "idle"}
              onClick={() => pickItem(i)}
              data-testid={`categorize-item-${i}`}
            />
          ))}
        </div>
      )}
      {feedback === "yes" && <Feedback tone="warm" title={t("player.game.categorize.yes")} />}
      {feedback === "again" && <Feedback tone="think" title={t("player.game.categorize.again")} />}
      {feedback === "pickFirst" && <Feedback tone="calm" title={t("player.game.categorize.pickFirst")} />}
    </div>
  );
}

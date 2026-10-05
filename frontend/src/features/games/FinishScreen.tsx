import { RotateCcw } from "lucide-react";
import type { AppLocale } from "@/i18n/config";
import { usePlayerText } from "@/features/player/content-locale";
import { KidButton, StarSticker } from "@/features/player/kid-ui";

export type FinishScreenProps = {
  lang: AppLocale;
  onPlayAgain: () => void;
  /** Optional extra line under "Well done!". */
  message?: string;
};

/**
 * The finish tower (spec 6.10): a child's first tower builds itself, block by block
 * (an arch in toy blue, a berry cube, a sun ball), then a star sticker stamps beside
 * it. Under reduced motion it is simply there. Decorative: the words carry the meaning.
 */
function FinishTower() {
  return (
    <svg viewBox="0 0 200 168" width={200} height={168} className="shrink-0 overflow-visible" strokeWidth={3} strokeLinejoin="round" aria-hidden>
      <g className="animate-bounce-place">
        <path d="M40 164V122a14 14 0 0 1 14-14h92a14 14 0 0 1 14 14v42h-20a20 20 0 0 0-40 0Z" className="fill-brand stroke-ink" />
      </g>
      <g className="animate-bounce-place [animation-delay:120ms]">
        <rect x="58" y="52" width="56" height="56" rx="10" className="fill-paint-berry stroke-ink" />
      </g>
      <g className="animate-bounce-place [animation-delay:240ms]">
        <circle cx="88" cy="28" r="24" className="fill-paint-sun stroke-ink" />
      </g>
    </svg>
  );
}

/** Shared end screen: a warm "Well done!" and Play again. No scores, star counts or results. */
export function FinishScreen({ lang, onPlayAgain, message }: FinishScreenProps) {
  const t = usePlayerText(lang);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-10 text-center" data-testid="finish-screen">
      <div className="flex items-end gap-2">
        <FinishTower />
        <StarSticker size={56} className="animate-stamp mb-16 [animation-delay:600ms]" />
      </div>
      <p className="font-display text-display-xl font-semibold text-ink">{t("player.finish.title")}</p>
      <p dir="auto" className="max-w-xl text-xl leading-[1.875rem] text-ink-muted">
        {message ?? t("player.finish.body")}
      </p>
      <KidButton onClick={onPlayAgain} data-testid="play-again">
        <RotateCcw aria-hidden />
        {t("player.finish.playAgain")}
      </KidButton>
    </div>
  );
}

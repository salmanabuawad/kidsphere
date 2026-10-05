import { RotateCcw } from "lucide-react";
import type { AppLocale } from "@/i18n/config";
import { usePlayerText } from "@/features/player/content-locale";
import { KidButton } from "@/features/player/kid-ui";

export type FinishScreenProps = {
  lang: AppLocale;
  onPlayAgain: () => void;
  /** Optional extra line under "Well done!". */
  message?: string;
};

/** Shared end screen: a warm "Well done!" and Play again. No scores, stars counts or results. */
export function FinishScreen({ lang, onPlayAgain, message }: FinishScreenProps) {
  const t = usePlayerText(lang);
  return (
    <div className="animate-pop flex flex-1 flex-col items-center justify-center gap-6 py-10 text-center" data-testid="finish-screen">
      <div className="text-[7rem] leading-none" aria-hidden>
        🌈
      </div>
      <p className="text-4xl font-bold text-stone-800 md:text-5xl">{t("player.finish.title")}</p>
      <p dir="auto" className="max-w-xl text-xl text-stone-600 md:text-2xl">
        {message ?? t("player.finish.body")}
      </p>
      <KidButton onClick={onPlayAgain} data-testid="play-again">
        <RotateCcw className="size-6" aria-hidden />
        {t("player.finish.playAgain")}
      </KidButton>
    </div>
  );
}

import type { AppLocale } from "@/i18n/config";
import { usePlayerText } from "./content-locale";

/** Friendly message shown instead of content that could not be read (malformed data). Never throws. */
export function PlayerFallback({ lang }: { lang: AppLocale }) {
  const t = usePlayerText(lang);
  return (
    <div role="status" className="mx-auto flex max-w-xl flex-col items-center gap-4 py-12 text-center" data-testid="player-fallback">
      <span className="text-7xl leading-none" aria-hidden>
        🧸
      </span>
      <p className="text-2xl font-semibold text-stone-800">{t("player.fallback.title")}</p>
      <p className="text-lg text-stone-600">{t("player.fallback.body")}</p>
    </div>
  );
}

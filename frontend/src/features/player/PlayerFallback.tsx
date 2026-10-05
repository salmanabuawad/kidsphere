import { BlockScene } from "@/components/ui/EmptyState";
import type { AppLocale } from "@/i18n/config";
import { usePlayerText } from "./content-locale";

/** Friendly message shown instead of content that could not be read (malformed data). Never throws. */
export function PlayerFallback({ lang }: { lang: AppLocale }) {
  const t = usePlayerText(lang);
  return (
    <div role="status" className="mx-auto flex max-w-xl flex-col items-center gap-4 py-12 text-center" data-testid="player-fallback">
      <BlockScene scene="content" className="h-auto w-40" />
      <p className="font-display text-kid-label font-semibold text-ink">{t("player.fallback.title")}</p>
      <p className="text-lg text-ink-muted">{t("player.fallback.body")}</p>
    </div>
  );
}

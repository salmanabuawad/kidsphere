import { Languages } from "lucide-react";
import { LOCALES, LOCALE_NAMES, type AppLocale } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";

/**
 * Interface language switcher. setLocale flips <html lang dir>, stores the
 * choice and saves it to the signed-in user (PUT /api/me).
 *   variant="select"    – icon + native select with full names (sidebar)
 *   variant="compact"   – icon + short code (phone top bar)
 *   variant="segmented" – three large buttons (account page, login)
 */
export function LocaleSwitcher({ variant = "select", className }: { variant?: "select" | "compact" | "segmented"; className?: string }) {
  const { locale, setLocale, t } = useI18n();
  const change = (l: AppLocale) => void setLocale(l);

  if (variant === "segmented") {
    return (
      <div role="radiogroup" aria-label={t("common.uiLanguage")} className={cn("grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1", className)}>
        {LOCALES.map((l) => {
          const active = l === locale;
          return (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={active}
              lang={l}
              onClick={() => change(l)}
              className={cn(
                "min-h-11 rounded-xl px-3 text-sm font-medium transition-colors",
                active ? "bg-white text-brand shadow-sm" : "text-stone-600 hover:text-ink",
              )}
            >
              {LOCALE_NAMES[l]}
            </button>
          );
        })}
      </div>
    );
  }

  const compact = variant === "compact";
  return (
    <label
      className={cn(
        "relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl text-sm text-stone-600 hover:bg-stone-100 focus-within:ring-2 focus-within:ring-brand/30",
        compact ? "px-2" : "px-3",
        className,
      )}
    >
      <Languages className="size-4 shrink-0" aria-hidden />
      <span className="sr-only">{t("common.uiLanguage")}</span>
      <select
        value={locale}
        onChange={(e) => change(e.target.value as AppLocale)}
        className={cn("cursor-pointer appearance-none bg-transparent text-sm font-medium focus:outline-none", compact ? "w-auto" : "flex-1")}
        data-testid="locale-switcher"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}

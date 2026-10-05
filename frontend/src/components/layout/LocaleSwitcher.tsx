import { Check, Languages } from "lucide-react";
import { LOCALES, LOCALE_NAMES, type AppLocale } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";

/**
 * Interface language switcher. setLocale flips <html lang dir>, stores the
 * choice and saves it to the signed-in user (PUT /api/me).
 *   variant="select"    – icon + native select with full names (sidebar)
 *   variant="compact"   – icon + short code (phone top bar)
 *   variant="segmented" – a tray track with three blocks (account page, login, menu sheet)
 */
export function LocaleSwitcher({ variant = "select", className }: { variant?: "select" | "compact" | "segmented"; className?: string }) {
  const { locale, setLocale, t } = useI18n();
  const change = (l: AppLocale) => void setLocale(l);

  if (variant === "segmented") {
    return (
      <div role="radiogroup" aria-label={t("common.uiLanguage")} className={cn("grid grid-cols-3 gap-1 rounded-md bg-tray p-1", className)}>
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
                "flex min-h-11 items-center justify-center gap-1.5 rounded-md px-2 text-sm transition-colors",
                active ? "border-2 border-brand bg-surface font-semibold text-ink shadow-lip" : "font-medium text-ink-muted hover:text-ink",
              )}
            >
              {active && <Check className="size-4 shrink-0 text-brand" strokeWidth={2.5} aria-hidden />}
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
        "relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md text-sm text-ink-muted transition-colors hover:bg-tray hover:text-ink focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-ring",
        compact ? "px-2" : "px-3",
        className,
      )}
    >
      <Languages className="size-[18px] shrink-0" aria-hidden />
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

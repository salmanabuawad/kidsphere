"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Languages } from "lucide-react";
import { api } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import { LOCALES, LOCALE_NAMES, type AppLocale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

/** Switches the interface language; the whole document re-renders with the right dir (rtl/ltr). */
export function LocaleSwitcher({ className, compact }: { className?: string; compact?: boolean }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();

  async function change(next: AppLocale) {
    await api("/api/locale", { body: { locale: next } });
    start(() => router.refresh());
  }

  return (
    <label
      className={cn("relative flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100", pending && "opacity-60", className)}
    >
      <Languages className="size-4 shrink-0" aria-hidden />
      <span className="sr-only">{t("common.uiLanguage")}</span>
      <select
        value={locale}
        onChange={(e) => change(e.target.value as AppLocale)}
        className={cn("cursor-pointer appearance-none bg-transparent text-sm focus:outline-none", compact ? "w-16" : "flex-1")}
        data-testid="locale-switcher"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}

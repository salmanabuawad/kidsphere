import { useMemo } from "react";
import { INTL_LOCALE, type AppLocale } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import type { Translate } from "@/i18n/translate";
import { toDate } from "./utils";

/** Whole years and remaining months between a birth date and now (never negative). */
export function ageParts(birthDate: Date | string, now: Date = new Date()): { years: number; months: number } {
  const b = toDate(birthDate);
  let years = now.getFullYear() - b.getFullYear();
  let months = now.getMonth() - b.getMonth();
  if (now.getDate() < b.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return { years: 0, months: 0 };
  return { years, months };
}

/**
 * "4 years 2 months" / "4 سنوات وشهران" / "4 שנים וחודשיים".
 * Uses the plural keys common.age.years_* and common.age.months_* (Intl.PluralRules).
 */
export function formatAge(birthDate: Date | string, t: Translate, now: Date = new Date()): string {
  const { years, months } = ageParts(birthDate, now);
  const y = years > 0 ? t("common.age.years", { count: years }) : "";
  const m = months > 0 || years === 0 ? t("common.age.months", { count: months }) : "";
  if (y && m) return t(/^\d/.test(m) ? "common.age.joinNumber" : "common.age.join", { years: y, months: m });
  return y || m;
}

export function formatDate(d: Date | string, locale: AppLocale, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], opts).format(toDate(d));
}

export function formatDateTime(d: Date | string, locale: AppLocale): string {
  return formatDate(d, locale, { dateStyle: "medium", timeStyle: "short" });
}

/** "today", "yesterday", "3 days ago" (Intl.RelativeTimeFormat). */
export function formatRelativeDays(d: Date | string, locale: AppLocale, now: Date = new Date()): string {
  const date = toDate(d);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(date) - startOf(now)) / 86_400_000);
  return new Intl.RelativeTimeFormat(INTL_LOCALE[locale], { numeric: "auto" }).format(days, "day");
}

export function formatNumber(n: number, locale: AppLocale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale]).format(n);
}

/** Locale-bound helpers for components: const f = useFormat(); f.formatAge(child.birth_date). */
export function useFormat() {
  const { locale, t } = useI18n();
  return useMemo(
    () => ({
      formatAge: (birthDate: Date | string, now?: Date) => formatAge(birthDate, t, now),
      formatDate: (d: Date | string, opts?: Intl.DateTimeFormatOptions) => formatDate(d, locale, opts),
      formatDateTime: (d: Date | string) => formatDateTime(d, locale),
      formatRelativeDays: (d: Date | string, now?: Date) => formatRelativeDays(d, locale, now),
      formatNumber: (n: number) => formatNumber(n, locale),
    }),
    [locale, t],
  );
}

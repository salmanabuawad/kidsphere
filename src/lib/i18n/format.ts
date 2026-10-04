import type { AppLocale } from "./config";

const INTL: Record<AppLocale, string> = { ar: "ar-EG", he: "he-IL", en: "en-GB" };

export function formatDate(d: Date | string, locale: AppLocale, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  return new Intl.DateTimeFormat(INTL[locale], opts).format(typeof d === "string" ? new Date(d) : d);
}

export function formatDateTime(d: Date | string, locale: AppLocale) {
  return formatDate(d, locale, { dateStyle: "medium", timeStyle: "short" });
}

export function formatRelativeDays(d: Date | string, locale: AppLocale, now = new Date()) {
  const date = typeof d === "string" ? new Date(d) : d;
  const days = Math.round((date.getTime() - now.getTime()) / 86_400_000);
  return new Intl.RelativeTimeFormat(INTL[locale], { numeric: "auto" }).format(days, "day");
}

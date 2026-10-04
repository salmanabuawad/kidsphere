export const LOCALES = ["ar", "he", "en"] as const;
export type AppLocale = (typeof LOCALES)[number];

export const RTL_LOCALES: ReadonlySet<AppLocale> = new Set(["ar", "he"]);

export const LOCALE_NAMES: Record<AppLocale, string> = {
  ar: "العربية",
  he: "עברית",
  en: "English",
};

export function isLocale(v: unknown): v is AppLocale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

export function dirOf(locale: AppLocale): "rtl" | "ltr" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}

/** A label in every supported locale. Adding a locale makes TS flag every missing label. */
export type L = Record<AppLocale, string>;

export function pick(label: L, locale: AppLocale): string {
  return label[locale] || label.en;
}

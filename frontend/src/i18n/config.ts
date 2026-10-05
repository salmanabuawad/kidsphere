export const LOCALES = ["ar", "he", "en"] as const;
export type AppLocale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "ar";
export const LOCALE_STORAGE_KEY = "ks_locale";

export const RTL_LOCALES: ReadonlySet<AppLocale> = new Set(["ar", "he"]);

/** Each language's own name, shown in the switcher regardless of the current UI language. */
export const LOCALE_NAMES: Record<AppLocale, string> = {
  ar: "العربية",
  he: "עברית",
  en: "English",
};

/** Short labels for compact switchers. */
export const LOCALE_SHORT: Record<AppLocale, string> = {
  ar: "ع",
  he: "עב",
  en: "EN",
};

/** BCP-47 tags for Intl. Arabic uses Western digits (PLAN-ADJUSTMENTS C). */
export const INTL_LOCALE: Record<AppLocale, string> = {
  ar: "ar-u-nu-latn",
  he: "he-IL",
  en: "en",
};

export function isLocale(v: unknown): v is AppLocale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

export function dirOf(locale: AppLocale): "rtl" | "ltr" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}

/** A label in every supported locale (shape used by GET /api/options). */
export type Localized = Partial<Record<AppLocale, string>>;

export function pick(label: Localized | undefined | null, locale: AppLocale): string {
  if (!label) return "";
  return label[locale] || label.en || label.ar || label.he || "";
}

/** Apply lang + dir to <html>. Same logic as public/boot.js. */
export function applyDocumentLocale(locale: AppLocale, doc: Document = document) {
  doc.documentElement.lang = locale;
  doc.documentElement.dir = dirOf(locale);
}

export function readStoredLocale(): AppLocale | null {
  try {
    const v = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(v) ? v : null;
  } catch {
    return null;
  }
}

export function storeLocale(locale: AppLocale) {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* storage blocked */
  }
}

/** The locale boot.js already applied, else storage, else the default. */
export function initialLocale(): AppLocale {
  if (typeof document !== "undefined" && isLocale(document.documentElement.lang)) return document.documentElement.lang;
  return readStoredLocale() ?? DEFAULT_LOCALE;
}

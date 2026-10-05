import { useMemo } from "react";
import { dirOf, isLocale, type AppLocale } from "@/i18n/config";
import { createTranslator, type Translate } from "@/i18n/translate";

export type Dir = "rtl" | "ltr";

/** Content language from an API value; unknown values fall back to the product default (Arabic). */
export function toContentLocale(v: unknown): AppLocale {
  return isLocale(v) ? v : "ar";
}

/** Direction of the content: an explicit `dir` wins, else it follows the content language. */
export function contentDir(lang: AppLocale, dir?: Dir): Dir {
  return dir ?? dirOf(lang);
}

/**
 * Player strings are shown in the content language (not the adult UI
 * language), so a child hears and reads one language on screen. Works without
 * I18nProvider, which keeps the player components pure and easy to embed.
 */
export function usePlayerText(lang: AppLocale): Translate {
  return useMemo(() => createTranslator(lang).t, [lang]);
}

/** BCP-47 tag for speechSynthesis voices. */
export const SPEECH_LANG: Record<AppLocale, string> = { ar: "ar", he: "he-IL", en: "en-US" };

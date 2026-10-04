"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { type AppLocale, dirOf } from "./config";
import { DICTIONARIES } from "./dictionaries";
import { createTranslator, type Translate } from "./translate";

type Ctx = { locale: AppLocale; dir: "rtl" | "ltr"; t: Translate };
const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ locale, children }: { locale: AppLocale; children: ReactNode }) {
  const value = useMemo<Ctx>(() => ({ locale, dir: dirOf(locale), t: createTranslator(DICTIONARIES[locale], DICTIONARIES.en) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}

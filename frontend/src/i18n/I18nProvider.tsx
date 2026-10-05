import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AuthContext, type User } from "@/auth/AuthProvider";
import { api } from "@/lib/api";
import { applyDocumentLocale, dirOf, initialLocale, INTL_LOCALE, isLocale, storeLocale, type AppLocale } from "./config";
import { createTranslator, type Translate } from "./translate";

export type I18nContextValue = {
  locale: AppLocale;
  dir: "rtl" | "ltr";
  /** BCP-47 tag for Intl (ar-u-nu-latn, he-IL, en). */
  intlLocale: string;
  /** t("auth.signIn"), t("common.age.years", {count: 4}) — first segment is the namespace file. */
  t: Translate;
  has: (key: string) => boolean;
  /** Switch the UI language: updates <html lang dir>, localStorage and (when signed in) PUT /api/me. */
  setLocale: (locale: AppLocale) => Promise<void>;
};

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Must sit inside AuthProvider: it adopts `user.language` after sign-in and
 * persists language changes to the signed-in user.
 */
export function I18nProvider({ children, locale: forced }: { children: ReactNode; locale?: AppLocale }) {
  const auth = useContext(AuthContext);
  const [locale, setLocaleState] = useState<AppLocale>(() => forced ?? initialLocale());
  const authRef = useRef(auth);
  authRef.current = auth;

  // Keep <html lang dir> in sync before paint.
  useLayoutEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  // Adopt the signed-in user's saved language.
  const userLanguage = auth?.user?.language;
  const userId = auth?.user?.id;
  useEffect(() => {
    if (isLocale(userLanguage)) {
      setLocaleState(userLanguage);
      applyDocumentLocale(userLanguage);
      storeLocale(userLanguage);
    }
  }, [userId, userLanguage]);

  const setLocale = useCallback(async (next: AppLocale) => {
    setLocaleState(next);
    applyDocumentLocale(next);
    storeLocale(next);
    const a = authRef.current;
    if (a?.user && a.user.language !== next) {
      try {
        const res = await api<{ user: User }>("/api/me", { method: "PUT", body: { language: next } });
        if (res?.user) a.setUser(res.user);
      } catch {
        // The switch still applies locally; it is saved to the account next time.
      }
    }
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const tr = createTranslator(locale);
    return { locale, dir: dirOf(locale), intlLocale: INTL_LOCALE[locale], t: tr.t, has: tr.has, setLocale };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}

/** Shorthand when only t() is needed. */
export function useT(): Translate {
  return useI18n().t;
}

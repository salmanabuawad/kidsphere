import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { getActor } from "@/lib/auth/session";
import { LOCALE_COOKIE } from "@/lib/auth/cookies";
import { type AppLocale, dirOf, isLocale } from "./config";
import { DICTIONARIES } from "./dictionaries";
import { createTranslator } from "./translate";

/** UI locale: explicit cookie → signed-in user's preference → DEFAULT_LOCALE. */
export const getLocale = cache(async (): Promise<AppLocale> => {
  const jar = await cookies();
  const fromCookie = jar.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const actor = await getActor();
  if (actor && isLocale(actor.uiLocale)) return actor.uiLocale;
  const fallback = process.env.DEFAULT_LOCALE;
  return isLocale(fallback) ? fallback : "ar";
});

export async function getI18n() {
  const locale = await getLocale();
  return {
    locale,
    dir: dirOf(locale),
    t: createTranslator(DICTIONARIES[locale], DICTIONARIES.en),
  };
}

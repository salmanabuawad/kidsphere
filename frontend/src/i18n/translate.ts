import { INTL_LOCALE, LOCALES, type AppLocale } from "./config";

/**
 * Dictionaries: one JSON file per namespace and locale,
 *   src/i18n/messages/<locale>/<namespace>.json
 * Feature packages add their own namespace files; nothing needs registering.
 * Keys are `<namespace>.<path.inside.the.json>`, e.g. t("auth.signIn").
 */
export type Dict = { [key: string]: string | Dict };
export type Dictionaries = Record<AppLocale, Record<string, Dict>>;
export type TranslateVars = Record<string, string | number>;
export type Translate = (key: string, vars?: TranslateVars) => string;

export const PLURAL_SUFFIXES = ["zero", "one", "two", "few", "many", "other"] as const;

const modules = import.meta.glob<Dict>("./messages/*/*.json", { eager: true, import: "default" });

export function buildDictionaries(mods: Record<string, Dict>): Dictionaries {
  const out = Object.fromEntries(LOCALES.map((l) => [l, {} as Record<string, Dict>])) as Dictionaries;
  for (const [path, dict] of Object.entries(mods)) {
    const m = /\/messages\/([a-z]{2})\/([\w-]+)\.json$/.exec(path);
    if (!m) continue;
    const locale = m[1] as AppLocale;
    if (out[locale]) out[locale][m[2]!] = dict;
  }
  return out;
}

export const DICTIONARIES: Dictionaries = buildDictionaries(modules);

function lookup(dicts: Record<string, Dict>, key: string): string | undefined {
  const parts = key.split(".");
  let cur: string | Dict | undefined = dicts[parts[0]!];
  for (let i = 1; i < parts.length; i++) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[parts[i]!];
  }
  return typeof cur === "string" ? cur : undefined;
}

const pluralRulesCache = new Map<AppLocale, Intl.PluralRules>();
function pluralCategory(locale: AppLocale, n: number): string {
  let rules = pluralRulesCache.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(INTL_LOCALE[locale]);
    pluralRulesCache.set(locale, rules);
  }
  return rules.select(n);
}

/** Resolve a key in one locale: plural form (`key_one`, `key_few`…, then `key_other`) when vars.count is a number, else the key. */
function resolve(dicts: Dictionaries, locale: AppLocale, key: string, vars?: TranslateVars): string | undefined {
  const d = dicts[locale];
  if (!d) return undefined;
  const count = vars?.count;
  if (typeof count === "number") {
    const plural = lookup(d, `${key}_${pluralCategory(locale, count)}`) ?? lookup(d, `${key}_other`);
    if (plural !== undefined) return plural;
  }
  return lookup(d, key);
}

/** ICU-lite interpolation: `{name}` is replaced by vars.name; unknown placeholders are left as they are. */
export function interpolate(s: string, vars?: TranslateVars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

export type Translator = { t: Translate; has: (key: string) => boolean };

/** Missing keys fall back to English, then to the key itself; never a crash. */
export function createTranslator(locale: AppLocale, dicts: Dictionaries = DICTIONARIES): Translator {
  const t: Translate = (key, vars) => {
    const s = resolve(dicts, locale, key, vars) ?? resolve(dicts, "en", key, vars);
    if (s === undefined) {
      if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${key}`);
      return key;
    }
    return interpolate(s, vars);
  };
  const has = (key: string) => resolve(dicts, locale, key) !== undefined || resolve(dicts, "en", key) !== undefined;
  return { t, has };
}

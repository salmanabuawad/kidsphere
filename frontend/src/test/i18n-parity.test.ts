import { describe, expect, it } from "vitest";
import { LOCALES } from "@/i18n/config";
import { PLURAL_SUFFIXES, type Dict } from "@/i18n/translate";

/**
 * Every namespace file exists for en, ar and he, and every key in one locale
 * exists in the others. Plural keys (`x_one`, `x_few`…) are compared by their
 * base `x`, because languages have different plural categories; each plural
 * base must have an `_other` form in every locale.
 */
const files = import.meta.glob<Dict>("../i18n/messages/*/*.json", { eager: true, import: "default" });

type Flat = Map<string, string>;
const PLURAL_RE = new RegExp(`_(${PLURAL_SUFFIXES.join("|")})$`);

function flatten(d: Dict, prefix = "", out: Flat = new Map()): Flat {
  for (const [k, v] of Object.entries(d)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(key, v);
    else if (v && typeof v === "object") flatten(v, key, out);
    else out.set(key, v as unknown as string);
  }
  return out;
}

const byLocale = new Map<string, Map<string, Flat>>();
for (const [path, dict] of Object.entries(files)) {
  const m = /messages\/(\w+)\/([\w-]+)\.json$/.exec(path)!;
  const [, locale, ns] = m;
  if (!byLocale.has(locale!)) byLocale.set(locale!, new Map());
  byLocale.get(locale!)!.set(ns!, flatten(dict));
}

const namespaces = [...new Set([...byLocale.values()].flatMap((m) => [...m.keys()]))].sort();

const base = (k: string) => k.replace(PLURAL_RE, "");
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("i18n dictionaries", () => {
  it("has the core namespaces", () => {
    for (const ns of ["common", "nav", "auth", "errors", "account"]) expect(namespaces).toContain(ns);
  });

  it("only uses known locale folders", () => {
    for (const l of byLocale.keys()) expect(LOCALES as readonly string[]).toContain(l);
  });

  for (const ns of namespaces) {
    describe(`namespace ${ns}`, () => {
      it("exists in every locale", () => {
        for (const l of LOCALES) expect(byLocale.get(l)?.has(ns), `${l}/${ns}.json missing`).toBe(true);
      });

      it("has the same keys in en, ar and he", () => {
        const sets = LOCALES.map((l) => new Set([...(byLocale.get(l)?.get(ns)?.keys() ?? [])].map(base)));
        const all = new Set(sets.flatMap((s) => [...s]));
        const missing: string[] = [];
        for (const key of all) LOCALES.forEach((l, i) => !sets[i]!.has(key) && missing.push(`${l}: ${ns}.${key}`));
        expect(missing).toEqual([]);
      });

      it("has non-empty string values", () => {
        const bad: string[] = [];
        for (const l of LOCALES)
          for (const [k, v] of byLocale.get(l)?.get(ns) ?? []) if (typeof v !== "string" || !v.trim()) bad.push(`${l}: ${ns}.${k}`);
        expect(bad).toEqual([]);
      });

      it("has an _other form for every plural key", () => {
        const bad: string[] = [];
        for (const l of LOCALES) {
          const flat = byLocale.get(l)?.get(ns) ?? new Map();
          const plurals = new Set([...flat.keys()].filter((k) => PLURAL_RE.test(k)).map(base));
          for (const p of plurals) if (!flat.has(`${p}_other`)) bad.push(`${l}: ${ns}.${p}_other`);
        }
        expect(bad).toEqual([]);
      });

      it("uses the same {placeholders} in every locale (non-plural keys)", () => {
        const en = byLocale.get("en")?.get(ns) ?? new Map();
        const bad: string[] = [];
        for (const [k, v] of en) {
          if (PLURAL_RE.test(k)) continue;
          for (const l of LOCALES) {
            const other = byLocale.get(l)?.get(ns)?.get(k);
            if (other !== undefined && placeholders(other).join() !== placeholders(v).join()) bad.push(`${l}: ${ns}.${k}`);
          }
        }
        expect(bad).toEqual([]);
      });
    });
  }
});

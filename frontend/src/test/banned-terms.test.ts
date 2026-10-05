import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Dict } from "@/i18n/translate";

/**
 * PLAN-ADJUSTMENTS B11: no clinical / deficit wording and no numeric scoring in
 * UI strings. Terms come from backend/app/data/options.json → banned_terms
 * (shared with the backend safety check); the test skips that part when the
 * file is not there yet. Latin terms match on word boundaries; Arabic and
 * Hebrew match as substrings (prefixes attach to words). allow_phrases are
 * removed before matching.
 */
const files = import.meta.glob<Dict>("../i18n/messages/*/*.json", { eager: true, import: "default" });
const SCORING = /\d+\s*%|\bscore\b|\bpoints\b/i;

type Lang = "en" | "ar" | "he";
type TermLists = Partial<Record<Lang, string[]>>;
type BannedTerms = { clinical?: TermLists; child_deficit?: TermLists; allow_phrases?: TermLists | string[] };

const OPTIONS_PATH = resolve(process.cwd(), "../backend/app/data/options.json");

function loadBanned(): BannedTerms | null {
  if (!existsSync(OPTIONS_PATH)) return null;
  try {
    const json = JSON.parse(readFileSync(OPTIONS_PATH, "utf8")) as { banned_terms?: BannedTerms };
    return json.banned_terms ?? null;
  } catch {
    return null;
  }
}

function strings(d: Dict, prefix = ""): [string, string][] {
  return Object.entries(d).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === "string" ? [[key, v] as [string, string]] : strings(v, key);
  });
}

const entries = Object.entries(files).flatMap(([path, dict]) => {
  const [, lang, ns] = /messages\/(\w+)\/([\w-]+)\.json$/.exec(path)!;
  return strings(dict).map(([key, value]) => ({ lang: lang as Lang, where: `${lang}/${ns}.${key}`, value }));
});

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function matcher(term: string, lang: Lang): (text: string) => boolean {
  const t = term.trim().toLowerCase();
  if (!t) return () => false;
  if (lang === "en" || /^[\x20-\x7e]+$/.test(t)) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escape(t)}(?![\\p{L}\\p{N}])`, "iu");
    return (text) => re.test(text);
  }
  return (text) => text.toLowerCase().includes(t);
}

describe("UI strings: banned terms", () => {
  it("no percentages, scores or points in any messages file", () => {
    const bad = entries.filter((e) => SCORING.test(e.value)).map((e) => `${e.where}: ${e.value}`);
    expect(bad).toEqual([]);
  });

  const banned = loadBanned();
  it.skipIf(!banned)("no clinical or child-deficit terms (backend/app/data/options.json banned_terms)", () => {
    const b = banned!;
    const allow = (lang: Lang): string[] => {
      const a = b.allow_phrases;
      if (!a) return [];
      if (Array.isArray(a)) return a;
      return [...(a[lang] ?? []), ...(lang === "en" ? [] : (a.en ?? []))];
    };
    const bad: string[] = [];
    for (const e of entries) {
      let text = e.value;
      for (const phrase of allow(e.lang)) if (phrase) text = text.replace(new RegExp(escape(phrase), "giu"), " ");
      for (const list of [b.clinical, b.child_deficit]) {
        for (const term of list?.[e.lang] ?? []) if (matcher(term, e.lang)(text)) bad.push(`${e.where}: "${term}" in "${e.value}"`);
      }
    }
    expect(bad).toEqual([]);
  });
});

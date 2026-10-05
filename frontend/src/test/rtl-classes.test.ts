import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * True RTL: only logical utilities (ms/me/ps/pe/start/end/border-s/border-e/
 * text-start/rounded-s/rounded-e). Physical ones are banned in every source file.
 */
const SRC = resolve(process.cwd(), "src");
const TEST_DIR = join(SRC, "test");

// A class token starts at the beginning of a string or after whitespace, a quote, a brace, a paren, ':' (variants) or '!' (important).
const START = String.raw`(?<=^|[\s"'\x60{(:!])`;
const BANNED: RegExp[] = [
  new RegExp(`${START}-?(?:ml|mr|pl|pr|left|right|scroll-ml|scroll-mr|scroll-pl|scroll-pr)-[\\w\\[.]`, "g"),
  new RegExp(`${START}(?:text-left|text-right|float-left|float-right|clear-left|clear-right)(?![\\w-])`, "g"),
  new RegExp(`${START}(?:rounded-(?:l|r|tl|tr|bl|br)|border-(?:l|r))(?![\\w])`, "g"),
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return p === TEST_DIR ? [] : walk(p);
    return /\.(tsx|ts)$/.test(name) ? [p] : [];
  });
}

describe("RTL class ban", () => {
  it("self-check: the patterns catch physical classes and allow logical ones", () => {
    const hit = (s: string) => BANNED.some((re) => new RegExp(re.source).test(s));
    for (const bad of ["ml-2", "mr-auto", "pl-4", "pr-3", "-ml-1", "md:pl-6", "left-0", "right-2", "-left-4", "text-left", "text-right", "rounded-l-xl", "rounded-r", "border-l", "border-r-2", "!pr-0"])
      expect(hit(`"${bad}"`), bad).toBe(true);
    for (const ok of ["ms-2", "me-auto", "ps-4", "pe-3", "start-0", "end-2", "text-start", "rounded-lg", "rounded-s-xl", "border-line", "border-e", "rounded-e-xl", "inset-x-0", "ArrowLeft"])
      expect(hit(`"${ok}"`), ok).toBe(false);
  });

  it("no physical direction classes in src/**/*.tsx and *.ts", () => {
    const found: string[] = [];
    for (const file of walk(SRC)) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          for (const re of BANNED) {
            for (const m of line.matchAll(new RegExp(re.source, "g"))) found.push(`${relative(SRC, file)}:${i + 1}: ${m[0]}`);
          }
        });
    }
    expect(found).toEqual([]);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The colour tokens in src/index.css keep WCAG 2.x contrast in both themes (design spec 2.4 and 2.5):
 * 4.5:1 for text and glyphs on their grounds, 3:1 for control borders, selection borders and the focus ring.
 */
const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

/** The `--name: #hex;` declarations of the rule whose selector starts at `selector` (brace-matched). */
function tokens(selector: string): Record<string, string> {
  const start = CSS.indexOf(selector);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const open = CSS.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (; end < CSS.length; end++) {
    if (CSS[end] === "{") depth++;
    else if (CSS[end] === "}" && --depth === 0) break;
  }
  const body = CSS.slice(open + 1, end);
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)].map(([, name, hex]) => [name, hex.toLowerCase()]));
}

const LIGHT = tokens("\n:root {");
const DARK = tokens(':root:not([data-theme="light"]) {');
const DARK_FORCED = tokens(':root[data-theme="dark"] {');

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const GROUNDS = ["ground", "surface", "surface-raised", "tray"];
const TINTS = ["strength-soft", "interest-soft", "helps-soft", "focus-soft", "attention-soft", "brand-soft", "accent-soft"];
const TONES = ["strength", "interest", "helps", "focus", "attention"];

type Pair = [fg: string, bg: string, min: number];
const PAIRS: Pair[] = [
  ...["ink", "ink-muted"].flatMap((fg) => [...GROUNDS, ...TINTS].map((bg): Pair => [fg, bg, 4.5])),
  ...["brand", "brand-strong"].flatMap((fg) => [...GROUNDS, "brand-soft"].map((bg): Pair => [fg, bg, 4.5])),
  ...[...GROUNDS, "accent-soft"].map((bg): Pair => ["accent-strong", bg, 4.5]),
  ...["brand", "brand-strong", "danger", ...TONES.map((t) => `${t}-ink`)].map((bg): Pair => ["on-brand", bg, 4.5]),
  ["on-accent", "accent", 4.5],
  ...TONES.flatMap((t) => [...GROUNDS, `${t}-soft`].map((bg): Pair => [`${t}-ink`, bg, 4.5])),
  ...GROUNDS.map((bg): Pair => ["danger", bg, 4.5]),
  ["ground", "ink", 4.5],
  ...["sun", "berry", "leaf", "grape", "tangerine", "sky"].map((p): Pair => ["on-paint", `paint-${p}`, 4.5]),
  ...GROUNDS.map((bg): Pair => ["line-strong", bg, 3]),
  ...[...GROUNDS, ...TINTS].map((bg): Pair => ["ring", bg, 3]),
  ...GROUNDS.map((bg): Pair => ["brand", bg, 3]),
  ...GROUNDS.map((bg): Pair => ["accent-strong", bg, 3]),
];

describe("colour tokens", () => {
  it("define the same colour tokens in light and in both dark blocks", () => {
    expect(Object.keys(DARK).sort()).toEqual(Object.keys(LIGHT).sort());
    expect(DARK_FORCED).toEqual(DARK);
    for (const name of ["brand", "brand-strong", "brand-soft", "on-brand", "accent", "accent-strong", "accent-soft", "on-accent", "ring"])
      expect(LIGHT[name], name).toMatch(/^#[0-9a-f]{6}$/);
  });

  it.each([
    ["light", LIGHT],
    ["dark", DARK],
  ] as const)("hold WCAG contrast in %s", (_theme, t) => {
    const failing = PAIRS.filter(([fg, bg, min]) => contrast(t[fg], t[bg]) < min).map(
      ([fg, bg, min]) => `${fg} on ${bg}: ${contrast(t[fg], t[bg]).toFixed(2)} < ${min}`,
    );
    expect(failing).toEqual([]);
  });

  it("measures contrast like WCAG 2.x (self-check)", () => {
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrast("#1f2233", "#fbf6ec")).toBeCloseTo(14.6, 1);
  });
});

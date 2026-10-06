/**
 * KidSphere icon set: master geometry (design spec section 5).
 *
 * 24x24 grid, 2px safe margin, stroke 2 with round caps and joins. Every icon is
 * built from blocks, balls, roofs and arches. Overlaps are authored as open paths,
 * so the outline-only state never shows a line passing behind another shape.
 *
 * Each entry has:
 *  - `fill`: the ONE painted primitive, drawn under the outline (fill only).
 *  - `line`: the outline (stroke only). A third tuple item is a stroke-weight multiplier.
 *  - `ink`: small solid details in the outline colour (pupil, antenna balls).
 *  - `paint`: which paint token the `fill` uses by default.
 *  - `mirror`: flips under RTL (spec 5.3).
 *
 * The design-system SVGs (assets/Icons/*.svg) are exported from this same geometry. The set
 * holds UI icons only: the KidSphere logo is artwork (components/brand/Logo.tsx), and the old
 * block-tower mark survives only as the present-mode finish tower (features/games/FinishScreen).
 */

export type IconTag = "path" | "circle" | "rect" | "polygon";
export type IconElement = readonly [tag: IconTag, attrs: Readonly<Record<string, string | number>>, weight?: number];
export type PaintKey = "brand" | "sky" | "sun" | "berry" | "leaf" | "grape" | "tangerine";

export interface KidIconDef {
  readonly paint?: PaintKey;
  readonly mirror?: boolean;
  readonly fill?: readonly IconElement[];
  readonly line?: readonly IconElement[];
  readonly ink?: readonly IconElement[];
}

export const iconDefs = {
  /** Nav: Children (teacher home). Two block kids; paint on the smaller body. */
  children: {
    paint: "brand",
    fill: [
      ["path", { d: "M13.39 15.98A4 4 0 0 1 20.5 18.5V20H13.5V17A5 5 0 0 0 13.39 15.98Z" }],
    ],
    line: [
      ["circle", { cx: 8.5, cy: 6, r: 3 }],
      ["path", { d: "M3.5 20V17A5 5 0 0 1 13.5 17V20Z" }],
      ["circle", { cx: 16.5, cy: 9, r: 2.5 }],
      ["path", { d: "M13.39 15.98A4 4 0 0 1 20.5 18.5V20H13.5" }],
    ],
  },
  /** Centre action: Add observation. Lens with a bold plus; paint on the lens. */
  "observe-add": {
    paint: "brand",
    fill: [
      ["circle", { cx: 10.5, cy: 10.5, r: 6.5 }],
    ],
    line: [
      ["circle", { cx: 10.5, cy: 10.5, r: 6.5 }],
      ["path", { d: "M15.4 15.4L20.5 20.5" }, 1.5],
      ["path", { d: "M8 10.5H13M10.5 8V13" }, 1.25],
    ],
  },
  /** Nav: Development timeline. Beads on a string (baseline, observation, activity result); paint on the newest bead. */
  timeline: {
    paint: "brand",
    mirror: true,
    fill: [
      ["rect", { x: 16, y: 9.5, width: 5, height: 5, rx: 1.5 }],
    ],
    line: [
      ["path", { d: "M2 12H3.8M6.6 12H9.25M13.65 12H16M21 12H22" }],
      ["path", { d: "M2.4 14.6L5.2 9.4L8 14.6Z" }],
      ["circle", { cx: 11.45, cy: 12, r: 2.2 }],
      ["rect", { x: 16, y: 9.5, width: 5, height: 5, rx: 1.5 }],
    ],
  },
  /** Nav / button: View development. Block steps with a ball on the top step; paint on the ball. */
  development: {
    paint: "brand",
    mirror: true,
    fill: [
      ["circle", { cx: 18, cy: 5.25, r: 2.25 }],
    ],
    line: [
      ["path", { d: "M4.5 20A1.5 1.5 0 0 1 3 18.5V17.5A1.5 1.5 0 0 1 4.5 16H9V13.5A1.5 1.5 0 0 1 10.5 12H15V9.5A1.5 1.5 0 0 1 16.5 8H19.5A1.5 1.5 0 0 1 21 9.5V18.5A1.5 1.5 0 0 1 19.5 20Z" }],
      ["path", { d: "M9 16V20M15 12V20" }],
      ["circle", { cx: 18, cy: 5.25, r: 2.25 }],
    ],
  },
  /** Nav: Content library / Create content. Open toy box; paint on the box. */
  content: {
    paint: "brand",
    fill: [
      ["rect", { x: 3, y: 11, width: 18, height: 9.5, rx: 2.5 }],
    ],
    line: [
      ["rect", { x: 3, y: 11, width: 18, height: 9.5, rx: 2.5 }],
      ["path", { d: "M5.82 11A2.25 2.25 0 1 1 9.18 11" }],
      ["path", { d: "M10 11L12.5 5.5L15 11" }],
      ["path", { d: "M16 11V9A1.5 1.5 0 0 1 17.5 7.5H18.5A1.5 1.5 0 0 1 20 9V11" }],
    ],
  },
  /** Nav: My account. Name block with a head and shoulders; paint on the shoulders. */
  account: {
    paint: "brand",
    fill: [
      ["path", { d: "M6.5 21V20A5.5 5.5 0 0 1 17.5 20V21Z" }],
    ],
    line: [
      ["rect", { x: 3, y: 3, width: 18, height: 18, rx: 5 }],
      ["circle", { cx: 12, cy: 9, r: 2.75 }],
      ["path", { d: "M6.5 20.77V20A5.5 5.5 0 0 1 17.5 20V20.77" }],
    ],
  },
  /** Admin nav: Users. Two fanned ID cards; paint on the front card. */
  users: {
    paint: "brand",
    fill: [
      ["rect", { x: 3, y: 6, width: 13, height: 16, rx: 2.5 }],
    ],
    line: [
      ["path", { d: "M8 6.86V5.5A2.5 2.5 0 0 1 10.5 3H18.5A2.5 2.5 0 0 1 21 5.5V16.5A2.5 2.5 0 0 1 18.5 19H17.14", transform: "rotate(8 14.5 11)" }],
      ["rect", { x: 3, y: 6, width: 13, height: 16, rx: 2.5 }],
      ["circle", { cx: 9.5, cy: 11.5, r: 2 }],
      ["path", { d: "M6.5 16.5H12.5M6.5 19H10.5" }],
    ],
  },
  /** Admin nav: Classes. Kindergarten house; paint on the roof. */
  classes: {
    paint: "brand",
    fill: [
      ["path", { d: "M3 11.5L12 3.5L21 11.5Z" }],
    ],
    line: [
      ["path", { d: "M5 11.5V19A2 2 0 0 0 7 21H17A2 2 0 0 0 19 19V11.5" }],
      ["path", { d: "M3 11.5L12 3.5L21 11.5Z" }],
      ["circle", { cx: 12, cy: 8.3, r: 1.5 }],
      ["path", { d: "M10 21V17A2 2 0 0 1 14 17V21" }],
    ],
  },
  /** Parent nav: Home. House with a heart; paint on the heart. */
  "parent-home": {
    paint: "brand",
    fill: [
      ["path", { d: "M12 18.5L8.95 16.34A2.25 2.25 0 1 1 12 13.09A2.25 2.25 0 1 1 15.05 16.34Z" }],
    ],
    line: [
      ["path", { d: "M3 11L12 3.5L21 11" }],
      ["path", { d: "M5 9.33V19A2 2 0 0 0 7 21H17A2 2 0 0 0 19 19V9.33" }],
      ["path", { d: "M12 18.5L8.95 16.34A2.25 2.25 0 1 1 12 13.09A2.25 2.25 0 1 1 15.05 16.34Z" }],
    ],
  },
  /** Content type: Personalized story. Open picture book; paint on the start page (a sky with a sun). */
  story: {
    paint: "sky",
    mirror: true,
    fill: [
      ["path", { d: "M12 6.5H7.5A4 4 0 0 0 3.5 10.5V19.5H12Z" }],
    ],
    line: [
      ["path", { d: "M12 6.5H7.5A4 4 0 0 0 3.5 10.5V19.5H12" }],
      ["path", { d: "M12 6.5H16.5A4 4 0 0 1 20.5 10.5V19.5H12" }],
      ["path", { d: "M12 6.5V20" }],
      ["circle", { cx: 7.5, cy: 11, r: 1.75 }],
      ["path", { d: "M14.5 11H18M14.5 14.5H18" }],
    ],
  },
  /** Content type: Personalized video. Rabbit-ear TV; paint on the play triangle. */
  video: {
    paint: "sky",
    fill: [
      ["path", { d: "M10 10.5L15.5 13.5L10 16.5Z" }],
    ],
    line: [
      ["rect", { x: 3, y: 7, width: 18, height: 13, rx: 3 }],
      ["path", { d: "M12 7L8 3M12 7L16 3" }],
      ["path", { d: "M10 10.5L15.5 13.5L10 16.5Z" }],
    ],
    ink: [
      ["circle", { cx: 8, cy: 3, r: 1.5 }],
      ["circle", { cx: 16, cy: 3, r: 1.5 }],
    ],
  },
  /** Content type: Digital game. Puzzle block; paint on the block. */
  game: {
    paint: "sky",
    fill: [
      ["path", { d: "M5 9.5A2.5 2.5 0 0 1 7.5 7H8.75A2.25 2.25 0 0 1 13.25 7H14.5A2.5 2.5 0 0 1 17 9.5V10.75A2.25 2.25 0 0 1 17 15.25V16.5A2.5 2.5 0 0 1 14.5 19H13.25A2.25 2.25 0 0 0 8.75 19H7.5A2.5 2.5 0 0 1 5 16.5Z" }],
    ],
    line: [
      ["path", { d: "M5 9.5A2.5 2.5 0 0 1 7.5 7H8.75A2.25 2.25 0 0 1 13.25 7H14.5A2.5 2.5 0 0 1 17 9.5V10.75A2.25 2.25 0 0 1 17 15.25V16.5A2.5 2.5 0 0 1 14.5 19H13.25A2.25 2.25 0 0 0 8.75 19H7.5A2.5 2.5 0 0 1 5 16.5Z" }],
    ],
  },
  /** Content type: Real-world activity. Floor blocks (bridge, roof piece, cube); paint on the cube. */
  activity: {
    paint: "sky",
    fill: [
      ["path", { d: "M16 20.5V17A1.5 1.5 0 0 1 17.5 15.5H19.5A1.5 1.5 0 0 1 21 17V20.5Z" }],
    ],
    line: [
      ["path", { d: "M2 20.5H22" }],
      ["path", { d: "M2.5 20.5V15A1.5 1.5 0 0 1 4 13.5H12.5A1.5 1.5 0 0 1 14 15V20.5" }],
      ["path", { d: "M5.25 20.5A3 3 0 0 1 11.25 20.5" }],
      ["path", { d: "M3 13.5L5.75 8.5L8.5 13.5" }],
      ["path", { d: "M16 20.5V17A1.5 1.5 0 0 1 17.5 15.5H19.5A1.5 1.5 0 0 1 21 17V20.5" }],
    ],
  },
  /** Content type: Pack. Backpack; paint on the pocket. */
  pack: {
    paint: "sky",
    fill: [
      ["rect", { x: 8, y: 13.5, width: 8, height: 5, rx: 1.5 }],
    ],
    line: [
      ["path", { d: "M5 13A7 7 0 0 1 19 13V18.5A2.5 2.5 0 0 1 16.5 21H7.5A2.5 2.5 0 0 1 5 18.5Z" }],
      ["rect", { x: 8, y: 13.5, width: 8, height: 5, rx: 1.5 }],
      ["path", { d: "M9.5 6.46V5.5A2.5 2.5 0 0 1 14.5 5.5V6.46" }],
    ],
  },
  /** Mode: Strength Builder. Star on a block; paint-sun star. */
  "strength-builder": {
    paint: "sun",
    fill: [
      ["polygon", { points: "12,3.4 13.35,6.54 16.76,6.85 14.19,9.11 14.94,12.45 12,10.7 9.06,12.45 9.81,9.11 7.24,6.85 10.65,6.54" }],
    ],
    line: [
      ["rect", { x: 5, y: 13, width: 14, height: 8, rx: 2 }],
      ["polygon", { points: "12,3.4 13.35,6.54 16.76,6.85 14.19,9.11 14.94,12.45 12,10.7 9.06,12.45 9.81,9.11 7.24,6.85 10.65,6.54" }],
    ],
  },
  /** Mode: Growth Support. Sprout in a block pot; paint-grape pot. */
  "growth-support": {
    paint: "grape",
    fill: [
      ["path", { d: "M6 14H18L16 21H8Z" }],
    ],
    line: [
      ["path", { d: "M6 14H18L16 21H8Z" }],
      ["path", { d: "M12 14V7" }],
      ["path", { d: "M12 10A2.8 1.6 -153.43 0 0 7 7.5Z" }],
      ["path", { d: "M12 8.5A2.92 1.6 -30.96 0 1 17 5.5Z" }],
    ],
  },
  /** Section and chip: Strengths. Gold-star sticker; paint-sun star. */
  strengths: {
    paint: "sun",
    fill: [
      ["polygon", { points: "12,3.5 14.47,9.1 20.56,9.72 15.99,13.8 17.29,19.78 12,16.7 6.71,19.78 8.01,13.8 3.44,9.72 9.53,9.1" }],
    ],
    line: [
      ["polygon", { points: "12,3.5 14.47,9.1 20.56,9.72 15.99,13.8 17.29,19.78 12,16.7 6.71,19.78 8.01,13.8 3.44,9.72 9.53,9.1" }],
    ],
  },
  /** Section and chip: Interests. Heart; paint-berry heart. */
  interests: {
    paint: "berry",
    fill: [
      ["path", { d: "M12 20L4.79 12.65A4.5 4.5 0 1 1 12 7.44A4.5 4.5 0 1 1 19.21 12.65Z" }],
    ],
    line: [
      ["path", { d: "M12 20L4.79 12.65A4.5 4.5 0 1 1 12 7.44A4.5 4.5 0 1 1 19.21 12.65Z" }],
    ],
  },
  /** Section and chip: What helps. Ticked block; paint-leaf block. */
  "what-helps": {
    paint: "leaf",
    fill: [
      ["rect", { x: 3.5, y: 6.5, width: 14, height: 14, rx: 3 }],
    ],
    line: [
      ["path", { d: "M17.5 13.5V17.5A3 3 0 0 1 14.5 20.5H6.5A3 3 0 0 1 3.5 17.5V9.5A3 3 0 0 1 6.5 6.5H15" }],
      ["path", { d: "M7.5 13.5L11 17L20.5 4.5" }, 1.25],
    ],
  },
  /** Section: Current focus. Flag in a target; paint-grape pennant. */
  "current-focus": {
    paint: "grape",
    mirror: true,
    fill: [
      ["path", { d: "M12 2.5L19.5 5.25L12 8Z" }],
    ],
    line: [
      ["path", { d: "M15.68 6.65A8 8 0 1 1 12 5.75" }],
      ["circle", { cx: 12, cy: 13.75, r: 3.25 }],
      ["path", { d: "M12 13.75V2.5" }],
      ["path", { d: "M12 2.5L19.5 5.25L12 8Z" }],
    ],
  },
  /** Worth a look (never red). Friendly eye; paint-tangerine iris. */
  attention: {
    paint: "tangerine",
    fill: [
      ["circle", { cx: 12, cy: 12, r: 3.5 }],
    ],
    line: [
      ["path", { d: "M2.5 12Q12 3 21.5 12Q12 21 2.5 12Z" }],
      ["circle", { cx: 12, cy: 12, r: 3.5 }],
      ["path", { d: "M7 6.3L6 4.6M12 4.7V2.7M17 6.3L18 4.6" }],
    ],
    ink: [
      ["circle", { cx: 12, cy: 12, r: 1.25 }],
    ],
  },
  /** Observation entry, Recent development quote. Speech block; paint-sky on the upper text bar. */
  "note-quote": {
    paint: "sky",
    mirror: true,
    fill: [
      ["rect", { x: 7, y: 6.5, width: 10, height: 3, rx: 1.5 }],
    ],
    line: [
      ["path", { d: "M10 17H17A4 4 0 0 0 21 13V7A4 4 0 0 0 17 3H7A4 4 0 0 0 3 7V13A4 4 0 0 0 6 16.87V21Z" }],
      ["rect", { x: 7, y: 6.5, width: 10, height: 3, rx: 1.5 }],
      ["rect", { x: 7, y: 11, width: 7, height: 3, rx: 1.5 }],
    ],
  },
  /** Feedback: Worked well. A finished tower; paint-sun ball. */
  "worked-well": {
    paint: "sun",
    fill: [
      ["circle", { cx: 12, cy: 7, r: 2.75 }],
    ],
    line: [
      ["rect", { x: 5, y: 16, width: 14, height: 5, rx: 1.5 }],
      ["path", { d: "M8 16V12A1.5 1.5 0 0 1 9.5 10.5H14.5A1.5 1.5 0 0 1 16 12V16" }],
      ["circle", { cx: 12, cy: 7, r: 2.75 }],
    ],
  },
  /** Feedback: Partly. Half-built tower, the ball waiting beside it; paint-sun ball. */
  partly: {
    paint: "sun",
    mirror: true,
    fill: [
      ["circle", { cx: 19, cy: 18.25, r: 2.75 }],
    ],
    line: [
      ["rect", { x: 3, y: 16, width: 10.5, height: 5, rx: 1.5 }],
      ["path", { d: "M5.25 16V12A1.5 1.5 0 0 1 6.75 10.5H9.75A1.5 1.5 0 0 1 11.25 12V16" }],
      ["circle", { cx: 19, cy: 18.25, r: 2.75 }],
    ],
  },
  /** Feedback: Did not work (about the activity, never the child). Tumbled blocks; paint-sun ball. */
  "did-not-work": {
    paint: "sun",
    mirror: true,
    fill: [
      ["circle", { cx: 19, cy: 18.25, r: 2.75 }],
    ],
    line: [
      ["path", { d: "M2 21H22" }],
      ["rect", { x: 3.5, y: 16, width: 9, height: 5, rx: 1.5, transform: "rotate(-12 3.5 21)" }],
      ["rect", { x: 6.5, y: 7.93, width: 6, height: 6, rx: 1.5, transform: "rotate(25 9.5 10.93)" }],
      ["circle", { cx: 19, cy: 18.25, r: 2.75 }],
    ],
  },
  /** Action: Present to the child. Tablet on a stand; paint-sky play triangle. */
  present: {
    paint: "sky",
    fill: [
      ["path", { d: "M10 7.5L15 10.5L10 13.5Z" }],
    ],
    line: [
      ["rect", { x: 3, y: 4, width: 18, height: 13, rx: 3 }],
      ["path", { d: "M9 21L12 17L15 21Z" }],
      ["path", { d: "M10 7.5L15 10.5L10 13.5Z" }],
    ],
  },
  /** Present mode: Next (Back is the mirror). Single colour, no paint. */
  "arrow-next": {
    mirror: true,
    line: [
      ["path", { d: "M4.5 12H18M12 5.5L18.5 12L12 18.5" }, 1.5],
    ],
  },
} as const satisfies Record<string, KidIconDef>;

export type KidIconName = keyof typeof iconDefs;

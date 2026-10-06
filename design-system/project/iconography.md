# Iconography

KidSphere speaks through its own painted block icons, and through nothing else that looks like an icon. Every glyph is built from the four pieces of a kindergarten block set: the block (rounded square), the ball (circle), the roof (rounded triangle) and the arch. Each one is outlined in `ink` and has exactly one piece painted in a saturated colour, the way a child colours in one shape and leaves the rest. The files live in the Icons asset group (`assets/Icons/<name>.svg`); the per-icon notes are in its README.

## The system

- Draw on a 24 × 24 grid with a 2px safe margin. Outline every shape with a 2-unit stroke, round caps and round joins. The only heavier strokes are the plus of `observe-add` (2.5), its handle (3), the check of `what-helps` (2.5) and the chunky `arrow-next` (3).
- Use primitives only: rounded squares and rects (corner 1.5 to 3), circles, rounded-join triangles, arches and capsules. No freehand curves, no faces, no characters.
- Author overlaps as open paths. When one piece sits behind another, its outline stops at the front piece's edge, so an icon drawn outline-only never shows a line crossing behind a shape.
- Keep each icon to one idea a teacher can name in a word: a toy box is content, a picture book is a story, a rabbit-ear TV is a video, a puzzle block is a game, floor blocks are an activity, a backpack is a pack, a kindergarten house is a class, beads on a string are the timeline, block steps are development.

## The duotone rule

Every icon has two inks: the outline, and one paint on one primitive.

- Draw the outline in the text colour of its context: `ink` by default, `ink-muted` for inactive nav, `on-brand` on solid `brand`, `danger` or tone-ink fills, `on-paint` on a paint fill.
- Fill exactly one primitive, under the outline, never more. The paint slips 1.5 units downward (about 1.5px at 24px, 3px at 48px), so a sliver of colour shows below the bottom edge like a hand-painted block. Turn the slip off at 16px.
- Never let paint carry meaning on its own. On teacher screens a painted icon always sits next to its word: `strengths` beside "Strengths", `attention` beside "Not observed for 9 days".
- Never place an icon on a ground of its own paint. If a future pairing puts a paint on a tile it can barely be told apart from (ΔE00 below 12), switch that paint to `surface` so it reads as a cut-out.

| Context | Outline | Paint |
|---|---|---|
| Meaning icons: `strengths`, `interests`, `what-helps`, `current-focus`, `attention`, `strength-builder`, `growth-support` | `ink` | Their meaning paint, everywhere: `paint-sun`, `paint-berry`, `paint-leaf`, `paint-grape`, `paint-tangerine`, `paint-sun`, `paint-grape` |
| Content and play: `story`, `video`, `game`, `activity`, `pack`, `present`, `note-quote` | `ink` | `paint-sky` |
| Feedback: `worked-well`, `partly`, `did-not-work` | `ink` | `paint-sun` on the ball, the same for all three, so no outcome reads as a grade |
| Nav icon, inactive | `ink-muted` | None |
| Nav icon, active (bottom-bar pill, side-nav row) | `ink` | `accent`, the logo teal, on its designated piece (a navy `brand` paint would sit at 1.44:1 against the graphite outline) |
| Nav icon at 48px or more (empty states) | `ink` | `paint-sky` |
| On a solid fill: the Observe block, a primary button, a single-select chip, a danger confirm | `on-brand` | None |
| On a paint fill: the sun RoundButton, a toast glyph block | `on-paint` | None |

In the dark theme the outline becomes chalk (`ink` `#F3EEE6`) and the paints stay saturated, so the kid colour survives at night. Paint against dark `surface` holds 5.42:1 or better; the outline holds 10:1 or better on every ground in both themes.

## The logo and the block tower

The KidSphere logo (the globe with a child reaching for a star) is artwork with its own inks, not a block icon, so none of the rules on this page apply to it: it lives in the Logos asset group (`assets/Logos`) and its rules are in the Logo section of the brand book. The block tower (a `brand` arch, a `paint-sun` ball and a `paint-berry` cube) was the first brand mark. It is retired as the logo and survives only as play, the finish tower the FinishScreen builds in present mode. `assets/Icons/brand-mark.svg` is a legacy record of it, not part of the set: the app has no `brand-mark` icon, and it is never used as the logo, an app icon or a favicon.

## Sizes

Use 16px in chips, badges and inline text; 20px in buttons, 32px section tiles and alerts; 24px in nav; 28px in the raised Observe block and content-type tiles; 40px in feedback and picker tiles; 48 to 96px in empty states and present mode. Never draw a custom icon smaller than 16px.

## Emoji are content, icons are KidSphere's voice

- Keep the option emoji (the child's own world: cars, elephants, blocks, rainbows) for option items only. Put them in a `surface` pod: 24px with a 16px emoji on chips and toggle chips, 64 to 88px with a 44 to 64px emoji on kid ChoiceCards. The pod keeps full-colour emoji from clashing with a chip tint and contains their per-platform look.
- Use a custom icon for everything KidSphere itself says: nav, section headers, actions, content types, statuses and feedback. The brand is the logo (`assets/Logos`), never an icon.
- Give each slot one glyph. An Interests chip shows its option emoji when it has one, otherwise the `interests` heart, never both.
- Never use emoji in nav, headings, buttons, badges, statuses, feedback, empty states, the finish screen or this brand book.
- Keep utility glyphs in lucide-react at stroke 2 with round caps and joins, which matches the custom set: chevrons, X, Search, More, Pencil, Trash, Check, Calendar, Mic, Menu, LogOut, RotateCcw, CircleAlert, Info, Languages and the loading spinner. Never use lucide for a concept the custom set covers.

## Right-to-left

Mirror the directional icons under RTL with `scaleX(-1)` (`rtl:-scale-x-100`), never a 180° rotation, which also flips them upside down: `timeline`, `development`, `story`, `current-focus`, `note-quote`, `partly`, `did-not-work`, `arrow-next`. Never mirror the others. The star, heart, check, play triangle and lens are conventions, not directions. Directional lucide glyphs (back and forward chevrons, LogOut) mirror too.

In present mode, direction follows the content language, not the UI language: a Hebrew story shown on an English interface still points its Next arrow to the left. Next shows `arrow-next` as drawn in LTR content and mirrored in RTL content; Back is the reverse.

## Using the icons

- In the app, import the components from `@/icons`: `StrengthsIcon`, `WhatHelpsIcon`, `StoryIcon`, or `<BlockIcon name="story" />` for data-driven slots. They take the same props as a lucide icon (`size`, `className`, `strokeWidth`, `aria-*`), so they drop into nav metadata unchanged.
- Set the outline colour with the text colour (`text-ink`, `text-ink-muted`, `text-on-brand`). Set the paint with the `paint` prop (`paint={false}` for outline only, or any colour such as `var(--paint-sky)`) or from a parent with the CSS variable `--icon-paint`: an active nav link sets it to `var(--accent)`, an inactive one to `transparent`.
- Pass `size={16}` for chip-sized icons so the slip turns off.
- Leave icons `aria-hidden`: the word beside them is the label. An icon-only button carries both `aria-label` and `title`.
- Use the SVG files in `assets/Icons` only where an icon must be an `<img>` (documentation, previews). They are baked with the light-theme inks, and `assets/Icons/dark` holds the same icons baked with the dark-theme inks; place both and let the theme show one. Never filter a light file to fake the dark theme.

## Do and don't

| Do | Don't |
|---|---|
| Paint exactly one piece per icon, under an `ink` outline | Paint two pieces, add gradients, highlights or shadows |
| Put every meaning icon beside its word | Let a painted icon stand in for a label |
| Use the same `paint-sun` ball for Worked well, Partly and Did not work | Colour feedback green, orange or red by outcome, or draw an X |
| Use `attention` (tangerine eye) for anything worth a look about a child | Use red, `danger` or an X about anything to do with a child |
| Drop the paint on solid fills and draw the icon in `on-brand` or `on-paint` | Put a painted icon on a ground of its own paint |
| Keep emoji in pods on option chips and kid picture blocks | Use emoji in nav, headings, buttons, statuses or feedback |
| Mirror directional icons with `scaleX(-1)` | Mirror the star, heart, check, play triangle or lens, or rotate anything 180° |
| Keep lucide for utility glyphs at stroke 2 | Use lucide for nav, sections, content types or feedback |
| Draw new icons from blocks, balls, roofs and arches on the 24px grid | Draw faces, characters, mascots or freehand shapes |

# KidSphere design spec: Painted Block Box (final)

Status: final direction for the design-system artifact and the app restyle. It starts from **Block Box**, the top scorer (22.5 of 30 across the three judges). It adds the saturated "paint" layer from Crayon Box, the emoji pods, kind empty-state copy and the RTL-safe paint offset from Sprout Garden, and it fixes all 23 must_fix items. Section 8 maps each must_fix to its resolution.

Every hex value below was computed with the WCAG 2.x relative-luminance formula, plus OKLCH, OKLab ΔE×100 and CIEDE2000 (checked against Sharma's reference pairs). Fonts were checked against api.fontsource.org, the npm registry, unpkg file listings and the Google Fonts css2 endpoint on 2026-10-05.

**Revision 2026-10-06: accents from the logo.** The accents now match the new logo (`project/assets/Logos`; sampled from the artwork: navy "Kid" `#003468`–`#124478`, teal "Sphere" `#0A9EA3`, sky `#44C2F2`, green `#4CC2A6`, star orange `#F99E3A`).

- `brand` moves from toy-block blue `#005DBD` / `#8CB4FE` to the logo navy `#0D3D72` / `#90BAF1` (ΔE00 1.0 from the sampled `#0B3A6E`, nudged so it stays ΔE00 15 from `ink`). `brand-strong`, `brand-soft` and the brand lips follow it.
- A new teal family joins it: `accent`, `accent-strong`, `accent-soft` and `on-accent` (37 colour tokens instead of 33). Teal is used sparingly: the paint of the active nav icon, because a navy paint sits at 1.44:1 against the graphite outline and stops reading as "coloured in", and the focus `ring`, which is now the `accent-strong` teal so focus never looks like a navy selection border.
- `paint-sky`, `paint-leaf` and `paint-tangerine` become the logo's sky, green and star orange. `paint-sun`, `paint-berry`, `paint-grape`, the grounds, the inks and every meaning tint are unchanged.
- Every table in §2 was recomputed for the new values in both themes: all 89 text pairs hold 4.5:1 and all 23 non-text pairs hold 3:1, with the same lowest pairs as before (`on-paint` on `paint-berry` 4.56, `line-strong` on `tray` 3.36).

---

## 1. Concept

**The block corner, painted.** KidSphere is laid out like the wooden block set every kindergarten owns, sitting on a pale birch-plywood floor: the navy arch, the sunflower ball, the berry cube, the leaf block, the grape flag and the tangerine cylinder. Everything is built from four primitives: the rounded square (block), the circle (ball), the rounded triangle (roof) and the arch (bridge).

Colour works on three layers, and each layer has one job:

1. **Ground and ink (calm).** Birch `ground`, white `surface` cards and dark `ink` text cover about 80% of every teacher screen. Labels on tinted fills are always `ink`, so a long list reads like plain text.
2. **Tints (meaning).** Each profile meaning has a pastel `-soft` fill and a dark `-ink`, and they are always paired with an icon and a word:
   - Strengths: sunflower ⭐
   - Interests: berry heart
   - What helps: leaf ticked block ✓
   - Current focus: grape flag, numbered 1–3
   - Worth a look: tangerine eye, never red
3. **Paint (kid layer).** A family of saturated `paint-*` colours appears only as the fill of one primitive inside an ink-outlined icon, on the painted picture blocks of the child's game board, in the present-mode finish tower, on stickers and in empty-state scenes. This is what makes KidSphere read as a kids' app, and it is small and bounded enough that a busy teacher never sees a toy store.

**Brand.** `brand` is the logo's navy ("Kid"): OKLCH hue 254.5 in light and 255.4 in dark, set beside a red-leaning grape for focus at hue 318–322. `accent` is the logo's teal ("Sphere") at hue 199, the second voice, used sparingly (§2.1). No saturated colour (OKLCH chroma above 0.05) sits in the AI-violet band (hue 280–305), and nothing uses a gradient.

**Present mode.** When the tablet is handed to a child, the same blocks get big: chunky toy-key buttons with a hard lip, picture cards with a 3px colouring-book ink outline on painted blocks, a sun-yellow round arrow button, and a finish screen where a block tower stacks itself. There are no points and no scores, and nothing is ever red or an X.

### Kid signals (what makes it read as a kids' app)

1. The palette is the wooden block set, tuned to the logo: navy and teal, sunflower, berry, leaf green, grape, star-orange tangerine and sky on birch plywood. In dark mode it becomes a warm walnut night playroom, not a generic navy-grey.
2. **Painted icons.** A custom set of 27 glyphs made only from blocks, balls, roofs and arches. Each has a graphite outline and exactly one primitive painted a saturated colour. The paint "slips" 1.5 units downward, like a hand-painted block.
3. The strengths icon is a gold star sticker: a sunflower-painted star in a graphite outline.
4. **Block chips.** Rounded-square chips, not pills. The focus chip leads with a solid grape numeral block (1, 2, 3).
5. **Block lips.** Primary buttons, tappable cards and kid tiles have a hard, unblurred bottom lip and sink when pressed, like pressing a wooden block into sand.
6. The centre Observe action is a big navy block raised out of the bottom bar.
7. Rounded display type: Fredoka for Latin and Hebrew, Baloo Bhaijaan 2 for Arabic. It is used on titles and on everything a child sees.
8. Kindergarten objects stand in for features:
   - toy box: content
   - picture book: story
   - rabbit-ear TV: video
   - puzzle block: game
   - floor blocks: activity
   - backpack: pack
   - kindergarten house: classes
   - beads on a string: timeline
   - block steps: development
9. Feedback is drawn as block towers: a finished tower, a half-built one, and blocks that tumbled. Every option gets the same paint and the same selection, so none of them reads as a grade.
10. **Present-mode game board.** A tray of painted picture blocks in a colouring-book outline, a sun round arrow, sticker stamps, and a finish tower that builds itself. The copy for a missed pick is "Let's try another one", never an X.
11. **Empty states as block scenes.** An empty toy box, an unthreaded bead string, a lens resting by a ball. The copy is kind and a little playful.
12. The brand mark is a child's first tower: a blue arch with a sunflower ball and a berry cube on it. (Superseded: the logo is now the globe-and-child artwork in `project/assets/Logos`, see the Logo section of `project/README.md`; the tower survives only as the present-mode finish motif.)

---

## 2. Colour tokens

37 tokens: 35 with values plus 2 aliases (33 before the 2026-10-06 revision added the four `accent` tokens). In tokens.json, `success` is written literally as `"{helps-ink}"` and `warning` as `"{attention-ink}"`, never as a hex value with a note.

The CSS variable is `--<name>`. Tailwind maps each one as `--color-<name>`, so `bg-ground`, `text-ink-muted`, `ring-ring` and so on.

### 2.1 Token table

| Token | Light | Dark | Usage (text tokens name the grounds they read on) |
|---|---|---|---|
| `ground` | `#FBF6EC` | `#16120E` | Page background: birch plywood in light, walnut night in dark. Also the 4px ring around the raised Observe block, the present-mode stage and the toast text colour (`ground` on `ink`). |
| `surface` | `#FFFFFF` | `#27221D` | Cards, inputs, bottom bar, idle kid ChoiceCards, the selected block in segmented controls. Cards always carry a 1px `line` border, in both themes. |
| `surface-raised` | `#FFFFFF` | `#312B26` | Dialogs, bottom sheets, menus, popovers. In light it is white and lifted by `shadow-sheet`; in dark it is one step lighter than `surface`. |
| `tray` | `#F3EBDD` | `#0E0A07` | Recessed wells: segmented, tab and support-scale tracks, search-field fill, Recent-development quote well, avatar ground, content-type tile, Draft badge, kid Done tile, ghost/secondary hover fill. |
| `line` | `#E5DACA` | `#4F4740` | Decorative only: card borders, dividers, the bottom-bar top edge, the side-nav inline-end edge. Never the only boundary of a control. |
| `line-strong` | `#8A7E6C` | `#8F847A` | Control borders: inputs, search, secondary buttons, unselected toggle chips, checkboxes, feedback tiles. Also the kid Done-tile outline, the timeline string, the sheet grabber and upcoming progress dots. At least 3:1 on `ground`, `surface`, `surface-raised` and `tray`. |
| `ink` | `#1F2233` | `#F3EEE6` | Graphite in light, chalk in dark. All primary text and every icon outline. Reads on `ground`, `surface`, `surface-raised`, `tray`, `brand-soft`, `accent-soft`, `strength-soft`, `interest-soft`, `helps-soft`, `focus-soft` and `attention-soft`. Also the toast fill and the 3px colouring-book outline of kid tiles. |
| `ink-muted` | `#57525F` | `#C0B8AD` | Secondary text ("4 years 2 months", dates, helper text, placeholders, counts), inactive nav labels and icon outlines. Reads on the same eleven grounds as `ink`. |
| `brand` | `#0D3D72` | `#90BAF1` | The logo's navy ("Kid"): "act" and "you are here". As a fill: primary buttons, the centre Observe block, KidButton, check blocks, the current progress dot. As text: links, the active nav label, the soft-button label, the Ready badge and the "Observe" label; reads on `ground`, `surface`, `surface-raised`, `tray`, `brand-soft`. As a border: 2px on the selected segment, tab, feedback tile or picker tile; 4px on the selected kid tile. Navy is close to graphite `ink` (1.44:1), so links in running text are always underlined and the active nav icon is painted `accent`, not `brand`. |
| `brand-strong` | `#032B56` | `#B5D4FC` | Hover and pressed fill of `brand` (deeper navy in light, paler blue in dark). Also the hover label of the soft button. Reads on `ground`, `surface`, `surface-raised`, `tray`, `brand-soft`. |
| `brand-soft` | `#D4E4FA` | `#1A3658` | The navy tint: active nav pill and row, soft button, info alert, the selected fill of neutral choices (feedback tiles, content-type picker, the kid Selected tile), the "calm" kid bubble, done progress dots. |
| `on-brand` | `#FFFFFF` | `#0C121A` | Text and glyphs on solid fills: `brand`, `brand-strong`, `danger`, and any `*-ink` used as a fill (single-select toggle chip, focus numeral block, success check block). |
| `accent` | `#0A9EA3` | `#35B9BE` | The logo's teal ("Sphere"), the second accent, used sparingly and never for a profile meaning or for selection. Fill only: the paint of the active nav icon (4.82:1 against the graphite outline, where navy would be 1.44:1), the default paint of nav icons outside the nav, and a teal highlight block when a second highlight helps (with `on-accent`). Never text, and never the only boundary of a control (2.76:1 on `tray` in light). |
| `accent-strong` | `#006E73` | `#7EDDE1` | Teal text and 2px borders for a teal highlight; also the value of `ring`. Reads on `ground`, `surface`, `surface-raised`, `tray`, `accent-soft`. |
| `accent-soft` | `#B8FCFF` | `#003940` | The teal tint, reserved for a secondary, non-meaning highlight: never selection (`brand-soft`) and never What helps (`helps-soft`). Labels on it are `ink`; `accent-strong` text reads on it. |
| `on-accent` | `#1F2233` | `#1F2233` | Graphite in both themes: text and glyphs on an `accent` fill. Never white on `accent` (3.26:1 on the logo teal). |
| `strength-soft` | `#FBE794` | `#433706` | Strengths: chip fill, 32px section tile, selected multi-select chip fill, the kid Hint tile. |
| `strength-ink` | `#735603` | `#F7D471` | Strengths: 2px selected-chip border, kid Hint dashed ring, single-select fill (with `on-brand`), small tone text. Reads on `strength-soft`, `ground`, `surface`, `surface-raised`, `tray`. |
| `interest-soft` | `#FFC9D5` | `#4C222D` | Interests: chip fill (with an emoji pod or the heart), section tile, selected chip fill. |
| `interest-ink` | `#A42056` | `#FDAEBE` | Interests: selected-chip border, single-select fill, tone text. Reads on `interest-soft`, `ground`, `surface`, `surface-raised`, `tray`. |
| `helps-soft` | `#C3F3CE` | `#183B23` | What helps: chip fill, section tile, selected chip fill. In present mode only, it is also the kid Preferred tile and the "warm" bubble. Never the ground of a system success message. |
| `helps-ink` | `#206B38` | `#95DFA4` | What helps: selected-chip border, single-select fill, tone text. Source of the `success` alias. Reads on `helps-soft`, `ground`, `surface`, `surface-raised`, `tray`. |
| `focus-soft` | `#EFC4F9` | `#3E1946` | Current focus (grape): chip fill, section tile, focus list rows, the Growth Support mode tag. |
| `focus-ink` | `#7C2D88` | `#D79FE9` | Fill of the 1–3 numeral blocks (with an `on-brand` numeral), the focus selected-chip border, tone text. Reads on `focus-soft`, `ground`, `surface`, `surface-raised`, `tray`. |
| `attention-soft` | `#FFD1AA` | `#4E270C` | "Worth a look", tangerine and never red: the not-observed strip, sensitivities chip, "Needs more observation" badge, "focus slots full" badge, warning alert, kid Other tile, "think" kid bubble. |
| `attention-ink` | `#984500` | `#FAB27B` | Kid Other ring (4px), attention tone text. Source of the `warning` alias. Reads on `attention-soft`, `ground`, `surface`, `surface-raised`, `tray`. |
| `success` | `{helps-ink}` | `{helps-ink}` | "Saved", "Approved", "Worked well recorded". Used as text, as the 1.5px border of success alerts and the Approved badge (on `surface`), and as the fill of check blocks (with `on-brand`). Always with a check glyph and a word, never on a `helps-soft` fill. Reads on `ground`, `surface`, `surface-raised`. |
| `warning` | `{attention-ink}` | `{attention-ink}` | System warnings: unsaved changes, offline, video still processing. Always with an alert glyph. Reads on `ground`, `surface`, `surface-raised`, `attention-soft`. |
| `danger` | `#BE2323` | `#F47C6B` | Errors and destructive confirms only: field error text and the 2px field border, error-alert border and glyph, the Delete confirm fill (with `on-brand`). Never used for anything about a child. Reads on `ground`, `surface`, `surface-raised`, `tray`. There is deliberately no `danger-soft`: error alerts are `surface` with a `danger` border. |
| `ring` | `#006E73` | `#7EDDE1` | Keyboard focus, in the logo's teal (the `accent-strong` value), so focus never looks like a navy selection border: a solid 3px outline with a 2px offset on every interactive element. Named `ring`, not `focus-ring`, so it never collides with the Current-focus tone. At least 4.01:1 on every ground and every tint (`focus-soft` in light is the lowest). |
| `paint-sun` | `#FDC010` | `#F9C635` | Sunflower paint: the Strengths and Strength Builder stars, the ball in the feedback towers, the kid RoundButton fill, stickers, the finish-tower ball, the baseline timeline bead, kid picture blocks. Fill only; any glyph on it uses `on-paint`. |
| `paint-berry` | `#EE4E89` | `#F56696` | Berry paint: the Interests heart, the finish-tower cube, kid picture blocks. Fill only. |
| `paint-leaf` | `#4CC2A6` | `#5FCEB3` | Leaf paint, the logo's green: the What-helps ticked block, the activity-result bead, the success toast block, kid picture blocks. Fill only. |
| `paint-grape` | `#BC6ECE` | `#C77DD8` | Grape paint: the Current-focus pennant, the Growth Support pot, the focus-change bead, kid picture blocks. Fill only. |
| `paint-tangerine` | `#F99E3A` | `#FCA953` | Tangerine paint, the logo's star orange: the attention eye iris, the warning toast block, kid picture blocks. Fill only. |
| `paint-sky` | `#44C2F2` | `#5DCDFA` | The logo's sky, the non-meaning paint, for everyday things: content-type icons, the present icon, the observation bead and quote icon, the info toast block, empty-state scenes, kid picture blocks. Never a profile meaning. |
| `on-paint` | `#1F2233` | `#1F2233` | Graphite, the same value in both themes: glyphs and labels on any paint (toast glyph blocks, the RoundButton arrow and its 3px outline). Reads on every `paint-*` at 4.56:1 or better. |

### 2.2 The meaning map

Learn it once; it is the same on every screen.

| Meaning | Tint and ink | Paint (icon fill) | Icon | Word always shown |
|---|---|---|---|---|
| Act, "you are here" | `brand-soft` / `brand` | `accent` (the logo teal; navy would vanish against the outline) | (any active nav icon) | button label or nav label |
| Strengths | `strength-soft` / `strength-ink` | `paint-sun` | `strengths` (star) | "Strengths" |
| Interests | `interest-soft` / `interest-ink` | `paint-berry` | `interests` (heart) or the option emoji | "Interests" |
| What helps | `helps-soft` / `helps-ink` | `paint-leaf` | `what-helps` (ticked block) | "What helps" |
| Current focus (max 3) | `focus-soft` / `focus-ink` | `paint-grape` | `current-focus` plus numeral blocks 1–3 | "Current focus" |
| Worth a look (never red) | `attention-soft` / `attention-ink` | `paint-tangerine` | `attention` (eye) | e.g. "Not observed for 9 days" |
| Content, play, everyday | `tray` | `paint-sky` | content-type icons | type name |
| System error only | `surface` + `danger` border | none | lucide `CircleAlert` | the error sentence |

### 2.3 Rules

- **Labels on tints are `ink`.** Tone inks are for borders, rings, single-select fills, numeral blocks and short tone words. Brand text on `brand-soft` (soft button, active nav label, Ready badge) is a coloured-text-on-tint pair, and it passes at 8.44:1 (light) and 6.12:1 (dark); its teal twin, `accent-strong` on `accent-soft`, passes at 5.29:1 and 8.03:1. There are no others.
- **Teal is the second voice, used sparingly.** `accent` (the logo's "Sphere") paints the active nav icon and backs the focus `ring` (as `accent-strong`); it may also mark a secondary, non-meaning highlight. It never carries a profile meaning, never marks selection (that is `brand`) and never replaces navy as "act".
- **Paint never carries meaning on its own.** On teacher screens a paint appears only inside an ink-outlined icon that sits next to its word. In present mode, paints are pure play colours with no meaning, because no meaning chip, icon or word appears there.
- **Never red for a child.** Needs, sensitivities, drafts and "keep an eye on" use attention (tangerine). `danger` is only for system errors and delete confirms.
- **Support scale and feedback are never colour-coded by level** (see §6.8 and §6.11).
- **No gradients, glows or glassmorphism.** Fills are flat. The top bar is solid `ground` with no backdrop blur.

### 2.4 WCAG contrast: every text pair (4.5:1 minimum, both themes)

All 89 pairs pass (81 before the 2026-10-06 revision; the new pairs are `ink` and `ink-muted` on `accent-soft`, `accent-strong` on its five grounds and `on-accent` on `accent`). The lowest is `on-paint` on `paint-berry` in light, at 4.56.

| Text token | On | Light | Ratio | Dark | Ratio |
|---|---|---|---|---|---|
| `ink` | `ground` | #1F2233 on #FBF6EC | 14.60 | #F3EEE6 on #16120E | 16.13 |
| `ink` | `surface` | #1F2233 on #FFFFFF | 15.73 | #F3EEE6 on #27221D | 13.64 |
| `ink` | `surface-raised` | #1F2233 on #FFFFFF | 15.73 | #F3EEE6 on #312B26 | 12.09 |
| `ink` | `tray` | #1F2233 on #F3EBDD | 13.29 | #F3EEE6 on #0E0A07 | 17.07 |
| `ink` | `strength-soft` | #1F2233 on #FBE794 | 12.71 | #F3EEE6 on #433706 | 10.17 |
| `ink` | `interest-soft` | #1F2233 on #FFC9D5 | 10.91 | #F3EEE6 on #4C222D | 11.55 |
| `ink` | `helps-soft` | #1F2233 on #C3F3CE | 12.76 | #F3EEE6 on #183B23 | 10.77 |
| `ink` | `focus-soft` | #1F2233 on #EFC4F9 | 10.44 | #F3EEE6 on #3E1946 | 12.70 |
| `ink` | `attention-soft` | #1F2233 on #FFD1AA | 11.20 | #F3EEE6 on #4E270C | 11.23 |
| `ink` | `brand-soft` | #1F2233 on #D4E4FA | 12.19 | #F3EEE6 on #1A3658 | 10.62 |
| `ink` | `accent-soft` | #1F2233 on #B8FCFF | 13.79 | #F3EEE6 on #003940 | 10.96 |
| `ink-muted` | `ground` | #57525F on #FBF6EC | 7.02 | #C0B8AD on #16120E | 9.50 |
| `ink-muted` | `surface` | #57525F on #FFFFFF | 7.56 | #C0B8AD on #27221D | 8.03 |
| `ink-muted` | `surface-raised` | #57525F on #FFFFFF | 7.56 | #C0B8AD on #312B26 | 7.11 |
| `ink-muted` | `tray` | #57525F on #F3EBDD | 6.39 | #C0B8AD on #0E0A07 | 10.05 |
| `ink-muted` | `strength-soft` | #57525F on #FBE794 | 6.11 | #C0B8AD on #433706 | 5.99 |
| `ink-muted` | `interest-soft` | #57525F on #FFC9D5 | 5.24 | #C0B8AD on #4C222D | 6.80 |
| `ink-muted` | `helps-soft` | #57525F on #C3F3CE | 6.13 | #C0B8AD on #183B23 | 6.34 |
| `ink-muted` | `focus-soft` | #57525F on #EFC4F9 | 5.02 | #C0B8AD on #3E1946 | 7.47 |
| `ink-muted` | `attention-soft` | #57525F on #FFD1AA | 5.38 | #C0B8AD on #4E270C | 6.61 |
| `ink-muted` | `brand-soft` | #57525F on #D4E4FA | 5.86 | #C0B8AD on #1A3658 | 6.25 |
| `ink-muted` | `accent-soft` | #57525F on #B8FCFF | 6.63 | #C0B8AD on #003940 | 6.45 |
| `brand` | `ground` | #0D3D72 on #FBF6EC | 10.11 | #90BAF1 on #16120E | 9.30 |
| `brand` | `surface` | #0D3D72 on #FFFFFF | 10.89 | #90BAF1 on #27221D | 7.86 |
| `brand` | `surface-raised` | #0D3D72 on #FFFFFF | 10.89 | #90BAF1 on #312B26 | 6.97 |
| `brand` | `tray` | #0D3D72 on #F3EBDD | 9.20 | #90BAF1 on #0E0A07 | 9.84 |
| `brand` | `brand-soft` | #0D3D72 on #D4E4FA | 8.44 | #90BAF1 on #1A3658 | 6.12 |
| `brand-strong` | `ground` | #032B56 on #FBF6EC | 13.14 | #B5D4FC on #16120E | 12.23 |
| `brand-strong` | `surface` | #032B56 on #FFFFFF | 14.15 | #B5D4FC on #27221D | 10.34 |
| `brand-strong` | `surface-raised` | #032B56 on #FFFFFF | 14.15 | #B5D4FC on #312B26 | 9.17 |
| `brand-strong` | `tray` | #032B56 on #F3EBDD | 11.95 | #B5D4FC on #0E0A07 | 12.94 |
| `brand-strong` | `brand-soft` | #032B56 on #D4E4FA | 10.97 | #B5D4FC on #1A3658 | 8.05 |
| `accent-strong` | `ground` | #006E73 on #FBF6EC | 5.61 | #7EDDE1 on #16120E | 11.82 |
| `accent-strong` | `surface` | #006E73 on #FFFFFF | 6.04 | #7EDDE1 on #27221D | 9.99 |
| `accent-strong` | `surface-raised` | #006E73 on #FFFFFF | 6.04 | #7EDDE1 on #312B26 | 8.85 |
| `accent-strong` | `tray` | #006E73 on #F3EBDD | 5.10 | #7EDDE1 on #0E0A07 | 12.50 |
| `accent-strong` | `accent-soft` | #006E73 on #B8FCFF | 5.29 | #7EDDE1 on #003940 | 8.03 |
| `on-brand` | `brand` | #FFFFFF on #0D3D72 | 10.89 | #0C121A on #90BAF1 | 9.38 |
| `on-brand` | `brand-strong` | #FFFFFF on #032B56 | 14.15 | #0C121A on #B5D4FC | 12.34 |
| `on-brand` | `danger` | #FFFFFF on #BE2323 | 6.08 | #0C121A on #F47C6B | 7.11 |
| `on-brand` | `strength-ink` | #FFFFFF on #735603 | 6.86 | #0C121A on #F7D471 | 13.08 |
| `on-brand` | `interest-ink` | #FFFFFF on #A42056 | 7.19 | #0C121A on #FDAEBE | 10.72 |
| `on-brand` | `helps-ink` | #FFFFFF on #206B38 | 6.52 | #0C121A on #95DFA4 | 11.97 |
| `on-brand` | `focus-ink` | #FFFFFF on #7C2D88 | 8.11 | #0C121A on #D79FE9 | 8.97 |
| `on-brand` | `attention-ink` | #FFFFFF on #984500 | 6.59 | #0C121A on #FAB27B | 10.49 |
| `on-accent` | `accent` | #1F2233 on #0A9EA3 | 4.82 | #1F2233 on #35B9BE | 6.62 |
| `strength-ink` | `ground` | #735603 on #FBF6EC | 6.37 | #F7D471 on #16120E | 12.96 |
| `strength-ink` | `surface` | #735603 on #FFFFFF | 6.86 | #F7D471 on #27221D | 10.96 |
| `strength-ink` | `surface-raised` | #735603 on #FFFFFF | 6.86 | #F7D471 on #312B26 | 9.71 |
| `strength-ink` | `tray` | #735603 on #F3EBDD | 5.79 | #F7D471 on #0E0A07 | 13.72 |
| `strength-ink` | `strength-soft` | #735603 on #FBE794 | 5.54 | #F7D471 on #433706 | 8.17 |
| `interest-ink` | `ground` | #A42056 on #FBF6EC | 6.68 | #FDAEBE on #16120E | 10.63 |
| `interest-ink` | `surface` | #A42056 on #FFFFFF | 7.19 | #FDAEBE on #27221D | 8.98 |
| `interest-ink` | `surface-raised` | #A42056 on #FFFFFF | 7.19 | #FDAEBE on #312B26 | 7.96 |
| `interest-ink` | `tray` | #A42056 on #F3EBDD | 6.08 | #FDAEBE on #0E0A07 | 11.24 |
| `interest-ink` | `interest-soft` | #A42056 on #FFC9D5 | 4.99 | #FDAEBE on #4C222D | 7.61 |
| `helps-ink` | `ground` | #206B38 on #FBF6EC | 6.05 | #95DFA4 on #16120E | 11.86 |
| `helps-ink` | `surface` | #206B38 on #FFFFFF | 6.52 | #95DFA4 on #27221D | 10.03 |
| `helps-ink` | `surface-raised` | #206B38 on #FFFFFF | 6.52 | #95DFA4 on #312B26 | 8.89 |
| `helps-ink` | `tray` | #206B38 on #F3EBDD | 5.51 | #95DFA4 on #0E0A07 | 12.55 |
| `helps-ink` | `helps-soft` | #206B38 on #C3F3CE | 5.29 | #95DFA4 on #183B23 | 7.92 |
| `focus-ink` | `ground` | #7C2D88 on #FBF6EC | 7.53 | #D79FE9 on #16120E | 8.90 |
| `focus-ink` | `surface` | #7C2D88 on #FFFFFF | 8.11 | #D79FE9 on #27221D | 7.52 |
| `focus-ink` | `surface-raised` | #7C2D88 on #FFFFFF | 8.11 | #D79FE9 on #312B26 | 6.67 |
| `focus-ink` | `tray` | #7C2D88 on #F3EBDD | 6.85 | #D79FE9 on #0E0A07 | 9.41 |
| `focus-ink` | `focus-soft` | #7C2D88 on #EFC4F9 | 5.38 | #D79FE9 on #3E1946 | 7.00 |
| `attention-ink` | `ground` | #984500 on #FBF6EC | 6.12 | #FAB27B on #16120E | 10.40 |
| `attention-ink` | `surface` | #984500 on #FFFFFF | 6.59 | #FAB27B on #27221D | 8.79 |
| `attention-ink` | `surface-raised` | #984500 on #FFFFFF | 6.59 | #FAB27B on #312B26 | 7.79 |
| `attention-ink` | `tray` | #984500 on #F3EBDD | 5.57 | #FAB27B on #0E0A07 | 11.00 |
| `attention-ink` | `attention-soft` | #984500 on #FFD1AA | 4.69 | #FAB27B on #4E270C | 7.24 |
| `danger` | `ground` | #BE2323 on #FBF6EC | 5.64 | #F47C6B on #16120E | 7.05 |
| `danger` | `surface` | #BE2323 on #FFFFFF | 6.08 | #F47C6B on #27221D | 5.96 |
| `danger` | `surface-raised` | #BE2323 on #FFFFFF | 6.08 | #F47C6B on #312B26 | 5.28 |
| `danger` | `tray` | #BE2323 on #F3EBDD | 5.14 | #F47C6B on #0E0A07 | 7.46 |
| `ground` | `ink` | #FBF6EC on #1F2233 | 14.60 | #16120E on #F3EEE6 | 16.13 |
| `on-paint` | `paint-sun` | #1F2233 on #FDC010 | 9.53 | #1F2233 on #F9C635 | 9.86 |
| `on-paint` | `paint-berry` | #1F2233 on #EE4E89 | 4.56 | #1F2233 on #F56696 | 5.41 |
| `on-paint` | `paint-leaf` | #1F2233 on #4CC2A6 | 7.17 | #1F2233 on #5FCEB3 | 8.22 |
| `on-paint` | `paint-grape` | #1F2233 on #BC6ECE | 4.69 | #1F2233 on #C77DD8 | 5.51 |
| `on-paint` | `paint-tangerine` | #1F2233 on #F99E3A | 7.48 | #1F2233 on #FCA953 | 8.19 |
| `on-paint` | `paint-sky` | #1F2233 on #44C2F2 | 7.67 | #1F2233 on #5DCDFA | 8.67 |
| `success` | `ground` | #206B38 on #FBF6EC | 6.05 | #95DFA4 on #16120E | 11.86 |
| `success` | `surface` | #206B38 on #FFFFFF | 6.52 | #95DFA4 on #27221D | 10.03 |
| `success` | `surface-raised` | #206B38 on #FFFFFF | 6.52 | #95DFA4 on #312B26 | 8.89 |
| `warning` | `ground` | #984500 on #FBF6EC | 6.12 | #FAB27B on #16120E | 10.40 |
| `warning` | `surface` | #984500 on #FFFFFF | 6.59 | #FAB27B on #27221D | 8.79 |
| `warning` | `surface-raised` | #984500 on #FFFFFF | 6.59 | #FAB27B on #312B26 | 7.79 |
| `warning` | `attention-soft` | #984500 on #FFD1AA | 4.69 | #FAB27B on #4E270C | 7.24 |


### 2.5 Non-text contrast (3:1 minimum): control borders, focus ring, selection borders

All 23 rows pass (13 before the 2026-10-06 revision). The focus `ring` is checked against every ground and every tint, because a control can sit on any of them; the lowest is `focus-soft` in light, at 4.01. The tone inks used as rings or borders, `ink` used as icon outlines and kid-tile outlines, and `on-brand` used as glyphs all already pass the 4.5:1 text table above.

| Element | Against | Light | Ratio | Dark | Ratio |
|---|---|---|---|---|---|
| `line-strong` | `ground` | #8A7E6C on #FBF6EC | 3.69 | #8F847A on #16120E | 5.10 |
| `line-strong` | `surface` | #8A7E6C on #FFFFFF | 3.98 | #8F847A on #27221D | 4.31 |
| `line-strong` | `surface-raised` | #8A7E6C on #FFFFFF | 3.98 | #8F847A on #312B26 | 3.82 |
| `line-strong` | `tray` | #8A7E6C on #F3EBDD | 3.36 | #8F847A on #0E0A07 | 5.40 |
| `ring` | `ground` | #006E73 on #FBF6EC | 5.61 | #7EDDE1 on #16120E | 11.82 |
| `ring` | `surface` | #006E73 on #FFFFFF | 6.04 | #7EDDE1 on #27221D | 9.99 |
| `ring` | `surface-raised` | #006E73 on #FFFFFF | 6.04 | #7EDDE1 on #312B26 | 8.85 |
| `ring` | `tray` | #006E73 on #F3EBDD | 5.10 | #7EDDE1 on #0E0A07 | 12.50 |
| `ring` | `strength-soft` | #006E73 on #FBE794 | 4.88 | #7EDDE1 on #433706 | 7.45 |
| `ring` | `interest-soft` | #006E73 on #FFC9D5 | 4.19 | #7EDDE1 on #4C222D | 8.46 |
| `ring` | `helps-soft` | #006E73 on #C3F3CE | 4.90 | #7EDDE1 on #183B23 | 7.89 |
| `ring` | `focus-soft` | #006E73 on #EFC4F9 | 4.01 | #7EDDE1 on #3E1946 | 9.30 |
| `ring` | `attention-soft` | #006E73 on #FFD1AA | 4.30 | #7EDDE1 on #4E270C | 8.22 |
| `ring` | `brand-soft` | #006E73 on #D4E4FA | 4.68 | #7EDDE1 on #1A3658 | 7.78 |
| `ring` | `accent-soft` | #006E73 on #B8FCFF | 5.29 | #7EDDE1 on #003940 | 8.03 |
| `brand` | `ground` | #0D3D72 on #FBF6EC | 10.11 | #90BAF1 on #16120E | 9.30 |
| `brand` | `surface` | #0D3D72 on #FFFFFF | 10.89 | #90BAF1 on #27221D | 7.86 |
| `brand` | `surface-raised` | #0D3D72 on #FFFFFF | 10.89 | #90BAF1 on #312B26 | 6.97 |
| `brand` | `tray` | #0D3D72 on #F3EBDD | 9.20 | #90BAF1 on #0E0A07 | 9.84 |
| `accent-strong` | `ground` | #006E73 on #FBF6EC | 5.61 | #7EDDE1 on #16120E | 11.82 |
| `accent-strong` | `surface` | #006E73 on #FFFFFF | 6.04 | #7EDDE1 on #27221D | 9.99 |
| `accent-strong` | `surface-raised` | #006E73 on #FFFFFF | 6.04 | #7EDDE1 on #312B26 | 8.85 |
| `accent-strong` | `tray` | #006E73 on #F3EBDD | 5.10 | #7EDDE1 on #0E0A07 | 12.50 |


### 2.6 Boundaries and fills that are decorative by design

These pairs are reported for completeness. They are not text or control boundaries.

| Pair | Light | Dark | Why it is fine |
|---|---|---|---|
| `line` vs `ground` | 1.28 | 2.05 | Decorative card edge. Controls use `line-strong`. In dark mode the card border is clearly stronger than the 1.59 the judges flagged. |
| `line` vs `surface` | 1.38 | 1.73 | Dividers inside cards. |
| `surface` vs `ground` | 1.08 | 1.18 | Card separation also comes from the 1px `line` border, plus `shadow-lip` on tappable cards. |
| `surface-raised` vs `ground` | 1.08 | 1.33 | Dialogs also get the backdrop and `shadow-sheet`. |
| `tray` vs `surface` | 1.18 | 1.25 | Wells. Interactive wells (search, segmented tracks) also carry a `line-strong` border or a bordered selected block. |
| RoundButton boundary | 14.60 | 11.67 | Light theme: the 3px `on-paint` outline against `ground`. Dark theme: the `paint-sun` fill against `ground`. |
| `paint-*` vs `surface` | 1.65–3.45 | 5.42–9.87 | Paint is a fill inside an `ink` outline, which is at least 10:1 on every ground. Paint never carries text unless the text is `on-paint`. |
| Paint vs its own tone tile (ΔE00) | 14.7–26.4 | 40.8–59.0 | Sun on `strength-soft` is the closest pair. Every pair is above the ΔE00 12 threshold of the cut-out rule (§5.2). |
| `accent` vs `ground` / `surface` / `tray` | 3.03 / 3.26 / 2.76 | 7.84 / 6.63 / 8.29 | `accent` is a fill only: an icon paint inside an `ink` outline (4.82:1 against graphite in light), or a highlight block labelled `on-accent`. Teal text and borders use `accent-strong` (5.10:1 or better). |
| `brand` vs `ink` | 1.44 | 1.74 | Navy and graphite are close, so `brand` never marks a link by colour alone (links in running text are underlined) and never paints an icon under an `ink` outline: the active nav icon takes `accent`. |
| `accent-soft` vs `surface` | 1.14 | 1.24 | A tint, like the tone tints; any highlight on it also carries a word. |

### 2.7 Tone separation (fixes the must_fix tint and ink collisions)

These tables use CIEDE2000 (ΔE00) and OKLab ΔE×100 (ΔEok). Targets:

- Every `-soft` is at least ΔEok 8 from `surface` in light.
- Any two tones are at least ΔE00 12 apart in both themes, and ΔEok 6 apart in light.
- `focus-soft` and `brand-soft` are at least ΔE00 15 apart in both themes.
- `accent-soft` is at least ΔE00 12 from `helps-soft` and from `brand-soft` in both themes, so teal never reads as What helps or as selection.
- Easily confused inks are at least ΔE00 15 apart, including `brand` and `ink` (navy and graphite).

Light-theme OKLCH chroma of the tints:

| Tint | Chroma |
|---|---|
| `strength-soft` | 0.105 |
| `interest-soft` | 0.063 (capped by the sRGB gamut at this lightness) |
| `helps-soft` | 0.070 |
| `focus-soft` | 0.085 |
| `attention-soft` | 0.073 |
| `brand-soft` | 0.035 |
| `accent-soft` | 0.067 |

| Tint pair | Light ΔE00 | Light ΔEok | Dark ΔE00 | Dark ΔEok |
|---|---|---|---|---|
| strength / interest | 34.9 | 13.1 | 29.2 | 9.5 |
| strength / helps | 20.4 | 8.8 | 19.2 | 6.4 |
| strength / focus | 47.2 | 18.4 | 41.1 | 15.1 |
| strength / attention | 15.0 | 7.0 | 14.6 | 5.3 |
| strength / brand-soft | 35.6 | 13.9 | 35.4 | 13.3 |
| strength / accent-soft | 30.7 | 13.9 | 27.7 | 10.3 |
| interest / helps | 42.7 | 13.3 | 41.4 | 11.9 |
| interest / focus | 12.9 | 6.0 | 13.4 | 6.7 |
| interest / attention | 20.4 | 6.7 | 17.1 | 5.4 |
| interest / brand-soft | 24.5 | 8.5 | 25.3 | 11.1 |
| interest / accent-soft | 44.9 | 14.3 | 39.6 | 11.6 |
| helps / focus | 35.2 | 16.1 | 34.1 | 15.0 |
| helps / attention | 28.7 | 10.5 | 31.6 | 9.9 |
| helps / brand-soft | 25.0 | 8.6 | 28.9 | 10.1 |
| **helps / accent-soft** | **14.9** | 6.2 | **15.4** | 5.4 |
| focus / attention | 32.2 | 12.4 | 30.0 | 11.9 |
| **focus / brand-soft** | **18.7** | 8.6 | **19.2** | 9.6 |
| focus / accent-soft | 33.0 | 15.1 | 28.5 | 12.3 |
| attention / brand-soft | 27.2 | 10.9 | 31.9 | 13.7 |
| attention / accent-soft | 32.8 | 14.2 | 32.7 | 12.1 |
| **brand-soft / accent-soft** | **17.0** | 6.6 | **16.4** | 5.3 |
| strength-soft / surface | 22.5 | 12.9 | 16.3 | 10.1 |
| interest-soft / surface | 20.1 | 13.0 | 18.3 | 8.4 |
| helps-soft / surface | 20.2 | 10.6 | 20.5 | 8.6 |
| focus-soft / surface | 23.1 | 15.2 | 23.6 | 9.9 |
| attention-soft / surface | 19.5 | 13.1 | 16.4 | 8.7 |
| brand-soft / surface | 11.5 | 9.3 | 20.3 | 11.0 |
| accent-soft / surface | 18.5 | 8.6 | 19.3 | 8.7 |

In dark, some tint pairs sit below ΔEok 6 (strength / attention 5.3, interest / attention 5.4, helps / accent-soft 5.4, brand-soft / accent-soft 5.3): the dark tints have little chroma room, and each of those pairs stays above ΔE00 14.

Closest ink pairs, by ΔE00 (light / dark):

| Ink pair | Light | Dark |
|---|---|---|
| `brand` / `ink` | 15.3 | 26.5 |
| `attention-ink` / `danger` | 16.2 | 18.7 |
| `strength-ink` / `attention-ink` | 16.7 | 17.1 |
| `interest-ink` / `focus-ink` | 17.2 | 17.8 |
| `interest-ink` / `danger` | 18.9 | 17.7 |
| `accent-strong` / `helps-ink` | 21.0 | 20.6 |
| `brand` / `accent-strong` | 26.1 | 21.0 |
| `brand` / `focus-ink` | 24.7 | 23.9 |

All other pairs of coloured inks are above 24. `brand` is the sampled logo navy `#0B3A6E` nudged by ΔE00 1.0 to `#0D3D72`, which lifts `brand` / `ink` from 14.6 to 15.3.

Hue placement (OKLCH degrees):

| Colour | Hue |
|---|---|
| danger | 27–30 |
| attention and tangerine | 50–64 |
| strength | 85–96 |
| helps | 145–152 |
| leaf paint (the logo green) | 175 |
| accent (the logo teal) | 198–208 |
| sky (the logo sky) | 228 |
| brand (the logo navy) | 254–256 |
| focus and grape | 318–322 |
| interest | 2–6 |

No saturated colour (chroma above 0.05) falls between 280 and 305. The near-neutral `ink` and `ink-muted` have chroma of 0.032 or less, so their hue angle does not register.

---

## 3. Type

### 3.1 Families (all verified, all OFL)

| Role | Face | Subsets | Google Fonts name | npm package (app) | CSS family from npm |
|---|---|---|---|---|---|
| Display, Latin and Hebrew | Fredoka (variable, wght 300–700) | latin, latin-ext, hebrew (no Arabic) | `Fredoka` | `@fontsource-variable/fredoka` ^5.3.0 | `"Fredoka Variable"` |
| Display, Arabic | Baloo Bhaijaan 2 (variable, wght 400–800) | arabic, latin, latin-ext, vietnamese (no Hebrew) | `Baloo Bhaijaan 2` | `@fontsource-variable/baloo-bhaijaan-2` ^5.3.0 | `"Baloo Bhaijaan 2 Variable"` |
| Body and all UI, every script | Rubik (variable, wght 300–900) | arabic, hebrew, latin, latin-ext, cyrillic, cyrillic-ext | `Rubik` | `@fontsource-variable/rubik` (already a dependency, ^5.2.5; latest 5.3.0) | `"Rubik Variable"` |

**Imports.** Import the package root in `main.tsx`: `import "@fontsource-variable/fredoka"; import "@fontsource-variable/baloo-bhaijaan-2"; import "@fontsource-variable/rubik";`. Each root is `index.css`, the wght axis only. Do not import Fredoka's `wdth.css` or `standard.css`.

**Loading.** Every `@font-face` carries a per-subset `unicode-range`, so each locale downloads only one display file and one body file plus Latin. Vite bundles the woff2 files into the app's own origin, which satisfies CSP `font-src 'self'`. Optional: preload only Rubik latin plus the active-locale subset, and let the display faces swap in (`font-display: swap` is already set).

**Static builds.** Static `@fontsource/*` builds exist, but their family name is `"Fredoka"`, not `"Fredoka Variable"`. The stacks below list both names, so either build works.

**Artifact.** The design-system artifact loads the same three families from Google Fonts. This URL returns HTTP 200: `https://fonts.googleapis.com/css2?family=Baloo+Bhaijaan+2:wght@400..800&family=Fredoka:wght@300..700&family=Rubik:wght@300..900&display=swap`

### 3.2 Stacks and `:lang()` handling

```css
:root {
  --font-display: "Fredoka Variable", "Fredoka", "Baloo Bhaijaan 2 Variable", "Baloo Bhaijaan 2", "Rubik Variable", "Rubik", system-ui, sans-serif;
  --font-body: "Rubik Variable", "Rubik", system-ui, "Segoe UI", Tahoma, sans-serif;
}
:lang(ar) {
  --font-display: "Baloo Bhaijaan 2 Variable", "Baloo Bhaijaan 2", "Fredoka Variable", "Fredoka", "Rubik Variable", "Rubik", system-ui, sans-serif;
}
html:lang(ar) body, html:lang(he) body { line-height: 1.65; }
```

- **Arabic.** Baloo comes first, so the digits, Latin letters and spaces inside an Arabic heading stay in one face with one set of metrics.
- **Hebrew and English.** Fredoka comes first. Arabic text inside a he/en heading, such as a child's Arabic name, falls through to Baloo via `unicode-range`.
- **Present mode.** Present mode follows the content language, not the UI language. Put `lang` and `dir` on the present-stage root.
- **tokens.json `type.families`.** Use these keys; `type.fonts` stays `[]`:
  - `display`: `"Fredoka Variable", "Fredoka", "Baloo Bhaijaan 2 Variable", "Baloo Bhaijaan 2", "Rubik", sans-serif`
  - `display-ar`: `"Baloo Bhaijaan 2 Variable", "Baloo Bhaijaan 2", "Fredoka", "Rubik", sans-serif`
  - `body`: `"Rubik Variable", "Rubik", system-ui, sans-serif`
- **Arabic metrics.** Baloo Bhaijaan 2 has a content area of 1.71em (ascent 1.08em plus descent 0.63em). Fredoka's is 1.21em and Rubik's 1.19em. So every Arabic display style is 2px larger and has a line-height of at least 1.4.

**Where the display face goes.** Use it only on:

- titles: `display-xl`, `display-lg`, `title`
- child-facing text: `kid-label`, `kid-story`
- numeral blocks
- avatar initials

Never use it for buttons, form fields, tables, chips, nav labels or child names in lists. Teacher buttons use Rubik, so Baloo's tall box never sits inside a 44px control.

**Also:**

- No uppercase and no letter-spacing, because both break Arabic joining and Hebrew.
- No italics, because Arabic and Hebrew have none. Emphasise with weight.
- Dates, ages, times and counts use `tabular-nums`.

### 3.3 Type scale (10 styles)

| Style | Family | en / he size/line | Weight | ar size/line | Use |
|---|---|---|---|---|---|
| `display-xl` | display | 40/48 (32/40 below 600px) | 600 | 42/60 (34/48) | Present-mode titles, FinishScreen title |
| `display-lg` | display | 28/36 | 600 | 30/44 | Page titles, the child's name in the profile hero |
| `title` | display | 20/28 | 600 | 22/32 | Card and section heads, dialog titles, empty-state headings |
| `kid-label` | display | 24/32 | 500 (600 on KidButton and bubble titles) | 26/38 | ChoiceCard labels, KidButton text, kid bubble titles |
| `kid-story` | display | 28/42 | 500 | 30/46 | Story page text in present mode (lines of 30ch at most) |
| `name` | body | 18/26 | 600 | 18/30 | Child names in lists and cards, the user name in the shell |
| `body` | body | 16/24 (he 16/26) | 400 | 16/26 | Paragraphs, input text, observation text, quotes |
| `body-strong` | body | 16/24 (he 16/26) | 600 | 16/26 | Buttons md and up, emphasis, timeline entry titles, toast text |
| `label` | body | 14/20 | 500 (600 when selected or on sm buttons) | 14/22 | Chips, field labels, side-nav items, tabs and segments |
| `caption` | body | 13/18 | 400 (500 for nav labels and badges) | 14/22 | Dates, ages, helper text, badges, bottom-bar labels. This is the floor: nothing is smaller than 13px (14px in Arabic). |

**Samples.** In the app, use the existing i18n strings.

| Style | en | ar | he |
|---|---|---|---|
| `display-lg` | "Adam, 4 years 2 months" | "آدم، 4 سنوات وشهران" | "אדם, בן 4 שנים וחודשיים" |
| `title` | "Strengths" | "نقاط القوة" | "חוזקות" |
| `kid-label` | "Cars" | "سيارات" | "מכוניות" |

**Numeral block.** Fredoka 700 at 13/16, tabular (in Arabic, Baloo 700 at 14/16), centred in a 22px block.

---

## 4. Spacing, radius, shadow, motion

### 4.1 Spacing (4px base, 8 steps)

| Token | px | Use |
|---|---|---|
| `space-1` | 4 | Segment-track padding, the gap between a numeral block and its label |
| `space-2` | 8 | Chip gaps, icon-to-label gap inside buttons and chips, badge padding, dot gaps |
| `space-3` | 12 | Row padding-block, gaps inside cards, list gaps, toast and alert gaps |
| `space-4` | 16 | Card padding on phone, page gutter on phone, gaps between sections in a card |
| `space-5` | 20 | Card padding at md and up, primary-button padding-inline |
| `space-6` | 24 | Dialog padding, gaps between cards, present stage padding on phone |
| `space-8` | 32 | Page-section spacing, page gutter at md and up, empty-state padding |
| `space-12` | 48 | Desktop page rhythm, present stage padding on tablet |

**Target sizes:**

- Teacher controls: at least 44px; primary actions are 48px on coarse pointers.
- List rows: at least 56px.
- Child targets: at least 64px, never below 56px.

### 4.2 Radius (5)

| Token | px | Use |
|---|---|---|
| `radius-sm` | 8 | Chips, toggle chips, badges, 32px section tiles, numeral and check blocks, avatars of 32px or less, toast glyph blocks |
| `radius-md` | 14 | Buttons, IconButtons, inputs, selects, segmented and tab tracks and blocks, nav items and pills, alerts, toasts, content-type tiles, avatars 40–56px, the centre Observe block |
| `radius-lg` | 20 | Cards, centred dialogs, feedback tiles, picker tiles, picture blocks, 80px avatars |
| `radius-xl` | 28 | Kid ChoiceCards, KidButton, kid feedback bubbles, the top corners of bottom sheets (logical `border-start-start-radius` and `border-start-end-radius`) |
| `radius-round` | 9999 | True circles only: RoundButton, emoji pods, circle timeline beads, the sheet grabber |

Chips and avatars are rounded squares (blocks), never pills or circles.

### 4.3 Shadow (4 tokens, per theme): hard "block lips", blur only on sheets

| Token | Light | Dark | Use |
|---|---|---|---|
| `shadow-lip` | `0 2px 0 0 rgb(31 34 51 / 0.14)` | `0 2px 0 0 rgb(0 0 0 / 0.55)` | Tappable cards, secondary and danger buttons, the selected segment or tab block, selected feedback tiles |
| `shadow-lip-lg` | `0 4px 0 0 rgb(31 34 51 / 0.18)` | `0 4px 0 0 rgb(0 0 0 / 0.60)` | Card hover, kid ChoiceCards, RoundButton, plain KidButton |
| `shadow-lip-brand` | `0 3px 0 0 #011A3A` | `0 3px 0 0 #4C73A5` | Primary buttons, brand KidButton, the centre Observe block (a deeper navy under the navy fill in light, a mid blue under the pale blue in dark) |
| `shadow-sheet` | `0 12px 32px -12px rgb(31 34 51 / 0.30), 0 -6px 20px -14px rgb(31 34 51 / 0.20)` | `0 12px 32px -12px rgb(0 0 0 / 0.70), 0 -6px 20px -14px rgb(0 0 0 / 0.50)` | Dialogs, bottom sheets, toasts, menus |

**Dark depth** does not rely on lips. It comes from the 1px `line` card border (2.05:1 against `ground`) and the surface steps (`surface` is 1.18:1 and `surface-raised` 1.33:1 against `ground`).

**Backdrop:** `rgb(31 34 51 / 0.45)` in light and `rgb(0 0 0 / 0.60)` in dark, with no blur.

### 4.4 Motion

**Teacher screens** are calm: 180ms or less, no overshoot, no idle or looping animation.

| Name | Applies to | Motion |
|---|---|---|
| `placed` | Entering cards, chips, toasts, a saved observation | translateY(6px) to 0 and opacity 0 to 1, 180ms, `cubic-bezier(.2,.8,.2,1)` |
| `pressed` | Buttons, tappable cards, chips | translateY(2px) and the lip shrinks (the brand lip becomes `0 1px 0 0`), 90ms ease-out; release in 120ms |
| Hover | Any control | Colour and lip change in 120ms; tappable cards rise to `shadow-lip-lg` with translateY(-1px) |
| Sheet | Bottom sheet, dialog | The bottom sheet rises from 100% to 0 in 220ms `cubic-bezier(.2,.8,.2,1)`; the dialog scales .97 to 1 with a fade in 180ms |
| Timeline string | The one longer teacher motion | On first view per session, the string draws once (stroke-dashoffset) in 360ms. Beads and entries show immediately and never wait for it. |

**Present mode only (children):**

| Name | Motion |
|---|---|
| `bounce-place` | 240ms, `cubic-bezier(.34,1.3,.64,1)` (about 4% overshoot), for tiles and bubbles appearing |
| `stamp` | Scale .6 to 1.08 to 1 with rotate -6° to 0, 320ms (Preferred star, finish sticker) |
| `wiggle` | Rotate ±2°, twice, 360ms, once (Hint) |
| `nudge` | Scale 1 to 1.04 to 1, 240ms, once (Suggested) |
| Finish tower | Three blocks drop 24px each with `bounce-place`, 120ms apart, then `stamp` |

No loops, no idle bobbing, no confetti.

**Reduced motion** (`prefers-reduced-motion: reduce`):

- Remove every transform: translate, scale, rotate, the press-sink, `wiggle`, `nudge` and `stamp`.
- State changes become instant colour, border or lip changes, or opacity fades of 120ms or less.
- The timeline string renders already drawn. The finish tower and its sticker render already in place.
- The existing global rule only shortens durations, so press offsets also need `motion-reduce:translate-y-0` / `motion-reduce:transform-none`.

---

## 5. Icons

### 5.1 Construction

- **Grid.** 24×24 viewBox with a 2px safe margin (live area 2–22). Coordinates are physical, with x increasing to the right; the master is LTR, and §5.3 says which icons mirror.
- **Primitives only.** Rounded square or rect (corner 1.5–3), circle, rounded-join triangle, arch (half-round top or half-round cut-out) and capsule. No freehand curves, no faces, no characters.
- **Outline.** stroke-width 2 in viewBox units at every size, with round caps and round joins and `fill="none"`. A few strokes are heavier: the plus in `observe-add` (2.5), the check in `what-helps` (2.5), the handle in `observe-add` (3) and `arrow-next` (3).
- **Overlaps.** Author overlaps as open paths, so no line passes behind another primitive. The outline-only state therefore never shows crossing lines.
- **Paint.** Exactly one primitive per icon is painted; the retired block-tower mark was the only exception. The paint is a separate shape drawn under the outline, with the same geometry and `stroke="none"`. It covers at most about 40% of the glyph.
- **Paint slip.** At 20px and up, the paint shape is translated (0, 1.5) in viewBox units: 1.5px down at 24px, 3px at 48px. This is the "hand-painted block" signal. It is vertical only, so it never needs its own RTL handling. At 16px there is no offset.
- **Sizes:**

  | Size (px) | Where |
  |---|---|
  | 16 | Chips, badges, inline |
  | 20 | Buttons, 32px section tiles, alerts |
  | 24 | Nav |
  | 28 | Observe block, content-type tile |
  | 40 | Feedback and picker tiles |
  | 48–96 | Empty states, present mode |

### 5.2 Colour rules (duotone)

| Context | Outline | Paint |
|---|---|---|
| Meaning icons: `strengths`, `interests`, `what-helps`, `current-focus`, `attention`, `strength-builder`, `growth-support` | `ink` | Their meaning paint (§2.2), everywhere |
| `story`, `video`, `game`, `activity`, `pack`, `present`, `note-quote` | `ink` | `paint-sky` |
| `worked-well`, `partly`, `did-not-work` | `ink` | `paint-sun` on the ball, the same for all three |
| Nav icon, inactive | `ink-muted` | None |
| Nav icon, active (bottom-bar pill, side-nav row) | `ink` | `accent` on the designated primitive ("coloured in"): the logo teal, 4.82:1 against the graphite outline, where the navy `brand` would be 1.44:1 |
| Nav icon used at 48px or more (empty states) | `ink` | `paint-sky` on the designated primitive |
| On a solid fill: brand Observe block, primary button, single-select chip, danger | `on-brand` | None (single colour) |
| On a paint fill: RoundButton, toast glyph block | `on-paint` | None |

**Cut-out rule** (from Sprout Garden). An icon's paint must stay distinguishable from the tile it sits on.

- A paint on its own tone tile is at least ΔE00 14.7 in light (sun on `strength-soft` is the closest) and at least 40.8 in dark, so the paint stays.
- If a future pairing falls below ΔE00 12, the paint switches to `surface`, which reads as a cut-out.
- An icon is never placed on a ground of its own paint.

**Dark theme.** The outline flips to chalk (`ink` in dark). The paints stay saturated (5.42–9.87:1 against dark `surface`), so the kid colour survives at night. This replaces Block Box's pastel fills, which dropped to about 1.2:1 in dark.

**Delivery in the app.** One component, `src/components/icons/BlockIcon.tsx` (`<BlockIcon name size active? />`), renders inline SVG with:

- `stroke="var(--ink)"`, or `--ink-muted`, `--on-brand` or `--on-paint` by context
- `fill="var(--paint-…)"` on the paint shape (`var(--accent)` for nav icons)
- `aria-hidden`, because the label always comes from adjacent text

**Delivery in the design-system artifact.** `assets/Icons/<name>.svg` bakes the light-theme hex values, with no `currentColor`:

- outline `#1F2233`
- paint in its light hex
- nav icons exported in their active state, with the `accent` paint `#0A9EA3` (`#35B9BE` in `dark/`)

`assets/Icons/README.md` names these inks.

### 5.3 RTL mirroring

**Mirror** under RTL with `rtl:-scale-x-100` (scaleX(-1)), never `rtl:rotate-180`, which also flips the icon vertically:

`timeline`, `development`, `story`, `current-focus`, `note-quote`, `partly`, `did-not-work`, `arrow-next`

**Never mirror** these. The star, heart, check, play triangle and lens are conventions, not directions:

`children`, `observe-add`, `content`, `account`, `users`, `classes`, `parent-home`, `video`, `game`, `activity`, `pack`, `strength-builder`, `growth-support`, `strengths`, `interests`, `what-helps`, `attention`, `worked-well`, `present`

**Present-mode arrows.** In present mode, direction comes from the content language, not the UI. `NextArrow` and `BackArrow` keep their API and the `data-arrow` attribute, which `player.test.tsx` asserts.

| Component | `dir` | Drawing | `data-arrow` |
|---|---|---|---|
| `NextArrow` | ltr | `arrow-next` as drawn | `right` |
| `NextArrow` | rtl | `arrow-next` mirrored | `left` |
| `BackArrow` | ltr | `arrow-next` mirrored | `left` |
| `BackArrow` | rtl | `arrow-next` as drawn | `right` |

Lucide utility glyphs that carry direction (back and forward chevrons, `LogOut`) also get `rtl:-scale-x-100`.

### 5.4 The set: 27 icons

Coordinates are in viewBox units. "Painted" names the primitive that takes the paint.

| Icon | Meaning | Drawing | Painted | RTL |
|---|---|---|---|---|
| `children` | Nav: Children (teacher home) | Two block kids side by side. The taller one on the left: head circle r3 at (8.5,6.5); body arch from (3.5,20) up to y17, a half-round top r5 peaking at y12, down to (13.5,20), flat base at y20. The smaller one on the right, tucked behind: head circle r2.5 at (16.5,9.5); body arch x12.5–20.5 with a half-round top r4 peaking at y14.5, base y20. Its outline starts where it meets the taller body. | Smaller body | no |
| `observe-add` | Centre action: Add observation (the raised ＋) | Lens: circle r6.5 at (10.5,10.5). Handle: capsule from (15.4,15.4) to (20.5,20.5), stroke 3. A bold plus inside the lens: (8,10.5)–(13,10.5) and (10.5,8)–(10.5,13), stroke 2.5. | Lens glass (`paint-sky` in empty states; none on the brand block) | no |
| `timeline` | Nav: Development timeline | Beads on a string. The string runs at y12 from x2 to x22 with round caps, drawn as segments between the beads. Beads: a rounded triangle (baseline) with points (3,14.8), (6,9.2), (9,14.8); a circle (observation) r2.8 at (12,12); a rounded square (activity result) x15–21, y9–15, corner 1.5. The newest bead sits at the reading end. | The square bead at the end | mirror |
| `development` | Nav / button: View development | Block steps on a baseline at y20: rounded rects x3–8 (top y16), x9.5–14.5 (top y12) and x16–21 (top y8), corner 1.5. A ball, circle r2.25 at (18.5,5.25), rests on the tallest step. | Ball | mirror |
| `content` | Nav: Content library / Create content | Open toy box. Body: rounded rect x3–21, y11–20.5, corner 2.5. Toys peek over the rim with their lower halves hidden: a ball arc r2.25 centred at (7.5,9.5); a rounded triangle with apex (12.5,5.5) and base x10–15 at y11; the corner of a block, x16–20, from y7.5 down to the rim. | Box body | no |
| `account` | Nav: My account | Name block: rounded square x3–21, y3–21, corner 5. Head: circle r3 at (12,10). Shoulders: an arch from (6.5,21) up to y19, half-round r5.5 peaking at y13.5, down to (17.5,21), clipped at the square's bottom edge. | Shoulders | no |
| `users` | Admin nav: Users | Two ID cards, fanned. Back card: rounded rect x8–21, y3–19, corner 2.5, rotated +8° about (14.5,11); only the parts not behind the front card are drawn. Front card: x3–16, y6–22, corner 2.5, holding a head circle r2 at (9.5,11.5) and two bars at y16.5 (x6.5–12.5) and y19 (x6.5–10.5). | Front card | no |
| `classes` | Admin nav: Classes | Kindergarten house. Body: rounded rect x5–19, y11–21, corner 2. Roof: rounded triangle (3,11.5), (12,3.5), (21,11.5). A round window, circle r1.5 at (12,8.3), in the roof. An arch door x10–14 rising from y21 to a half-round top at y15. | Roof | no |
| `parent-home` | Parent nav: Home | Home with a heart. Body: rounded rect x5–19, y10–21, corner 2. An open chevron roof from (3,11) to (12,3.5) to (21,11). A heart in the centre: circles r2.25 at (10.25,14.5) and (13.75,14.5) joined to a point at (12,18.5). | Heart | no |
| `story` | Content type: Personalized story | Open picture book. Spine: a line at x12 from y6.5 to y20. Start page: `M12 6.5 H7.5 A4 4 0 0 0 3.5 10.5 V19.5 H12`, its outer top corner arched. End page: the same shape mirrored on the right. A sun, circle r1.75 at (7.5,11), on the start page. Two text bars at y11 and y14.5, x14.5–18, on the end page. | Start page (a sky with a sun) | mirror |
| `video` | Content type: Personalized video | Rabbit-ear TV. Screen: rounded rect x3–21, y7–20, corner 3. Antennae: lines (12,7)–(8,3) and (12,7)–(16,3), each ending in a filled ink ball r1. A rounded play triangle (10,10.5), (15.5,13.5), (10,16.5) on the screen. | Play triangle | no |
| `game` | Content type: Digital game | Puzzle block: rounded square x5–17, y7–19, corner 2.5. A round knob (arc r2.25) bulges up from the top edge at x11, and another bulges out of the right edge at y13. A matching notch (arc r2.25) is cut into the bottom edge at x11. | Block body | no |
| `activity` | Content type: Real-world / teacher-led activity | Floor play. A ground line at y20.5 from x2 to x22. An arch block x3–13, y12–20, with a half-round cut-out r2.5 centred at (8,20). A rounded triangle on top: (3.5,12), (8,5.5), (12.5,12). A cube: rounded square x15–21, y14–20, corner 1.5. | Cube | no |
| `pack` | Content type: Small / weekly pack | Backpack. Body: `M5 21 V13 A7 7 0 0 1 19 13 V21 Z`, bottom corners 2.5, so the arched top peaks at y6. Front pocket: rounded rect x8–16, y13.5–18.5, corner 1.5. Carry loop: an arch x9.5–14.5 rising from y6 to y3. | Pocket | no |
| `strength-builder` | Mode: Strength Builder | Star on a block. Block: rounded square x5–19, y13–21, corner 2, outline only. Star: five points with rounded joins, outer r5 and inner r2.3, centred at (12,8.4), its two lower points touching the block top. | Star (`paint-sun`) | no |
| `growth-support` | Mode: Growth Support | Sprout in a block pot. Pot: rounded trapezoid (6,14), (18,14), (16,21), (8,21). Stem: (12,14)–(12,7). Two half-ellipse leaves in outline only, one from (12,10) out to (7,7.5) and one from (12,8.5) out to (17,5.5). | Pot (`paint-grape`) | no |
| `strengths` | Section and chip: Strengths ⭐ | Gold-star sticker: a five-point star with rounded joins, outer r9 and inner r4.2, centred at (12,12.5). Flat, no highlight. | Star (`paint-sun`) | no |
| `interests` | Section and chip: Interests | Heart: circles r4.5 at (8,9.5) and (16,9.5) merged with a rounded point at (12,20), drawn as one outline. | Heart (`paint-berry`) | no |
| `what-helps` | Section and chip: What helps ✓ | Ticked block: rounded square x3.5–17.5, y6.5–20.5, corner 3. A bold check (stroke 2.5) from (7.5,13.5) to (11,17) to (20.5,4.5); its long arm leaves the block past the top-right corner. | Block (`paint-leaf`) | no |
| `current-focus` | Section: Current focus (max 3) | Flag in a target. Concentric circles r8.5 and r4.5 at (12,13), outline only. Mast: (12,13)–(12,2.5). A triangular pennant (12,2.5), (18,4.75), (12,7) with rounded joins. Focus items use numeral blocks 1–3 instead of this icon. | Pennant (`paint-grape`) | mirror |
| `attention` | "Worth a look": not observed lately, sensitivities, slots full | A friendly eye. Lids: `M2.5 12 Q12 3 21.5 12 Q12 21 2.5 12 Z`. Iris: circle r3.5 at (12,12). Pupil: a filled ink dot r1.25. Three short lashes: (7,6.3)–(6,4.6), (12,4.7)–(12,2.7) and (17,6.3)–(18,4.6). | Iris (`paint-tangerine`) | no |
| `note-quote` | Observation entry, Recent development quote | Speech block: rounded square x3–21, y3–17, corner 4. A tail at the bottom left: rounded triangle (6,17), (6,21), (10,17). Two capsule text bars: x7–17, y6.5–9.5 and x7–14, y11–14, corner 1.5. | Upper text bar (`paint-sky`) | mirror |
| `worked-well` | Feedback: Worked well | A finished tower centred on x12: base rounded rect x5–19, y16–21; rounded square x8–16, y10.5–15.5; ball circle r2.75 at (12,7) on top. All corners 1.5. | Ball (`paint-sun`) | no |
| `partly` | Feedback: Partly | Half built: base rounded rect x3–15, y16–21 with one rounded square x6–12, y10.5–15.5 on it. The ball, r2.75, waits on the ground beside it at (19,18.25). | Ball (`paint-sun`) | mirror |
| `did-not-work` | Feedback: Did not work (about the activity, never the child) | Tumbled, with no blame. A ground line at y21 from x2 to x22. A 9×5 rounded rect lies tilted −12° with its left foot at (3,21). A 6×6 rounded square, rotated 25°, leans against it around x11–16. The ball, r2.75, has rolled away to (19,18.25). Never an X, never red. | Ball (`paint-sun`) | mirror |
| `present` | Action: Present to the child | Tablet on a stand. Tablet: rounded rect x3–21, y4–17, corner 3. Stand: rounded triangle (9,21), (12,17), (15,21). A rounded play triangle (10,7.5), (15,10.5), (10,13.5) centred on the screen. | Play triangle (`paint-sky`) | no |
| `arrow-next` | Present mode: Next (Back is the mirror) | A chunky arrow at stroke 3 with round caps and joins: shaft (4.5,12)–(18,12); head (12,5.5), (18.5,12), (12,18.5). | None. Drawn in `on-paint` on the sun RoundButton and in `on-brand` on brand. | via the `dir` prop |
| `brand-mark` | (Retired: the logo is `project/assets/Logos`; kept only as the legacy `assets/Icons/brand-mark.svg`, not part of the 27.) Formerly the KidSphere logo (replaced the Sprout tile) | A first tower, flat fills with no outline. Arch block: rect x2–22, y12–22, corner 2, with a half-round cut-out r4 centred at (12,22), filled `brand`. Ball: circle r4.5 at (8,7.5), filled `paint-sun`. Cube: rounded square x13–20, y5–12, corner 1.5, rotated −6° about its centre, filled `paint-berry`. The ball and the cube just touch. | Three flat fills | no |

**Designated paint primitive for nav icons:**

| Icon | Primitive |
|---|---|
| `children` | Smaller body |
| `observe-add` | Lens |
| `timeline` | End bead |
| `development` | Ball |
| `content` | Box body |
| `account` | Shoulders |
| `users` | Front card |
| `classes` | Roof |
| `parent-home` | Heart |

### 5.5 How icons coexist with emoji and lucide

- **Emoji are content; custom icons are KidSphere's voice.** The emoji in `options.json` (🚗 🐘 🧱 🌈 …) are the child's own world. Custom icons cover nav, sections, actions, content types, statuses and feedback.
- **Where emoji may appear:**
  - As the leading glyph of option chips and toggle chips, inside a 24px `surface` circle "pod" with the emoji at 16px. The pod stops full-colour emoji from clashing with the chip tint.
  - On kid ChoiceCards, inside a 64–88px `surface` pod centred on a painted picture block, with the emoji at 44–64px.
- **One glyph per slot.** An emoji and a custom icon never share a slot. An interest chip shows its option emoji when it has one, otherwise the `interests` heart.
- **Where emoji never appear:** nav, headings, buttons, badges, statuses, feedback, empty states, the finish screen or the brand book.
- **Cross-platform rendering.** Emoji render differently on each OS. The pod keeps them contained, so the surrounding chrome stays consistent.
- **Utility glyphs stay lucide-react**, at strokeWidth 2 with round caps and joins, which matches the weight of the custom set: ChevronLeft, ChevronRight, ChevronDown, X, Search, MoreHorizontal, Pencil, Trash2, Check, Calendar, Mic, Menu, LogOut, RotateCcw, CircleAlert, Info, Languages and Loader2. Lucide is never used for a concept the custom set covers.

---

## 6. Components

These rules apply to every component:

- **Focus.** Every interactive element shows a 3px `ring` outline at a 2px offset (3px offset on kid tiles), so the ring lands on the ground and never on the control's own fill.
- **Logical properties only.** Use `ms`, `me`, `ps`, `pe`, `start`, `end`, `inset-inline-*`, `border-s` and `border-e`, and `border-start-*-radius`. A test bans the physical classes.
- **Reduced motion.** Every press offset uses `motion-reduce:translate-y-0`.

### 6.1 Button: primary, secondary, soft, ghost, danger

**Base.** Inline-flex, `space-2` gap, `radius-md` (14), `body-strong` label (Rubik 600, line-height 1 inside the box), 20px leading icon. Rubik in every language.

**Sizes:**

| Size | Height | Padding-inline | Label | Icon | Radius |
|---|---|---|---|---|---|
| sm | 36 (44 on `pointer: coarse`) | 12 | 14px/600 | 16 | `radius-md` |
| md | 44 | 16 | `body-strong` | 20 | `radius-md` |
| lg | 48 | 20 | `body-strong` | 20 | `radius-md` |
| xl | 64 | 32 | Rubik 600 20/28 | 20 | `radius-lg` (hero call-to-action, e.g. "Present to Adam") |

| Variant | Rest | Hover | Pressed | Rules |
|---|---|---|---|---|
| primary | `brand` fill, `on-brand` label and icon, `shadow-lip-brand` | `brand-strong` fill | translateY(2px), lip `0 1px 0 0 #011A3A` (dark `#4C73A5`) | One per view |
| secondary | `surface` fill, 1.5px `line-strong` border, `ink` label, `shadow-lip` | `tray` fill | translateY(2px), no lip | Replaces the old `outline` variant and the ink-filled `secondary` (keep `outline` as an alias) |
| soft | `brand-soft` fill, `brand` label, no border, no lip | `brand-strong` label plus an inset 1.5px `brand` ring | translateY(1px) | Second-rank actions: View development, the Edit profile sheet |
| ghost | Transparent, `ink-muted` label | `tray` fill, `ink` label | `tray` fill | Cancel, toolbars, tertiary actions |
| danger | `danger` fill, `on-brand` label, `shadow-lip` | Fill mixed 10% toward `ink` (`color-mix` in the app) | translateY(2px), no lip | Only as the confirm button inside a delete dialog. Anywhere else, Delete is a ghost button with a `danger` label and a Trash2 icon. |

**States for every variant:**

- Disabled: opacity 0.5, no lip, no press motion, `aria-disabled`, `cursor: not-allowed`.
- Loading: Loader2 replaces the icon and the label stays; `aria-busy`; no press motion.

### 6.2 IconButton

- **Shape.** A square: md is 44px (48 on coarse pointers) and sm is 36px (44 on coarse). `radius-md`. Icon 20px (18 at sm).
- **Variants:**
  - ghost (default): `ink-muted` icon, turning `ink` over `tray` on hover
  - secondary: `surface`, 1.5px `line-strong` border, `shadow-lip`
  - soft: `brand-soft` fill, `brand` icon
  - primary: `brand` fill, `on-brand` icon
- **Toggled** (`aria-pressed=true`): `brand-soft` fill, `brand` icon, 2px `brand` border.
- **Labels.** `aria-label` and `title` are required.

### 6.3 Chip (display) and ToggleChip, per tone

**Chip.**

- **Box.** Min-height 32, `radius-sm` 8 (a block, not a pill), padding-inline 10 (6 at the start when a glyph leads), `space-2` gap.
- **Label.** `label` style (Rubik 500 14/20) in `ink`, with `dir="auto"`.
- **No border or ring.**
- **Leading slot.** One of:
  - a 16px painted custom icon
  - a 24px `surface` pod holding a 16px emoji
  - a 22px numeral block (`radius-sm`, `focus-ink` fill, `on-brand` Fredoka 700 13px)

| Tone | Fill | Leading glyph | Example (en / ar / he) |
|---|---|---|---|
| strength | `strength-soft` | `strengths` 16 | Imagination / الخيال / דמיון |
| interest | `interest-soft` | Emoji pod, otherwise `interests` 16 | 🚗 Cars / سيارات / מכוניות |
| helps | `helps-soft` | `what-helps` 16 | Quiet corner before group time |
| focus | `focus-soft` | Numeral block 1–3 | 1 Joining group play / الانضمام إلى اللعب الجماعي / הצטרפות למשחק קבוצתי |
| attention | `attention-soft` | `attention` 16 | Not observed for 9 days |
| brand | `brand-soft` | Optional icon; label in `brand` | Ready |
| neutral | `tray` | None | "+3 more", languages |

- **Cap per section** (from Sprout Garden). A profile section shows at most 5 chips, then a neutral "+N" chip that is a button opening the full list.
- **Legacy aliases in the app.** `green`→helps, `sky`→brand, `violet`→focus, `amber`→attention, `rose`→danger. `stone` and `outline` become a neutral chip: `surface` fill with a 1px `line` border.

**ToggleChip.** Min-height 44, `radius-sm`, padding-inline 14, `label` style (600 when selected), optional leading emoji pod or icon.

| State | Treatment |
|---|---|
| Unselected | `surface` fill, 1.5px `line-strong` border, `ink` label; hover `tray` |
| Selected, multi-select (the default: wizard strengths, interests and helps, quick-observation chips) | `<tone>-soft` fill, 2px `<tone>-ink` border (padding compensates so the size doesn't jump), a leading 16px Check in `<tone>-ink`, `ink` label. The tone is the list's tone; the `brand` default is `brand-soft` with a 2px `brand` border. |
| Selected, single-select (radio semantics) | `<tone>-ink` fill, `on-brand` label and Check |
| Pressed | translateY(1px), 90ms |
| Disabled | Opacity 0.5 |

- **Entering.** New chips enter with `placed`.
- **Semantics.** `aria-pressed` for multi-select; `role="radio"` with `aria-checked` for single-select.

### 6.4 Badge

**Box.** Height 24, `radius-sm`, padding-inline 8, `caption` style at weight 500, optional 12–14px leading glyph, no wrapping.

| Status | Fill | Border | Text | Glyph |
|---|---|---|---|---|
| Draft | `tray` | none | `ink-muted` | Pencil |
| Ready (awaiting approval) | `brand-soft` | none | `brand` | none |
| Approved | `surface` | 1.5px `success` | `success` | Check |
| Archived | `tray` | none | `ink-muted` | none |
| Failed / error | `surface` | 1.5px `danger` | `danger` | CircleAlert |
| Focus slots full | `attention-soft` | none | `ink` | `attention` 14 |
| Review: Improving, Some improvement, No clear change | `tray` | none | `ink` | none |
| Review: Needs more observation | `attention-soft` | none | `ink` | none |

Development-review statuses never borrow feedback, tower or growth icons, so nothing reads as a level. No badge ever shows a score, percentage or count of stars.

### 6.5 Card

- **Base.** `surface` fill, 1px `line` border in both themes, `radius-lg` 20. Padding is `space-4` (16) on phone and `space-5` (20) from md up.
- **Static cards** have no lip.
- **Tappable cards.** The whole card is one link or button:
  - rest: `shadow-lip`
  - hover: `shadow-lip-lg` with translateY(-1px)
  - pressed: translateY(2px), no lip
  - focus: the `ring` outline at a 2px offset
- **Header.** `title` in `ink`, an optional `caption` in `ink-muted`, and actions at the end.
- **Never:** coloured side borders, coloured header bands, gradients.

### 6.6 ChildCard (teacher list)

A tappable Card, min-height 72, padding 12 / 16, laid out as a grid: avatar | text | meta.

- **Avatar.** 48px rounded square (`radius-md`), `tray` fill, 1px `line` border. Initials (1–2 letters) in display 600 18px `ink`; Arabic names render in Baloo via `unicode-range`. A photo fills the same block. The avatar colour is never hashed from the tints, so it can never look like a meaning.
- **Name.** `name` style (Rubik 600 18/26) in `ink`, `dir="auto"`, one line with ellipsis.
- **Age.** `caption` in `ink-muted`, tabular: "4 years 2 months" / "4 سنوات وشهران" / "בן 4 שנים וחודשיים".
- **Strength chips.** At most 2, on one line; overflow becomes "+N".
- **Meta.** At the top inline-end: "2 days ago" in `caption` `ink-muted`, with a 14px Calendar glyph.
- **Not observed lately.** An inner strip at the card bottom:
  - `space-3` above it, `radius-md`
  - `attention-soft` fill, padding 8 / 12
  - a 16px `attention` icon and `caption` 500 `ink` text: "Not observed for 9 days"
- **Grid.** One column on phone, two at md, three at xl; `space-3` gap.

### 6.7 ProfileSection header and the profile screen (SPEC §13)

**Section header row:**

1. A 32px tone tile (`radius-sm`, `<tone>-soft` fill) holding the 20px section icon: `ink` outline plus its paint.
2. A `space-3` gap.
3. The section title in `title` style and `ink`. Headings are never tone-coloured.
4. An optional count in `caption` `ink-muted`.
5. At the end, a ghost IconButton with Pencil, labelled "Edit".

**Section bodies:**

- **Strengths, Interests, What helps:** chips, capped at 5 plus "+N".
- **Current focus:** up to 3 numbered rows. Each row is min-height 44, `focus-soft` fill, `radius-md`, padding 8 / 12, with a 22px numeral block and the text in `body` `ink` ("Joining group play"). When all 3 are set, the header shows a "Focus slots full" badge.
- **Recent development:**
  - a `tray` well, `radius-md`, padding 12 / 16, with a 20px `note-quote` icon
  - the latest quote in `body` `ink`, with no italics and no quote-mark ornaments
  - the date in `caption` `ink-muted`, tabular
  - "Last observed 2 days ago"

**Hero:**

- **Identity.** An 80px avatar (`radius-lg`, `tray`), the name in `display-lg` `ink`, then age and languages in `caption` `ink-muted`.
- **Decoration.** One decorative block cluster at the inline-end: a 72×48 scene of three painted primitives (a sun ball, a sky square and a berry triangle) with 2px `ink` outlines. At most one per screen; hidden below 380px.
- **Action row:**
  - Add observation: primary, `observe-add` icon
  - Create content: secondary, `content` icon
  - View development: soft, `development` icon
  - Edit profile: ghost

### 6.8 SupportScale (Independent / With support / Difficult)

- **Structure.** A `role="radiogroup"` with a visible label.
- **Track.** `tray` fill, `radius-md`, 4px padding, 4px gap, about 52px tall overall. Three equal segments, each at least 44px tall.
- **Unselected segment.** Transparent, `label` 500 in `ink-muted`; hover turns the label `ink`.
- **Selected segment:**
  - a `surface` block with a 2px `brand` border (9.20:1 on `tray` in light, 9.84:1 in dark)
  - `shadow-lip`
  - a leading 16px Check in `brand`
  - label at 600 in `ink`

  The border and the check together are the non-colour cue.
- **Never colour-coded.** All three levels share one neutral treatment: never green, blue or orange per level, and never red.
- **Keyboard.** Arrow keys move the selection in reading direction (RTL-aware). The `ring` shows on the selected segment.
- **Reuse.** The same control serves the feedback question "Did the child need support? No / Some / Significant".
- **Strings.** Use the existing i18n strings (`observations.*`, `content.*`).

### 6.9 ContentTypeTile

- **Inline tile** (content cards and lists): a 48px `tray` rounded square (`radius-md`) holding the 28px type icon (`ink` outline plus `paint-sky`).
- **Picker tile** (the type choice on Create content):

  | Part | Treatment |
  |---|---|
  | Box | Min 120×104; `surface` fill; 1.5px `line-strong` border; `radius-lg`; padding 12 |
  | Icon | A 56px `tray` block holding the 40px icon |
  | Label | `body-strong` in `ink` |
  | Description | One line of `caption` in `ink-muted` |
  | Hover | `shadow-lip-lg` |
  | Selected | `brand-soft` fill, 2px `brand` border, and a 24px check block at the top inline-end, inset 8 (`brand` fill, `radius-sm`, `on-brand` Check 16). Radio semantics. |

- **Content card.** A Card holding the inline tile, then the title (`title`, `ink`), a mode tag and a status badge.
- **Mode tag.** 24px tall, `radius-sm`, `caption` 500 in `ink`:
  - Strength Builder: `strength-soft` fill with the `strength-builder` icon at 16px
  - Growth Support: `focus-soft` fill with the `growth-support` icon at 16px
- **One paint for all types.** Story, video, game, activity and pack all use `paint-sky`, so the colour has a single job (content), and the type name is always shown.

### 6.10 Child-facing: present mode, games, big buttons

**Stage.** Full-screen `ground`. Padding is `space-6` on phone and `space-12` on tablet; content is at most 960 wide. `lang` and `dir` come from the content language.

#### ChoiceCard

ChoiceCard keeps its API, the `CardState` union, `data-state` and the `aria-pressed` logic.

- **Sizes.**

  | Size | Tablet | Phone |
  |---|---|---|
  | md | 140×140 min | 120×120 min |
  | lg | 180×180 min | 150×150 min |

  Both sizes: `radius-xl` 28, padding 12, gap 8, laid out as a column.
- **Idle.**
  - The tile: `surface` fill, a 3px `ink` colouring-book outline (inset border), `shadow-lip-lg`.
  - The picture block: a `radius-lg` rounded square, 88px (md) or 120px (lg), painted with a play colour by tile position (index mod 6): `paint-sun`, `paint-sky`, `paint-berry`, `paint-leaf`, `paint-tangerine`, `paint-grape`.
  - The pod: a `surface` circle centred on the picture block, 64px (md) or 88px (lg), holding the emoji at 44px or 64px. With no emoji, the pod shows the label's initial in display 600 `ink`.
  - The label: `kid-label` in `ink`, `dir="auto"`, at most 2 lines.
- **Motion.** Hover: translateY(-2px). Pressed: translateY(4px) with no lip, 90ms.

**States.** Never red and never an X. The label stays `ink` at full opacity, at least 10:1, in every state except Done.

| State | When (in the games code) | Fill | Outline | Extra |
|---|---|---|---|---|
| `idle` | Not picked | `surface` | 3px `ink` | Picture block painted by position |
| `selected` | Picked with no preferred answer, or the first pick of a pair | `brand-soft` | 4px `brand` | A 28px check block at the top inline-end, inset 8 (`brand` fill, `radius-sm`, `on-brand` Check) |
| `preferred` | Picked, and it is the preferred one | `helps-soft` | 4px `success` | A 40px star sticker (`paint-sun` with an `ink` outline) stamps in at the top inline-end. Feedback: "warm". |
| `other` | Picked, but not the preferred one | `attention-soft` | 4px `attention-ink` | No mark on the tile. Feedback: "think", using the existing `tryAnother` string: "Let's try another one" / "لنجرّب واحدة أخرى" / "בואו ננסה עוד אחד" |
| `suggested` | The preferred one, shown after an "other" pick | `surface` | 4px dashed `success` (dash 10, gap 8) | A 28px outline-only star (`ink` outline, no paint) at the top inline-end, plus one `nudge` |
| `done` | A matched pair is finished | `tray` | 3px `line-strong`, no lip | Picture block at 60% opacity (decoration only). Label in `ink-muted` at full opacity (6.39:1 light, 10.05:1 dark). A 28px `success` check block. |
| `hint` | Sequence hint: "look here" | `strength-soft` | 4px dashed `strength-ink` | One `wiggle`. Under reduced motion the dashed ring alone carries the hint. |

**Focus and disabled.** The `ring` sits at a 3px offset outside the outline. When disabled (the round is over), there is no hover or press, and the state visuals stay.

#### KidButton

- **Box.** Min-height 64 (72 at md), `radius-xl` 28, padding-inline 28, gap 12.
- **Text.** `kid-label` at weight 600; icon 28px.

| Variant | Rest | Hover | Pressed |
|---|---|---|---|
| brand | `brand` fill, `on-brand` text, `shadow-lip-brand` | `brand-strong` | translateY(3px), no lip |
| plain | `surface` fill, 3px `ink` outline, `ink` text, `shadow-lip-lg` | `tray` fill | translateY(3px), no lip |

Disabled: opacity 0.4, no lip.

#### RoundButton (next, back, replay)

- **Box.** A 72px circle (80 at md), `radius-round`.
- **Default.** `paint-sun` fill, a 3px `on-paint` outline, `arrow-next` at 36px in `on-paint`, `shadow-lip-lg`. This is the second bright crayon in present mode, beside the brand navy. Pressed: translateY(3px), no lip.
- **Other variants.**
  - brand: `brand` fill, `on-brand` icon, no outline
  - plain: `surface` fill, 3px `ink` outline, `ink` icon
- **Labels.** `aria-label` and `title` are required.
- **Boundary.** In light, the outline against `ground` is 14.60:1. In dark, the fill against `ground` is 11.67:1.

#### Dots (progress; no numbers)

A centred row with an 8px gap, `aria-hidden` (progress is also given as text).

| Dot | Size | Treatment |
|---|---|---|
| Upcoming | 12px rounded square, corner 4 | 2px `line-strong` border, transparent fill |
| Done | 12px | `brand-soft` fill, 2px `brand` border |
| Current | 28×12 block, corner 6 | `brand` fill |

#### Feedback bubble

- **Box.** `radius-xl`, padding 20 / 24, at most 640 wide, centred, no border.
- **Behaviour.** `role=status`, `aria-live=polite`. It enters with `bounce-place` (opacity only under reduced motion).
- **Text.** Title in `kid-label` 600 `ink`; body in display 500 at 20/30, `ink`.
- **Tones:**
  - warm: `helps-soft`, with a 40px sun-star sticker above the title
  - think: `attention-soft`
  - calm: `brand-soft`

#### KidHeading

The title is `display-lg` on phone and `display-xl` on tablet, centred, in `ink`. The intro is Rubik 20/30 in `ink-muted`, at most 40ch.

#### FinishScreen (redesigned)

**Layout.** A centred column, gap 24, padding-block 40. It replaces the 🌈 emoji, because emoji are content, not chrome.

**The tower.** A 160px block tower builds itself from three pieces. Each drops 24px into place with `bounce-place`, 120ms apart:

1. An arch block, 120×56, corner 14, with a half-round cut-out, in `brand` with a 3px `ink` outline.
2. A cube, 56×56, corner 10, in `paint-berry` with a 3px `ink` outline.
3. A ball, 48px, in `paint-sun` with a 3px `ink` outline.

Then a 56px star sticker stamps beside the tower at the inline-end (320ms).

**Text and action.**

- Title: `display-xl` `ink` (`player.finish.title`).
- Body: 20/30 `ink-muted` (`player.finish.body`, or the passed message).
- Action: a brand KidButton, "Play again", with RotateCcw at 28px.

**Rules.**

- No points, no counts of stars, no scores, no results.
- Under reduced motion the tower and the sticker render already in place, with a fade of 120ms or less.
- Keep `data-testid="finish-screen"` and `data-testid="play-again"`.

### 6.11 "How did it go?" feedback (teacher)

- **Structure.** A radiogroup of three tiles in one row: equal widths, min 96×96, 8px gap.
- **Tile.** `surface` fill, 1.5px `line-strong` border, `radius-lg`, padding 12. A 40px icon (`worked-well`, `partly` or `did-not-work`: `ink` outline with a sun ball) above a `body-strong` `ink` label: Worked well / Partly / Did not work.
- **Selected, the same for all three:** `brand-soft` fill, 2px `brand` border, a 24px check block at the top inline-end, `shadow-lip`. No green, orange or grey by outcome, and no celebration for any outcome.
- **Follow-up questions** appear below with `placed`:
  - support needed: the SupportScale variant No / Some / Significant
  - what helped: helps-tone ToggleChips
  - an optional note: Textarea

### 6.12 Development timeline

- **Order.** Vertical, newest first, grouped by month. Month headers are `caption` 500 in `ink-muted`, tabular.
- **String.** A 2px `line-strong` line along the inline-start edge (`inset-inline-start: 19px`). It draws once on first view (360ms) and is shown already drawn under reduced motion.
- **Beads.** 28px, centred on the string, 2px `ink` outline, painted. This one mapping is used in the icon, the timeline and the legend:

  | Entry type | Bead shape | Paint |
  |---|---|---|
  | Baseline | Rounded triangle | `paint-sun` |
  | Observation | Circle | `paint-sky` |
  | Activity result | Rounded square | `paint-leaf` |
  | Focus change | Arch | `paint-grape` |
- **Legend.** A row at the top shows each bead shape with its word.
- **Entries.** Static Cards with `margin-inline-start: 48px`:
  - date and time in `caption` `ink-muted`, tabular
  - title in `body-strong` `ink`; text in `body` `ink`
  - activity results show the feedback icon (20px) with its word, in the neutral treatment
  - the support level appears as a `tray` badge with the word only

### 6.13 AppShell: top bar, side nav, phone bottom bar with the raised centre ＋

#### Top bar (below lg)

- **Bar.** Sticky; 56px tall plus `safe-area-inset-top`. Solid `ground` with a 1px `line` bottom border and no blur.
- **Start.** The Brand link: the KidSphere logo as an inline lockup (a 36px round mark, then the wordmark image 22px tall, 8px apart; `project/assets/Logos`), at least 44px tall, named by the mark's alt text.
- **End.** The compact LocaleSwitcher, plus a 44px avatar-menu IconButton (a 32px `tray` avatar block).

#### Side nav (lg and up)

- **Panel.** 256 wide, sticky, full height. `ground` fill, a 1px `line` `border-inline-end`, padding 12, gap 16.
- **Order.**
  1. The Brand.
  2. A full-width lg primary Button, "Add observation", with `observe-add` at 20px in `on-brand`.
  3. The nav list.
  4. A footer.
- **Nav items.** Min-height 44, `radius-md`, padding-inline 12, gap 12, a 24px icon and a `label`.

  | State | Fill | Label | Icon |
  |---|---|---|---|
  | Inactive | none | `ink-muted` | `ink-muted` outline, no paint |
  | Hover | `tray` | `ink` | as inactive |
  | Active (`aria-current="page"`) | `brand-soft` | `brand` at 600 | `ink` outline with `accent` paint |
- **Footer.** A 1px `line` top border and padding-top 12. It holds:
  - the user block: a 36px avatar, the name in `label` 600 `ink`, the role in `caption` `ink-muted`; it shows as active on the Account page
  - the LocaleSwitcher
  - Sign out: a ghost button with LogOut at 18px and `rtl:-scale-x-100`

#### Bottom bar (below lg)

- **Bar.** Fixed to the bottom. `surface` fill with a 1px `line` top border, 64px tall plus `safe-area-inset-bottom`. Items sit in a centred row at most 576 wide.
- **Items.** Up to 4 regular items, split around the centre action; any overflow goes under "More" (Menu). Each item is a flex column, min-height 64, gap 4:
  - a 24px icon inside a 48×28 pill (`radius-md`)
  - a label in `caption` 500 at 13/16 (14/18 in Arabic), one line with ellipsis. This fixes the old 11px and 12px labels.

  | State | Pill | Icon | Label |
  |---|---|---|---|
  | Inactive | none | `ink-muted` outline | `ink-muted` |
  | Active | `brand-soft` | `ink` outline with `accent` paint | `brand` at 600 |
- **Centre Observe action (raised).**
  - **Block.** A 56px block, not a circle: `radius-md`, `brand` fill.
  - **Glyph.** `observe-add` at 28px in `on-brand`; its bold plus is the ＋.
  - **Raise.** A 4px `ground` ring (`box-shadow: 0 0 0 4px var(--ground)`) plus `shadow-lip-brand`. It is raised so half of it sits above the bar (`margin-top: -24px`).
  - **Label.** "Observe" in `caption` 600 `brand` underneath (the existing `nav.observe`: ملاحظة / תצפית).
  - **States.** Hover: `brand-strong`. Pressed: translateY(2px) with a 1px lip.
- **Menu sheet.** A Dialog bottom sheet listing the same items.

#### Main content

At most 1152 wide. Padding-inline is 16 on phone and 32 from md up. Padding-bottom is 128 while the bottom bar is visible.

### 6.14 Input, Textarea, Select

- **Field.** A label above (`label` 500 `ink`, 6px gap), the control, then helper text below (`caption` `ink-muted`) or an error.
- **Control.** Min-height 48, `radius-md`, `surface` fill, 1.5px `line-strong` border, padding-inline 14. Text in `body` (16px, which prevents iOS zoom), `ink`; placeholder in `ink-muted`.

| State | Treatment |
|---|---|
| Hover | Border `ink-muted` |
| Focus-visible | 3px `ring` outline at a 2px offset, and the border turns `brand` |
| Invalid | 2px `danger` border, plus a message in `caption` 500 `danger` with CircleAlert 16; `aria-invalid` and `aria-describedby` |
| Disabled | `tray` fill, `line` border, `ink-muted` text |
| Read-only | `tray` fill, `line-strong` border |

- **Textarea.** Min-height 96, padding 12 / 14, resizes vertically.
- **Select.** The same box with a trailing ChevronDown (20px, `ink-muted`, not mirrored) at the inline-end, and `padding-inline-end: 40px`.
- **Search.** `tray` fill with a 1.5px `line-strong` border; never borderless. A leading 20px Search glyph in `ink-muted`, and an sm IconButton to clear.
- **Checkbox and radio.** 24px (checkbox corner 6, radio round) with a 1.5px `line-strong` border. Checked: `brand` fill with an `on-brand` check or dot. The label is `body` `ink`, and the whole row is at least 44px tall.
- **Date and time** (quick observation; defaults to now): the same box with a Calendar glyph, in tabular numerals.

### 6.15 Dialog and bottom sheet

**Centred dialog (md and up):**

- **Panel.** `surface-raised`, `radius-lg`, `shadow-sheet`, at most 480 (sm) or 640 (md) wide, padding 24.
- **Header.** The title in `title` style `ink`, with a ghost close IconButton at the inline-end.
- **Footer.** Actions aligned to the end, with the primary action last in reading order.

**Bottom sheet (below md):**

- **Panel.** Full width, `surface-raised`.
- **Shape.** Top corners `radius-xl`, set with `border-start-start-radius` and `border-start-end-radius`.
- **Spacing and size.** Padding 16 / 24 plus the bottom safe area. At most 90dvh tall; the body scrolls.
- **Grabber.** 36×4, `radius-round`, `line-strong`: 3.98:1 on the raised surface in light and 3.82:1 in dark.
- **Entry.** It rises in 220ms.

**Both:**

- **Backdrop.** `rgb(31 34 51 / .45)` in light and `rgb(0 0 0 / .60)` in dark, with no blur.
- **Native `<dialog>`.** Focus is trapped, Esc closes it, focus returns to the opener, and it is `aria-labelledby` its title.
- **Destructive confirm.**
  - The title names the object: "Delete this observation?"
  - The body says what will be lost.
  - The footer holds a ghost "Cancel" and a danger "Delete".

### 6.16 Toast

- **Box.** `ink` fill, text in `ground` at `body-strong`, `radius-md`, padding 12 / 16, gap 12, `shadow-sheet`, at most 420 wide.
- **Placement.**
  - On phone: centred, with its bottom at 64 + 16 + the safe area, so it sits above the bottom bar.
  - From lg up: at the bottom inline-end, inset 24.
- **Glyph block.** A leading 28px block, `radius-sm`:

  | Toast | Block fill | Glyph |
  |---|---|---|
  | Success | `paint-leaf` | Check in `on-paint` |
  | Warning | `paint-tangerine` | CircleAlert in `on-paint` |
  | Info | `paint-sky` | Info in `on-paint` |
  | Error | `danger` | CircleAlert in `on-brand` |
- **Controls.** An optional action as an underlined text button in `ground`, plus a close X IconButton in `ground`.
- **Behaviour.**
  - Role: `role=status`, or `role=alert` for errors.
  - Dismissal: automatic after 5s, except errors, which stay until closed. The timer pauses on hover and focus.
  - Entry: `placed`.

### 6.17 Alert (inline)

**Box.** `radius-md`, padding 12 / 16, gap 12, a 20px leading glyph, text in `body` `ink`, and an optional title in `body-strong`.

| Alert | Fill | Border | Glyph |
|---|---|---|---|
| Info | `brand-soft` | none | Info, in `brand` |
| Warning | `attention-soft` | none | The `attention` icon |
| Success | `surface` | 1.5px `success` | Check, in `success` |
| Error | `surface` | 1.5px `danger` | CircleAlert, in `danger`; the title is also `danger` |

### 6.18 EmptyState (friendly block-scene illustration)

**Layout.** A centred column, padding 32 / 24, at most 420 wide:

1. A 120×96 block scene.
2. A heading in `title` style `ink`.
3. One sentence in `body` `ink-muted`, at most 40ch.
4. One primary button, plus an optional ghost button.

**Scene construction.** viewBox 120×96, 3px `ink` strokes with round joins. The floor is a 3px `line-strong` line at y88 from x8 to x112. Each scene uses at most two paints.

| Context | Scene |
|---|---|
| No children | A big arch block (x20–80, y48–88, cut-out r12) in `paint-sky`, and a ball (r10 at (96,78)) waiting beside it in `paint-sun` |
| No observations | The `observe-add` lens (r18 at (44,52), handle to (70,78)) in `paint-sky`, resting beside a `paint-sun` ball (r10 at (92,78)) |
| No content | An open toy box (x24–84, y52–88) in `paint-sky`, with a `paint-sun` ball (r10 at (98,78)) outside it |
| No timeline | A string at y48 from x8 to x112, with one triangle bead (the baseline) in `paint-sun` at the start and dashed outlines (2px dashes) for the empty beads |
| Nothing found | A puzzle-block outline with its knob in `paint-sky` |

**Copy.** Kind and a little playful (from Sprout Garden). The button stays plain spec language.

| Context | en | ar | he |
|---|---|---|---|
| No children | **The block corner is empty.** Add the first child to start getting to know them. [Add child] | **ركن المكعّبات فارغ.** أضيفوا الطفل الأول لنبدأ بالتعرّف إليه. [إضافة طفل] | **פינת הקוביות ריקה.** הוסיפו את הילד הראשון כדי להתחיל להכיר אותו. [הוספת ילד] |
| No observations | **Nothing noticed yet.** What did Adam do today that made you smile? [Add observation] | **لم نلاحظ شيئاً بعد.** ما الذي فعله آدم اليوم وجعلك تبتسم؟ [إضافة ملاحظة] | **עוד לא תיעדנו כלום.** מה אדם עשה היום שגרם לך לחייך? [הוספת תצפית] |
| No content | **The toy box is waiting.** Create something made just for Adam. [Create content] | **صندوق الألعاب بانتظارك.** اصنعوا شيئاً خاصاً بآدم. [إنشاء محتوى] | **ארגז הצעצועים מחכה.** צרו משהו שנעשה במיוחד בשביל אדם. [יצירת תוכן] |
| No timeline | **The string is ready for its first bead.** Observations and activity results will appear here. | **الخيط جاهز لأول خرزة.** ستظهر الملاحظات ونتائج الأنشطة هنا. | **החוט מוכן לחרוז הראשון.** תצפיות ותוצאות פעילויות יופיעו כאן. |

### 6.19 Tabs

- **Construction.** The same as SupportScale: a `tray` track (`radius-md`, 4px padding). Tabs are at least 44px tall; inactive labels are `label` 500 in `ink-muted`.
- **Selected tab.** A `surface` block with a 2px `brand` border, `shadow-lip`, a leading 16px Check in `brand`, and the label at 600 in `ink`. This follows the segmented-button convention: the border (9.20:1 on `tray`) plus the check is the non-colour cue.
- **Hover.** The label turns `ink`.
- **Keyboard.** `role="tablist"`. Arrow keys follow the reading direction; Home and End jump to the ends.
- **More than 4 tabs.** The track scrolls horizontally with scroll-snap, with no gradient fade.

### 6.20 Avatar (shared)

- **Sizes.** 32 (`radius-sm`), 40, 48 or 56 (`radius-md`), and 80 (`radius-lg`).
- **Initials.** `tray` fill, a 1px `line` border, initials in display 600 `ink`.
- **Photo.** Uses the same block shape, `object-fit: cover`.
- **Never** a hashed colour.

---

## 7. Voice, and do / don't

### 7.1 Voice notes

- **Strengths first.** Lead with who the child is, what they are good at and what they love. Support needs are called "What helps" and "Current focus", never deficits (SPEC §46).
- **Plain words for teachers.** Actions, labels and statuses use the spec's words:
  - Add observation, Create content, View development, Edit profile
  - Worked well / Partly / Did not work
  - Independent / With support / Difficult
  - Draft / Ready / Approved
- **Playful words** appear only in empty states and present mode, such as "The toy box is waiting" and "Let's try another one".
- **Never** "wrong", "fail", "behind", "below level", "score", %, ranks or comparisons between children. Feedback describes the activity, never the child.
- **Short.** One idea per sentence. Buttons are verb plus object.
- **Native in each language.** Write Arabic and Hebrew natively, not word for word. Use the gender-inclusive Hebrew forms the app already uses (עצמאי/ת). Ages read "4 years 2 months". Dates use tabular numerals.

### 7.2 Do and don't

| Do | Don't |
|---|---|
| Pair every tone with its icon and its word | Use colour alone for meaning, selection or status |
| Keep labels on tints in `ink` | Put tone-coloured text on tints (the only exception is `brand` on `brand-soft`, documented above) |
| Use attention (tangerine) for "keep an eye on", needs and sensitivities | Use red, or an X, for anything about a child |
| Keep the support scale and feedback neutral (same selection for every option) | Colour-code levels or outcomes like a traffic light |
| Keep paint inside outlined icons, picture blocks, stickers, the finish tower and empty-state scenes | Use paint as text, as a large background, or as a chip fill on teacher screens |
| Use one primary button per view and Rubik inside every teacher button | Use the display face in buttons, forms, tables, chips or nav labels |
| Put option emoji in a `surface` pod | Use emoji in nav, headings, buttons, statuses, feedback, the finish screen or the brand book |
| Use logical properties and `rtl:-scale-x-100` for mirrored icons | Use physical margins, padding or radii, or `rotate-180` for mirroring |
| Give every control the 3px `ring` at a 2px offset | Remove outlines, or let the ring sit on the control's own fill |
| Keep avatars neutral (`tray` with `ink` initials, or a photo) | Hash avatar colours from the meaning tints |
| Use one decorative block cluster per screen at most | Use gradients, glows, glassmorphism, backdrop blur, left-border accent cards, or Inter or Roboto |
| Keep motion short and once-only, and fully static under reduced motion | Use idle, looping or bouncing animation on teacher screens |
| Celebrate the child with a tower and a sticker | Show points, counts of stars, scores, percentages or progress bars |

---

## 8. Judges' must_fix items and how each is resolved

| # | Judge | must_fix | Resolution |
|---|---|---|---|
| K1 | Kid appeal | Tints visible and distinct (OKLCH chroma .07–.10, ΔE 8 or more from card, 6 or more between tones; interest pinker, attention more orange, strength more yellow) | §2.7. Light chroma is 0.063–0.105. ΔEok from `surface` is 8.2–15.2. The closest tone pair is ΔEok 6.0 / ΔE00 12.9. Hues: interest 4, attention 62, strength 96. Every `ink` and `ink-muted` pair on the new tints passes (lowest 5.02). |
| K2 | Kid appeal | Coloured idle state in present mode, all 7 CardStates mapped, never red or an X | §6.10: painted picture blocks on idle tiles, and a full 7-state table (Other and Suggested included) |
| K3 | Kid appeal | Design the FinishScreen | §6.10: a self-stacking block tower plus a sticker stamp, no counts, static under reduced motion, test ids kept |
| K4 | Kid appeal | Keep the brand away from the AI-violet look in dark mode | The brand is the logo navy (hue 254.5 light, 255.4 dark) with the logo teal `accent` at hue 199, and focus and grape sit at hue 318–322. Nothing falls between hue 280 and 305. Flat fills only. `on-brand` on `brand` is 10.89 (light) and 9.38 (dark). |
| K5 | Kid appeal | Separate interest from danger in ink and in tint | `interest-ink` vs `danger` is ΔE00 18.9 (light) and 17.7 (dark). There is no `danger-soft` tint at all, because error alerts are `surface` with a `danger` border. |
| T1 | Teacher | `focus-soft` vs `brand-soft` 15 or more in both themes | ΔE00 21.6 (light) and 17.6 (dark). The numeral block stays on every focus chip. |
| T2 | Teacher | Neutral avatars | `tray` ground with `ink` initials, or a photo, and no hashing (§6.6, §6.20) |
| T3 | Teacher | One timeline bead mapping | Triangle for baseline, circle for observation, square for activity result, arch for focus change. The icon, the timeline and the legend all use it (§5.4, §6.12). |
| T4 | Teacher | Neutral feedback treatment | All three icons share one paint (the sun ball), and selection is identical for every outcome (§6.11) |
| T5 | Teacher | Decouple success from What helps | Success alerts and the Approved badge are `surface` with a `success` border, a check and a word. `helps-soft` is never a success ground. |
| T6 | Teacher | Nav labels at least 13px (14 in Arabic) | Bottom-bar labels use `caption` 500 at 13/16 (14/18 in Arabic); the side nav uses `label` 14 |
| T7 | Teacher | Present tiles shouldn't rotate through meaning tints | Tile grounds are neutral `surface`. Only the inner picture block rotates, through the saturated play paints, never through the meaning tints. Present mode shows no meaning chips, icons or words, so the paints there carry no meaning. |
| T8 | Teacher | Document `brand` text on `brand-soft` honestly | §2.3 and §2.4: 8.44 (light) and 6.12 (dark) since the 2026-10-06 navy (5.16 and 5.89 with the earlier blue) |
| T9 | Teacher | Card separation in dark; strength vs attention in dark | 1px `line` card border at 2.05:1, `surface` step 1.18:1, and strength-soft vs attention-soft in dark at ΔE00 14.6 |
| X1 | Technical | Non-colour cue on Tabs and the support scale | A 2px `brand` border (9.20 / 9.84 on `tray`) plus a Check glyph (§6.8, §6.19) |
| X2 | Technical | Bordered search field | `tray` fill plus a 1.5px `line-strong` border (3.69–3.98 light, 4.31–5.10 dark) |
| X3 | Technical | Duotone fill disappears (on same-tone tiles and in dark) | Saturated paints replace the pastel fills: 5.42–9.87:1 against dark `surface`, and at least ΔE00 14.7 from their own tile. The cut-out rule is documented (§5.2). |
| X4 | Technical | Dark separation and dark `line-strong` | Dark `line-strong` `#8F847A` measures 3.82–5.40 (5.40 on `tray`). Dark `line` is 2.05 against `ground`. Surface steps are 1.18 and 1.33. |
| X5 | Technical | Baloo line-height of at least 1.4 | Every Arabic display style is 1.43–1.53 (§3.3) |
| X6 | Technical | Token migration hazards | §9 rename map. `brand-ink` is gone (it becomes `on-brand`); `surface` now means card and `ground` means page. |
| X7 | Technical | Literal aliases in tokens.json | `"{helps-ink}"` and `"{attention-ink}"` |
| X8 | Technical | Kid Done tile at 50% opacity | No opacity on the label: `ink-muted` on `tray` at 6.39 / 10.05. Only the decorative picture block is at 60%. |
| X9 | Technical | Keep `data-arrow`, use `rtl:-scale-x-100`, don't touch the concurrent folders | §5.3, plus the §9 constraints |

---

## 9. Implementation notes for the app restyle

These notes are for the lead and the app agent.

**Tokens in `src/index.css`:**

- Light values go in `:root`.
- Dark values go in both `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }` and `:root[data-theme="dark"] { … }`.
- `@theme inline` maps `--color-<token>: var(--<token>)` for every colour token, plus `--font-display`, `--font-sans` (pointing at `--font-body`), `--radius-*` and `--shadow-*`.
- Give `body` an explicit `background: var(--ground)` and `color: var(--ink)`.
- `:focus-visible { outline: 3px solid var(--ring); outline-offset: 2px; }`

**Rename map.** Do it in one pass, outside the concurrent folders:

| Old | New |
|---|---|
| `--surface` (the page) / `bg-surface` | `--ground` / `bg-ground` |
| `--card` / `bg-card` | `--surface` / `bg-surface` |
| `--surface-2` | `--tray` |
| `--muted` / `text-muted` | `--ink-muted` / `text-ink-muted` |
| `--brand-ink` / `text-brand-ink` (used in the primary Button, the selected Chip, WizardEngine and wizard fields) | `--on-brand` / `text-on-brand` |
| `--strength`, `--interest`, `--helps`, `--attention` | `--*-ink`, plus the new `--*-soft` |
| (new) | `--focus-soft`, `--focus-ink`, `--paint-*`, `--on-paint`, `--ring`, `--surface-raised`, `--line-strong`, `--brand-strong` (already exists) |

**Transition aliases.** Keep `--color-card: var(--surface)` and `--color-muted: var(--ink-muted)` for one release, so untouched code still renders. In `features/{observations,focus,timeline}`, `bg-surface` used as the page ground shifts from `#FBF6EC` to `#FFFFFF` (1.08:1). That is acceptable until the concurrent agent switches those files to `bg-ground`. Do not edit those folders.

**Tailwind stone-\* classes:**

| Existing classes | Map to |
|---|---|
| stone-50 / stone-100 hover fills | `tray` |
| stone-200 rings | `line` |
| stone-300 | `line-strong` |
| stone-600 / stone-700 text | `ink-muted` / `ink` |
| stone-800 | `ink` |
| emerald, sky, violet, amber, rose tint/text pairs | The tone tokens |

**Badge and Chip.** Add a `focus` tone and keep `attention` working. Switch the focus, observations and timeline call sites to `focus` only after the concurrent work lands.

**Fonts.** Add `@fontsource-variable/fredoka` and `@fontsource-variable/baloo-bhaijaan-2` (^5.3.0) as dependencies, and import them next to Rubik. Add the `:lang(ar)` display-stack swap from §3.2. The ar/he body line-height of 1.65 stays.

**Icons.**

- Add `src/components/icons/BlockIcon.tsx`.
- Replace these lucide nav icons:

  | Nav item | Current lucide icon | New icon |
  |---|---|---|
  | `nav.children` | Users | `children` |
  | `nav.observe` | Plus | `observe-add` |
  | `nav.parentHome` | Heart | `parent-home` |
  | `nav.users` | UsersRound | `users` |
  | `nav.classes` | School | `classes` |
- The observe route lives in `features/observations/routes.tsx`. If that file is off-limits right now, wire the icon through the routing metadata later, or leave it for the concurrent agent. Do not edit the folder.
- Replace the Sprout tile in `Brand` with `brand-mark` (superseded: Brand now renders `components/brand/Logo`).
- `NavItem.icon` is typed as `LucideIcon`. Widen it to `ComponentType<{ className?: string }>`, or add an `iconName`.

**Kid UI.** Keep the exported API, the `CardState` union, `data-state`, `data-arrow`, `aria-pressed` and every `data-testid`.

**Constraints that still apply:** logical CSS only, a 44px minimum target (56 for children), contrast as tabulated, reduced motion. Frontend tests run only on the server: `bash deploy/ci/remote-test.sh <label> frontend`.

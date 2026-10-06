The KidSphere icon set: 27 painted block glyphs, one SVG per icon, named exactly as the design names them (`strengths.svg`, `what-helps.svg`, `did-not-work.svg`). One more file, `brand-mark.svg`, is legacy: the retired block-tower logo, kept only as a record (see the last row of the table below). The KidSphere logo is not an icon; it lives in the Logos asset group (`assets/Logos`).

## Inks in these files

`<img>` cannot inherit colour, so every file is baked with fixed inks: the files in this folder carry the light-theme values, and `dark/` carries the same icons baked with the dark-theme values. Nothing uses `currentColor` or CSS variables.

| Ink | Hex | Token | Where |
|---|---|---|---|
| Outline | `#1F2233` | `ink` | Every outline, the pupil of `attention`, the antenna balls of `video`, the whole of `arrow-next` |
| Brand paint | `#005DBD` | `brand` | The nine nav icons, exported in their active state: `children`, `observe-add`, `timeline`, `development`, `content`, `account`, `users`, `classes`, `parent-home`. Also the arch of the legacy `brand-mark` |
| Sky paint | `#33A7E0` | `paint-sky` | `story`, `video`, `game`, `activity`, `pack`, `present`, `note-quote` |
| Sun paint | `#FDC010` | `paint-sun` | `strengths`, `strength-builder`, the ball of `worked-well`, `partly` and `did-not-work`, the ball of the legacy `brand-mark` |
| Berry paint | `#EE4E89` | `paint-berry` | `interests`, the cube of the legacy `brand-mark` |
| Leaf paint | `#4DB956` | `paint-leaf` | `what-helps` |
| Grape paint | `#BC6ECE` | `paint-grape` | `current-focus`, `growth-support` |
| Tangerine paint | `#FA8927` | `paint-tangerine` | `attention` |

`arrow-next` is single-ink `#1F2233` (`on-paint`), drawn for the sun RoundButton. The legacy `brand-mark` has three flat fills and no outline.

## Dark theme

`dark/<name>.svg` holds 26 of the glyphs (and the legacy `brand-mark`) baked with the dark-theme values: outline `ink` `#F3EEE6` (also the pupil of `attention` and the antenna balls of `video`), `paint-sun` `#F9C635`, `paint-berry` `#F56696`, `paint-leaf` `#61C568`, `paint-grape` `#C77DD8`, `paint-tangerine` `#FA9947`, `paint-sky` `#43B5E8` and `brand` `#8CB4FE`. They are drawn for a walnut ground, so view them on a dark tile. `arrow-next` has no dark copy: it always sits on a paint fill, in graphite `on-paint`, in both themes.

- A preview places both files, the light one with `.ks-ico--l` and the dark one with `.ks-ico--d` (see `components/bundle.css`), and the theme shows one.
- Never filter the light files to fake the dark theme: no drop-shadow halo, no invert, no grayscale.
- Inactive nav icons are an `ink-muted` outline with no paint, which no baked file shows: draw them inline, as the AppShell preview does.
- The app needs neither file. It draws the same geometry inline (below), with the outline in the text colour and the paint from its token, so it follows the theme on its own.

## Construction

- 24 × 24 viewBox with a 2px safe margin. Outline stroke 2, round caps and round joins, `fill="none"`.
- Heavier strokes, scaled with the outline: the `observe-add` plus (2.5) and handle (3), the `what-helps` check (2.5), the `arrow-next` arrow (3).
- Exactly one primitive is painted. The paint is a separate fill under the outline, shifted 1.5 units down (the "hand-painted" slip), so a sliver of colour shows under the bottom edge. At 16px the slip is off.
- Overlaps are authored as open paths: a shape tucked behind another stops at its edge, so the outline-only state never shows a line passing behind.

## Sizes

| Size | Where |
|---|---|
| 16 | Chips, badges, inline text (no slip) |
| 20 | Buttons, 32px section tiles, alerts |
| 24 | Nav (side nav rows, bottom-bar pills) |
| 28 | The raised Observe block, content-type tiles |
| 40 | Feedback tiles, the content-type picker |
| 48–96 | Empty states, present mode |

## Right-to-left

Mirror these under RTL with `scaleX(-1)` (`rtl:-scale-x-100`), never a 180° rotation: `timeline`, `development`, `story`, `current-focus`, `note-quote`, `partly`, `did-not-work`, `arrow-next`. Never mirror the rest: the star, heart, check, play triangle and lens are conventions, not directions. In present mode, `arrow-next` follows the content language, not the UI: Next is drawn as is in LTR content and mirrored in RTL content; Back is the reverse.

## The icons

| File | Means | Painted primitive | Mirrors |
|---|---|---|---|
| `children.svg` | Nav: Children (teacher home) | The smaller kid's body | no |
| `observe-add.svg` | The centre action: Add observation | The lens | no |
| `timeline.svg` | Nav: Development timeline (beads: baseline triangle, observation circle, activity-result square) | The newest bead | yes |
| `development.svg` | Nav and button: View development | The ball on the top step | yes |
| `content.svg` | Nav: Content library; button: Create content | The toy box | no |
| `account.svg` | Nav: My account | The shoulders | no |
| `users.svg` | Admin nav: Users | The front card | no |
| `classes.svg` | Admin nav: Classes | The roof | no |
| `parent-home.svg` | Parent nav: Home | The heart | no |
| `story.svg` | Content type: Personalized story | The start page, a sky with a sun | yes |
| `video.svg` | Content type: Personalized video | The play triangle | no |
| `game.svg` | Content type: Digital game | The puzzle block | no |
| `activity.svg` | Content type: Real-world, teacher-led activity | The cube on the floor | no |
| `pack.svg` | Content type: Pack | The pocket | no |
| `strength-builder.svg` | Mode tag: Strength Builder | The star | no |
| `growth-support.svg` | Mode tag: Growth Support | The pot | no |
| `strengths.svg` | Section and chip: Strengths | The star sticker | no |
| `interests.svg` | Section and chip: Interests (when the option has no emoji) | The heart | no |
| `what-helps.svg` | Section and chip: What helps | The ticked block | no |
| `current-focus.svg` | Section: Current focus (items use numeral blocks 1–3 instead) | The pennant | yes |
| `attention.svg` | Worth a look: "Not observed for 9 days", sensitivities, focus slots full | The iris | no |
| `note-quote.svg` | An observation entry, the Recent development quote | The upper text bar | yes |
| `worked-well.svg` | Feedback: Worked well | The ball on top of the tower | no |
| `partly.svg` | Feedback: Partly | The ball waiting beside the half tower | yes |
| `did-not-work.svg` | Feedback: Did not work (about the activity, never the child) | The ball that rolled away | yes |
| `present.svg` | Action: Present to the child | The play triangle | no |
| `arrow-next.svg` | Present mode: Next (Back is its mirror) | None, single ink | yes |
| `brand-mark.svg` | Legacy, not part of the set: the retired block-tower logo (a child's first tower). Kept only as a record; never use it as the logo, an app icon or a favicon (the logo is `assets/Logos`). The tower lives on only as the present-mode finish motif, which the FinishScreen draws itself | Three flat fills: `brand` arch, `paint-sun` ball, `paint-berry` cube | no |

## In the app

These files are for documentation and previews. The app renders the same geometry inline from `frontend/src/icons` (`StoryIcon`, `WhatHelpsIcon`, or `<BlockIcon name="story" />`): the outline is `currentColor`, the paint reads its token, and every icon is `aria-hidden` because the word beside it is the label. The app has no `brand-mark` icon: it shows the logo with `Logo` (`frontend/src/components/brand/Logo.tsx`).

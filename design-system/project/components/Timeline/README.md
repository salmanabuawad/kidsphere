# Timeline

The child's development timeline drawn as beads on a string: each entry is a painted bead whose shape says what it is, beside a static card, newest first.

## When to use

- The child's Timeline tab and the parent's view of shared moments.
- For the latest single quote on the profile, use the Recent development well in ProfileSection.

## What the consumer provides

- `entries`, newest first, each with:
  - `type`: `baseline`, `observation`, `activity_result` (content feedback) or `focus_change`. The type picks the bead.
  - `at`: a date and time, shown in `caption` `ink-muted` with tabular numerals.
  - `title` in `body-strong` `ink`, and optional `text` in `body` `ink`.
  - for activity results, the outcome (the 20px feedback icon with its word, in the neutral treatment) and the support level (a `tray` Badge with the word only).
- Month grouping is done by the component; month headers are `caption` 500 in `ink-muted`.

## The bead map

This one mapping is used in the `timeline` icon, the timeline and the legend:

| Entry type | Bead shape | Paint |
|---|---|---|
| Baseline | rounded triangle | `paint-sun` |
| Observation | circle | `paint-sky` |
| Activity result | rounded square | `paint-leaf` |
| Focus change | arch | `paint-grape` |

Beads are 28px with a 2px `ink` outline, centred on a 2px `line-strong` string at `inset-inline-start: 19px`. Entry cards sit 48px in from the inline start, so the string runs down the right side in Arabic and Hebrew. A legend row at the top shows each bead with its word.

## Motion

The string draws once per session in 360ms; beads and entries show immediately and never wait for it. Under reduced motion it renders already drawn.

## Do and don't

- Do keep entries descriptive and dated; let the beads carry type, and the words carry meaning.
- Do show outcomes and support levels as words in the neutral treatment.
- Don't chart progress, show counts per month, or colour entries by how well something went.

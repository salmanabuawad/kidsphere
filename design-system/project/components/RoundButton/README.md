# RoundButton

A 72px round, icon-only button for present mode: by default a `paint-sun` ball with a 3px graphite outline and a chunky arrow, the second bright crayon beside the brand blue.

## When to use

- Next and Back between story pages and game rounds, and Replay or Read again.
- Only in present mode. A teacher-facing icon action uses IconButton.

## What the consumer provides

The API is unchanged from the app: `label`, `children`, `tone`, plus button props.

- `label` (required): becomes `aria-label` and `title` ("Next", "Back", "Read again").
- `children`: one 36px glyph. Next and Back use the `arrow-next` icon through `NextArrow` and `BackArrow`.
- `tone`:
  - default (sun): `paint-sun` fill, 3px `on-paint` outline, `on-paint` glyph, `shadow-lip-lg`.
  - `brand`: `brand` fill, `on-brand` glyph, no outline.
  - `plain`: `surface` fill, 3px `ink` outline, `ink` glyph.

Box: 72px (80px from md), `radius-round`. Pressed sinks 3px and loses the lip. Focus is the 3px `ring` at a 3px offset. Disabled is opacity 0.4.

## Direction

Direction comes from the content language on the stage, not from the UI language. `NextArrow` and `BackArrow` keep their `data-arrow` attribute:

| Component | Content `dir` | Drawing | `data-arrow` |
|---|---|---|---|
| NextArrow | ltr | `arrow-next` as drawn | `right` |
| NextArrow | rtl | mirrored with `scaleX(-1)` | `left` |
| BackArrow | ltr | mirrored | `left` |
| BackArrow | rtl | as drawn | `right` |

## Do and don't

- Do mirror with `scaleX(-1)`, never `rotate(180deg)`.
- Do keep the boundary visible: the outline holds 14.60:1 on `ground` in light, and the fill 11.67:1 in dark.
- Don't put text or counts inside the ball, or use it for teacher actions.

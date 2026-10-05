# KidButton

A big, chunky text button for children in present mode, set in the rounded display face and pressed like a wooden toy key.

## When to use

- Present-mode actions a child or teacher taps on the tablet: Play again, Read again, Listen, I told my story!
- For icon-only next, back and replay, use RoundButton. Teacher screens use Button.

## What the consumer provides

The API is unchanged from the app: `children`, `tone`, plus button props.

- `children`: a short phrase, optionally with a 28px leading icon. Text is `kid-label` at 600 (Fredoka; Baloo Bhaijaan 2 in Arabic).
- `tone`:
  - `brand` (default): `brand` fill, `on-brand` text, `shadow-lip-brand`; hover `brand-strong`.
  - `plain`: `surface` fill, 3px `ink` outline, `ink` text, `shadow-lip-lg`; hover `tray`.
- `disabled`: opacity 0.4, no lip.

Box: min-height 64 (72 from md), `radius-xl`, padding-inline 28, gap 12. Pressed sinks 3px and loses the lip in 90ms. Focus is the 3px `ring` at a 3px offset.

## Do and don't

- Do keep words few and warm, in the content's language, with `lang` and `dir` on the stage.
- Do use one brand KidButton per screen; the rest are plain.
- Don't shrink below 56px for any child target.
- Don't use exclamation-heavy praise, points or "correct" in labels; the finish tower does the celebrating.

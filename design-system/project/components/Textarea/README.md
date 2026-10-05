# Textarea

A multi-line text field for observations, notes and story text, sharing the Input's box, states and Field wiring.

## When to use

- "What happened?" in a quick observation, "What did you observe?" after content feedback, notes for the teacher, story pages in the content editor.
- For a single line, use Input.

## What the consumer provides

- Through `Field`: `label`, optional `hint`, optional `error`, `required`.
- Through `Textarea`: the native props (`value`, `placeholder`, `rows`, `disabled`, `readOnly`, `maxLength`).
- `dir="auto"`, so an Arabic or Hebrew observation reads correctly inside an English interface and the other way round.

Control: min-height 96, padding 12 / 14, `radius-md`, `surface`, 1.5px `line-strong`, `body` `ink` (26px lines in Arabic and Hebrew), and it resizes vertically only.

## States

The same as Input: hover `ink-muted` border; focus `brand` border and the 3px `ring`; invalid 2px `danger` border with a `caption` 500 `danger` message and a CircleAlert; disabled `tray` with a `line` border and `ink-muted` text.

## Do and don't

- Do use a placeholder that shows the kind of sentence wanted: "For example: asked a friend to build together".
- Do keep the observation language the teacher typed in; never auto-translate it.
- Don't add character counters that read like a score, or italic quote styling.

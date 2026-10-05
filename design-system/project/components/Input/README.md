# Input

A single-line text field in a labelled Field: 48px tall, `surface` with a 1.5px `line-strong` border, Rubik 16px so phones never zoom, and errors written in words.

## When to use

- Names, contacts, short titles, dates and times, and search.
- For longer text use Textarea; for a fixed list use Select or ToggleChips; for two to four ordered options use SupportScale.

## What the consumer provides

- Through `Field`: `label` (above, `label` 500 `ink`, 6px gap), optional `hint` (below, `caption` `ink-muted`), optional `error`, and `required`. Field wires `id`, `aria-describedby` and `aria-invalid`.
- Through `Input`: the native input props (`value`, `placeholder`, `type`, `disabled`, `readOnly`).

Control: min-height 48, `radius-md`, `surface`, 1.5px `line-strong`, padding-inline 14, text `body` `ink`, placeholder `ink-muted`.

## States

| State | Treatment |
|---|---|
| Hover | border `ink-muted` |
| Focus-visible | 3px `ring` outline at a 2px offset, and the border turns `brand` |
| Invalid | 2px `danger` border, plus a message in `caption` 500 `danger` with a 16px CircleAlert; `aria-invalid` and `aria-describedby` |
| Disabled | `tray` fill, `line` border, `ink-muted` text |
| Read-only | `tray` fill, `line-strong` border |

## Variants in the same family

- **Search**: `tray` fill with the 1.5px `line-strong` border (never borderless), a leading 20px Search glyph in `ink-muted`, and an sm IconButton to clear.
- **Date and time** (quick observation, defaulting to now): the same box with a Calendar glyph at the inline end and tabular numerals.
- **Checkbox and radio**: 24px boxes (checkbox corner 6, radio round) with a 1.5px `line-strong` border; checked is a `brand` fill with an `on-brand` check or dot. The label is `body` `ink`, and the whole row is at least 44px tall.

## Do and don't

- Do write errors as a plain sentence that says what to do: "Please write what happened."
- Do let user text set its own direction with `dir="auto"`.
- Don't rely on the red border alone, or use placeholder text instead of a label.
- Don't go below 16px text in a field.

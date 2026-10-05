# Select

A native dropdown in the same 48px field box as Input, with a ChevronDown at the inline end.

## When to use

- Choosing one item from a list too long for chips: class, main language, game type, focus area.
- For five or fewer short options a teacher picks often, prefer ToggleChips (visible at a glance); for ordered levels, SupportScale.

## What the consumer provides

- Through `Field`: `label`, optional `hint`, optional `error`, `required`.
- Through `Select`: the native `select` props and its `option` children, labelled in the current language. Start with a neutral prompt ("Choose…") when nothing is chosen yet.

Control: the Input box (min-height 48, `radius-md`, `surface`, 1.5px `line-strong`, `body` `ink`) with `appearance: none`, `padding-inline-end: 40px`, and a 20px ChevronDown in `ink-muted` at the inline end. The chevron is not mirrored; it moves to the left side in Arabic and Hebrew.

## States

The same as Input: hover `ink-muted` border; focus `brand` border and the 3px `ring`; invalid 2px `danger` border with a `caption` 500 `danger` message and a CircleAlert; disabled `tray`, `line` border, `ink-muted` text.

## Do and don't

- Do keep the native element, so the phone's own picker opens.
- Don't put emoji or icons inside options, or use a select for yes/no.

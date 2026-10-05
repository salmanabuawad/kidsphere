# Button

A labelled action in Rubik, shaped like a toy block with a hard bottom lip that sinks when pressed.

## When to use

- **primary**: the one thing the view is for, at most once per view: Add observation, Save observation, Approve. `brand` fill, `on-brand` label, `shadow-lip-brand`.
- **secondary**: an equal alternative beside the primary, such as Create content or Cancel in a form. `surface` fill, 1.5px `line-strong` border, `shadow-lip`. `outline` is kept as an alias.
- **soft**: second-rank actions that still deserve colour, such as View development or Show plan. `brand-soft` fill, `brand` label, no lip.
- **ghost**: tertiary and toolbar actions: Cancel in a dialog, Edit profile. `ink-muted` label, `tray` on hover.
- **danger**: only the confirm button inside a delete dialog. Anywhere else, Delete is a ghost button with a `danger` label and a Trash2 glyph.
- Use a link styled as a button (`ButtonLink`) when the action navigates.

## What the consumer provides

- `variant`: `primary` (default), `secondary`, `soft`, `ghost`, `danger`.
- `size`: `sm` (36px, 44px whenever any pointer is coarse: `@media (any-pointer: coarse)`, so a touch laptop counts), `md` (44px, default), `lg` (48px), `xl` (64px hero call-to-action, `radius-lg`, 20/28 label).
- `children`: a verb plus object in sentence case ("Create content", not "Content").
- `icon` (optional): a 20px leading icon (16px at sm). Custom block icons keep their paint on secondary, soft and ghost; on a primary or danger fill, draw the icon in one colour, `on-brand`.
- `loading`: swaps the icon for a spinning Loader2, keeps the label, sets `aria-busy`.
- `disabled`: opacity 0.5, no lip, no press motion, `aria-disabled`.

## States

| State | primary | secondary | soft | ghost |
|---|---|---|---|---|
| Hover | `brand-strong` | `tray` fill | `brand-strong` label, inset 1.5px `brand` ring | `tray` fill, `ink` label |
| Pressed | sinks 2px, 1px lip | sinks 2px, no lip | sinks 1px | `tray` fill |
| Focus | 3px `ring` at a 2px offset | same | same | same |

Under reduced motion the sink is removed; only colour and lip change.

## Do and don't

- Do keep Rubik in every button in every language, so Baloo's tall Arabic box never sits inside a 44px control.
- Do put the icon at the inline start; it moves to the right side in Arabic and Hebrew automatically.
- Do mirror directional icons (`development`, chevrons) under RTL; never the `content` box or the `observe-add` lens.
- Don't place two primary buttons in one view, or use colour alone to rank actions.
- Don't use the display face, uppercase or letter-spacing in a label.

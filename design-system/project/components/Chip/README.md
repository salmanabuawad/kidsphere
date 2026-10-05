# Chip

A small rounded-square block that shows one strength, interest, helper, focus or note on a profile, with its tint, its icon and its word.

## When to use

- Inside profile sections, child cards, content "why" panels and timeline entries, to show a fact about the child at a glance.
- For something the teacher can toggle, use ToggleChip. For a workflow status (Draft, Approved), use Badge.

## What the consumer provides

- `tone`: `strength`, `interest`, `helps`, `focus`, `attention`, `brand` or `neutral` (default). The fill is the tone's `-soft` tint (`tray` for neutral); the label is always `ink`, except `brand`, whose label is `brand` on `brand-soft`.
- `icon` (optional), exactly one leading glyph:
  - strength: the `strengths` star at 16px
  - interest: the option emoji in a 24px `surface` pod, otherwise the `interests` heart at 16px
  - helps: the `what-helps` ticked block at 16px
  - focus: a 22px numeral block 1, 2 or 3 (`focus-ink` fill, `on-brand` Fredoka 700 13px)
  - attention: the `attention` eye at 16px
- `children`: the label, in the `label` style (Rubik 500 14/20) with `dir="auto"`, so an Arabic interest reads correctly inside a Hebrew profile.

Box: min-height 32, `radius-sm`, padding-inline 10 (6 at the start when a glyph leads), `space-2` gap. No border and no ring.

## Rules

- A profile section shows at most five chips, then a neutral "+N more" chip that is a button opening the full list. Its hit area extends to 44px.
- Legacy app tones map as: green to helps, sky to brand, violet to focus, amber to attention. `stone` and `outline` become a `surface` chip with a 1px `line` edge.

## Do and don't

- Do pair every tint with its icon and its word, every time.
- Do keep labels in `ink` on every tint; tone inks are for borders and numeral blocks, not text.
- Don't put an emoji and a custom icon in the same chip, or an emoji straight on a tint without its pod.
- Don't use a pill or circle shape, a paint colour as a chip fill, or red for anything about a child: "worth a look" is tangerine.

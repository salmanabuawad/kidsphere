# Tabs

A segmented tab bar on a `tray` track, built like SupportScale: the selected tab is a raised `surface` block with a `brand` border and a check.

## When to use

- Switching between sibling views of one object: a child's Profile, Timeline, Content and Development; content groups (Drafts waiting, Ready to use, Used, Archived).
- As links (`TabNav`) when each tab is its own route, or as in-page tabs (`Tabs`) when the panels share a page.
- For choosing a value in a form, use SupportScale or ToggleChips instead.

## What the consumer provides

- `tabs`: `{ key, label, icon?, count? }` items, labels from the current language. An optional count is shown in `caption` with tabular numerals.
- `value` and `onChange` (or `to` per tab for `TabNav`).
- `label`: the tablist's accessible name, such as "Child pages".

## Anatomy

- Track: `tray`, `radius-md`, 4px padding and gap.
- Tab: at least 44px tall, `label` 500 in `ink-muted`; hover turns the label `ink`.
- Selected: a `surface` block with a 2px `brand` border (9.20:1 on `tray` in light), `shadow-lip`, a leading 16px Check in `brand`, and the label at 600 in `ink`. The border plus the check is the non-colour cue. An optional icon follows the check; it never replaces it.
- Focus: the 3px `ring` at a 1px offset (not 2px), because the scrolling track clips at its 4px padding and would shave the outer edge of the ring.
- More than four tabs: the track scrolls horizontally with scroll-snap and no gradient fade.

## Behaviour

`role="tablist"` with `role="tab"` and `aria-selected`. Arrow keys follow the reading direction (reversed in Arabic and Hebrew); Home and End jump to the ends. Only the selected tab is in the tab order.

## Do and don't

- Do keep labels to one or two words.
- Don't use underline-only tabs, colour-only selection, or a different colour per tab.

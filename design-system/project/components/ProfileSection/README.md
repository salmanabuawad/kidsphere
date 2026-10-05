# ProfileSection

A section of the child profile, headed by a 32px tone tile with its painted icon, so a teacher learns the meaning map once and reads it everywhere.

## When to use

- The child profile, in this order: hero, Strengths, Interests, What helps, Current focus, Recent development. Strengths always come first.
- Parent views of the same sections, read-only (no edit buttons).

## What the consumer provides

- `tone`: `strength`, `interest`, `helps`, `focus`, or none for neutral sections such as Recent development.
- `icon`: the section's custom icon at 20px (`strengths`, `interests`, `what-helps`, `current-focus`), drawn with its `ink` outline and meaning paint inside a 32px `<tone>-soft` tile (`radius-sm`).
- `title`: in the `title` style and `ink`. Headings are never tone-coloured.
- `count` (optional): `caption` in `ink-muted`.
- `onEdit` (optional): a ghost IconButton with Pencil, labelled "Edit", at the inline end.
- `children`, by section:
  - Strengths, Interests, What helps: Chips, at most five, then a neutral "+N more" button.
  - Current focus: up to three numbered rows (min-height 44, `focus-soft`, `radius-md`, padding 8 / 12, a 22px numeral block, the text in `body` `ink`). When all three are set, the header shows a "Focus slots full" badge.
  - Recent development: a `tray` well with the `note-quote` icon, the latest quote in `body` `ink` (no italics, no quote-mark ornaments) and the date in `caption` `ink-muted`.

## The hero

An 80px Avatar, the name in `display-lg`, then age and languages in `caption` `ink-muted`. One decorative block cluster (a sun ball, a sky square and a berry triangle with 2px `ink` outlines, 72 by 48) sits at the inline end and hides below 380px. The action row is: Add observation (primary), Create content (secondary), View development (soft), Edit profile (ghost).

## Do and don't

- Do pair each section's tint with its icon and its word, and keep labels in `ink`.
- Do say "What helps" and "Current focus", never "needs", "problems" or "weaknesses".
- Don't show more than three focus areas or more than one decorative cluster per screen.
- Don't colour the heading text or add a coloured side border to the card.

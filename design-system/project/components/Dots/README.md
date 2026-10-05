# Dots

A centred row of small blocks that shows where a child is in a story or game, without numbers or counts.

## When to use

- Under story pages and between game rounds in present mode.
- Not for teacher progress, and never as a score or completion bar.

## What the consumer provides

The API is unchanged from the app: `total` and `current` (zero-based).

| Dot | Size | Treatment |
|---|---|---|
| Upcoming | 12px block, corner 4 | 2px `line-strong` border, no fill |
| Done | 12px block | `brand-soft` fill, 2px `brand` border |
| Current | 28 by 12 block, corner 6 | `brand` fill |

The row is centred with an 8px (`space-2`) gap and follows the reading direction, so in Arabic and Hebrew done dots sit on the right.

## Accessibility

The row is `aria-hidden`. Give progress as text for screen readers next to it, in the content language ("Page 3 of 5").

## Do and don't

- Do keep the current dot long, so position never relies on colour alone.
- Don't print numbers, fractions or percentages beside the dots, or turn them into stars.

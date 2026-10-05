# SupportScale

A three-level segmented radio group for how much support a child needed, with one neutral treatment for every level so it never reads as a grade.

## When to use

- Quick observation: "How much support was needed?" Independent / With support / Difficult.
- Content feedback: "Did the child need support?" No / Some / Significant.
- Any other short, ordered, single choice of two to four words. For longer lists use ToggleChip; for page sections use Tabs.

## What the consumer provides

- `label`: the visible question, rendered above the track and wired with `aria-labelledby`.
- `options`: two to four `{ value, label }` pairs from the existing i18n strings (`observations.supportLevels.*`, `content.support.*`).
- `value` and `onChange`. The value may be empty; nothing is preselected.

## Anatomy

- Track: `role="radiogroup"`, `tray` fill, `radius-md`, 4px padding and gap, about 52px tall overall.
- Segment: equal widths, at least 44px tall, `label` 500 in `ink-muted`; hover turns the label `ink`.
- Selected segment: a `surface` block with a 2px `brand` border (5.37:1 on `tray` in light, 9.46:1 in dark), `shadow-lip`, a leading 16px Check in `brand`, and the label at 600 in `ink`. The border and the check together are the non-colour cue.

## Behaviour

- Arrow keys move the selection in reading direction, so in Arabic and Hebrew the right arrow moves to the previous option. The `ring` shows on the selected segment.
- The selected block changes instantly under reduced motion.

## Do and don't

- Do keep all levels in the same neutral treatment.
- Don't colour levels green, orange or red, or use traffic-light icons or faces.
- Don't turn the scale into numbers, stars or a slider.

# ToggleChip

A selectable block chip for picking options from a list: strengths, interests and helpers in the profile wizard, places and helpers in a quick observation.

## When to use

- Multi-select lists (the default): wizard strengths, interests and what helps; quick-observation "Where?" and "What helped?".
- Single-select lists with a handful of short options, such as "Which strength?" on Create content. For three ordered levels, use SupportScale instead.

## What the consumer provides

- `tone`: the list's meaning (`strength`, `interest`, `helps`, `focus`) or nothing for the `brand` default. The tone decides the selected treatment only; unselected chips are always neutral.
- `selected` and the selection mode:
  - multi-select: `aria-pressed`. Selected is the tone's `-soft` fill, a 2px tone-ink border, a leading 16px Check in the tone ink, and the `ink` label at 600. The brand default is `brand-soft` with a 2px `brand` border.
  - single-select: `role="radio"` with `aria-checked`, inside a `role="radiogroup"`. Selected is a solid tone-ink fill with an `on-brand` label and Check.
- `icon` (optional): the option emoji in a 24px `surface` pod, or a 16px custom icon.
- `children`: the option label, from the option list in the current language.

Box: min-height 44, `radius-sm`, padding-inline 14 (13.5 when selected, so the 2px border does not make it jump), `label` style.

## States

Unselected is `surface` with a 1.5px `line-strong` border and `ink` label; hover fills `tray`; pressed sinks 1px in 90ms; disabled is opacity 0.5. New chips enter with `placed`. Focus is the 3px `ring` at a 2px offset.

## Do and don't

- Do show the Check with the colour, so selection never relies on colour alone.
- Do write labels natively in each language and let them wrap the row, not truncate.
- Don't tint unselected chips, or mix tones within one list.
- Don't use red or a cross for "remove"; deselecting is just another tap.

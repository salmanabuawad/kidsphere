# ContentTypeTile

The kindergarten object that stands for a content type: a picture book for Story, a rabbit-ear TV for Video, a puzzle block for Digital game, floor blocks for Real-world activity and a backpack for Small pack, always in `paint-sky`.

## When to use

- **Inline tile**: at the start of a content card or list row, a 48px `tray` block (`radius-md`) holding the 28px icon.
- **Picker tile**: the "What would you like to create?" choice on Create content, as a radio group.
- **Content card**: a tappable Card that pairs the inline tile with the title (`title`, `ink`), a caption, a mode tag and a status Badge.

## What the consumer provides

- `type`: `story`, `video`, `digital_game`, `real_world_activity` or `pack`. The icon follows from it: `story`, `video`, `game`, `activity`, `pack`.
- `label` and, for the picker, a one-line `description` from `content.types` and `content.typeHints`.
- Picker: `checked` and `onChange`, inside a `role="radiogroup"` with a visible question.

## Picker tile

| Part | Treatment |
|---|---|
| Box | Min 120 by 104, `surface`, 1.5px `line-strong` border, `radius-lg`, padding 12 |
| Icon | A 56px `tray` block holding the 40px icon |
| Label | `body-strong` in `ink` |
| Description | one line of `caption` in `ink-muted` |
| Hover | `shadow-lip-lg` |
| Selected | `brand-soft` fill, 2px `brand` border, a 24px `brand` check block at the top inline end, inset 8 |

## Mode tag

A 24px `radius-sm` tag in `caption` 500 `ink`: Strength Builder on `strength-soft` with the `strength-builder` icon, Growth Support on `focus-soft` with the `growth-support` icon.

## Do and don't

- Do always show the type name beside the icon; one paint (`paint-sky`) serves every type, so the word does the telling.
- Do mirror the `story` book under RTL; never the TV, puzzle block, floor blocks or backpack.
- Don't colour types differently, or use a meaning tint for a content type.
- Don't use emoji for content types; emoji are the child's world, not KidSphere's chrome.

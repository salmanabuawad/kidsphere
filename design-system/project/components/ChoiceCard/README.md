# ChoiceCard

The big tappable picture block a child presses in present-mode games: a `surface` tile with a 3px `ink` colouring-book outline, a painted picture block, the picture in a round pod, and the word underneath.

## When to use

- Every present-mode game answer: choose the answer, match the pairs, put in order, sort into groups, pick the feeling, what happens next.
- Only on the present-mode stage, at child target sizes. Teacher screens use ToggleChip or the picker tiles instead.

## What the consumer provides

The API is unchanged from the app: `label`, `emoji`, `state`, `size`, plus button props.

- `label`: the word, in `kid-label` (Fredoka 500 24/32; Baloo 26/38 in Arabic) and `ink`, `dir="auto"`, at most two lines.
- `emoji` (optional): shown at 44px (64px at lg) inside a 64px (88px) `surface` pod centred on the picture block. With no emoji, the pod shows the label's initial in display 600 `ink`.
- `size`: `md` (140 square on tablet, 120 on phone) or `lg` (180 / 150). Both use `radius-xl`, padding 12, gap 8.
- The picture block is a `radius-lg` square, 88px (120px at lg), painted by tile position, index mod 6: `paint-sun`, `paint-sky`, `paint-berry`, `paint-leaf`, `paint-tangerine`, `paint-grape`. In present mode these paints are play colours with no meaning.
- `state` (the `CardState` union, written to `data-state`; `aria-pressed` is true for selected, preferred and other):

| State | When | Fill | Outline | Extra |
|---|---|---|---|---|
| `idle` | not picked | `surface` | 3px `ink` | picture block painted by position |
| `selected` | picked, no preferred answer, or the first of a pair | `brand-soft` | 4px `brand` | 28px `brand` check block, top inline end |
| `preferred` | picked, and it is the preferred one | `helps-soft` | 4px `success` | 40px gold star sticker stamps in; warm feedback |
| `other` | picked, not the preferred one | `attention-soft` | 4px `attention-ink` | no mark; think feedback "Let's try another one" |
| `suggested` | the preferred one, after an other pick | `surface` | 4px dashed `success` | 28px outline-only star, one `nudge` |
| `done` | a matched pair is finished | `tray` | 3px `line-strong`, no lip | picture block at 60%, label `ink-muted`, 28px `success` check block |
| `hint` | sequence hint: look here | `strength-soft` | 4px dashed `strength-ink` | one `wiggle` |

The label stays `ink` at full opacity in every state except done, where it is `ink-muted` (6.39:1 light, 10.05:1 dark), never faded.

## Motion

Idle tiles carry `shadow-lip-lg`; hover rises 2px; pressed sinks 4px and loses the lip in 90ms. Tiles appear with `bounce-place`. Under reduced motion there is no rise, sink, wiggle, nudge or stamp, and the dashed ring alone carries the hint.

## Do and don't

- Do keep the `ring` at a 3px offset outside the outline, so it never sits on the tile.
- Do keep the state visuals when the round is over and the tiles are disabled.
- Don't use red, an X, a shake, a buzz or the word "wrong" for an other pick.
- Don't rotate tiles through the meaning tints, or show points, scores or counts.

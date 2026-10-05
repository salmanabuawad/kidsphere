# Toast

A short confirmation that floats above the content for a moment: an `ink` bar with `ground` text and a small painted glyph block.

## When to use

- Confirming something the teacher just did: "Observation saved", "Shared with the parents.", "Focus paused".
- A passing system state: "The video is still being made."
- An error the teacher can retry: "The observation wasn't saved." with Try again.
- For a message that must stay on the page, use Alert.

## What the consumer provides

- `message`: one short sentence in `body-strong`.
- `tone`, which picks the 28px glyph block (`radius-sm`):

| Tone | Block | Glyph |
|---|---|---|
| success | `paint-leaf` | Check in `on-paint` |
| warning | `paint-tangerine` | CircleAlert in `on-paint` |
| info | `paint-sky` | Info in `on-paint` |
| error | `danger` | CircleAlert in `on-brand` |

- `action` (optional): one underlined text button in `ground`, such as Undo or Try again.

Box: `ink` fill, `ground` text (14.60:1 light, 16.13:1 dark), `radius-md`, padding 12 / 16, gap 12, `shadow-sheet`, at most 420 wide, with a 44px close X in `ground`. The action is at least 44px tall too.

On the ink toast the focus ring is ground: `ring` would land on the `ink` fill at only 2.06:1 (light) and 1.52:1 (dark), so the toast's buttons draw the same 3px outline at a 2px offset in `ground` (14.60:1, 16.13:1).

## Behaviour

- `role="status"`, or `role="alert"` for errors.
- Closes itself after 5 seconds, except errors, which stay until closed. The timer pauses on hover and focus.
- Placement: centred above the bottom bar on phone (64 + 16 + the safe area from the bottom); at the bottom inline end, inset 24, from lg.
- Enters with `placed`; fades only under reduced motion.

## Do and don't

- Do say what happened in plain words; no exclamation marks except the warm "Thank you!" after feedback.
- Don't stack more than two toasts, or put links to other pages in them.
- Don't use a toast for anything about a child's development; that belongs on the timeline.

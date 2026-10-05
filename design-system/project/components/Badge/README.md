# Badge

A compact, non-interactive status word for content, focus and development reviews.

## When to use

- Content status on cards and review screens: Draft, Ready, Approved, Archived, Failed.
- Focus capacity ("Focus slots full") in the Current focus header.
- Development-review statuses: Improving, Some improvement, No clear change, Needs more observation.
- For a fact about the child, use Chip; for a message with an explanation, use Alert.

## What the consumer provides

- `status`, which picks the treatment:

| Status | Fill | Border | Text | Glyph |
|---|---|---|---|---|
| Draft | `tray` | none | `ink-muted` | Pencil |
| Ready (awaiting approval) | `brand-soft` | none | `brand` | none |
| Approved | `surface` | 1.5px `success` | `success` | Check |
| Archived | `tray` | none | `ink-muted` | none |
| Failed or error | `surface` | 1.5px `danger` | `danger` | CircleAlert |
| Focus slots full | `attention-soft` | none | `ink` | `attention` 14px |
| Improving, Some improvement, No clear change | `tray` | none | `ink` | none |
| Needs more observation | `attention-soft` | none | `ink` | none |

- `children`: one to three words, from the app's status strings.

Box: height 24, `radius-sm`, padding-inline 8, `caption` at 500 (14px in Arabic), a 12 to 14px leading glyph, no wrapping.

## Do and don't

- Do keep success on `surface` with a check and a word, never on a `helps-soft` fill.
- Do keep review statuses neutral. They never borrow feedback towers, growth icons or tone colours, so nothing reads as a level.
- Don't show a score, a percentage or a count of stars in a badge, ever.
- Don't make badges clickable; put actions in a Button beside them.

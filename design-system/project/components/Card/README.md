# Card

The white block every teacher screen is built from: a `surface` panel with a 1px `line` edge on the birch `ground`.

## When to use

- **Static card**: a section of a page, such as a profile section, the baseline, a plan, a timeline entry. No lip.
- **Tappable card**: when the whole card is one link or button, such as a child in the list, a content item, the "Drafts waiting" strip. It carries `shadow-lip` and behaves like a block you press.

## What the consumer provides

- `children`: a header and a body. Use `CardHeader` for the title (`title` style, `ink`), an optional caption (`caption`, `ink-muted`) and actions at the inline end (ghost IconButtons or small Buttons); `CardBody` and `CardFooter` for the rest.
- For a tappable card, an `href` or `onClick` on the card itself. Put no other interactive element inside it.

Box: `surface` fill, 1px `line` border in both themes, `radius-lg` (20). Padding `space-4` on phone, `space-5` from md up. Gap cards with `space-3` in grids and `space-6` in page stacks.

## States (tappable)

| State | Treatment |
|---|---|
| Rest | `shadow-lip` |
| Hover | `shadow-lip-lg`, rises 1px |
| Pressed | sinks 2px, no lip |
| Focus | 3px `ring` outline at a 2px offset |

In dark, depth comes from the `line` edge (2.05:1 on `ground`) and the `surface` step, so cards stay distinct without the lip.

## Do and don't

- Do keep headings in `ink`; colour belongs in the 32px tone tile beside the heading, not in the text.
- Don't add coloured side borders, coloured header bands, gradients or glows.
- Don't nest a tappable card inside another, or put buttons inside a tappable card.

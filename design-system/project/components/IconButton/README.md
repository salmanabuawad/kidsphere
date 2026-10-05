# IconButton

A square, icon-only action for toolbars, card headers and dense rows, always named for screen readers.

## When to use

- Edit, More, Close, Clear, Remove and Back, where the icon is universally understood and space is tight.
- Use a labelled Button instead whenever there is room for words, or the icon is not a convention.

## What the consumer provides

- `label` (required): becomes both `aria-label` and `title`, so it is announced and shown as a tooltip. Write it as the action: "Edit", "Remove Music", "Back to profile".
- `children`: one glyph, 20px at md and 18px at sm. Use lucide for utility actions and the custom block icons for KidSphere concepts.
- `variant`: `ghost` (default: `ink-muted` icon, `tray` and `ink` on hover), `secondary` (`surface`, 1.5px `line-strong` border, `shadow-lip`), `soft` (`brand-soft` fill, `brand` icon), `primary` (`brand` fill, `on-brand` icon).
- `size`: `md` 44px (48px when any pointer is coarse) or `sm` 36px (44px when any pointer is coarse). Test `any-pointer`, not `pointer`: a touch laptop whose primary pointer is a trackpad still needs touch-sized targets. Shape is `radius-md`.
- `aria-pressed` for toggles: pressed shows a `brand-soft` fill, a `brand` icon and a 2px `brand` border, so the state is never colour alone.

## Do and don't

- Do give every icon-only button both `aria-label` and `title`.
- Do mirror back and forward chevrons, LogOut and directional block icons under RTL with `scaleX(-1)`.
- Don't mirror Menu, Pencil, X, Search or the `observe-add` lens.
- Don't shrink below 44px on touch screens, and don't use an IconButton for the view's main action.

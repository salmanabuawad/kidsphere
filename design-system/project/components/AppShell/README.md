# AppShell

The frame around every teacher, admin and parent screen: phone-first, with a top bar and a bottom bar whose centre is a big toy-blue Observe block, and a side nav from lg.

## When to use

- Every signed-in screen except present mode, which takes the full screen as a stage.

## What the consumer provides

- `nav`: the role's nav items, each with a label key, a custom icon name and an order. One item may be the centre `action` (Observe). Teacher: Children and Observe; admin adds Users and Classes; parent: My children.
- `children`: the page, placed in the main column (at most 1152 wide; padding-inline 16 on phone, 32 from md; 128 at the bottom while the bottom bar shows).
- The signed-in user (name, role) for the avatar menu and the side-nav footer.

## Below lg: top bar and bottom bar

- **Top bar**: sticky, 56px plus the top safe area, solid `ground` with a 1px `line` bottom edge and no blur. The Brand link at the start (a 36px `brand-mark` and "KidSphere" in `title` `ink`, at least 44px tall); the compact language switch and a 44px avatar-menu IconButton at the end.
- **Bottom bar**: fixed, 64px plus the bottom safe area, `surface` with a 1px `line` top edge. Up to four items split around the centre action, in a row at most 576 wide; overflow goes under More (Menu), which opens a bottom sheet with the same items.
- **Items**: a 24px icon in a 48 by 28 pill (`radius-md`) over a `caption` 500 label at 13/16 (14/18 in Arabic), one line with an ellipsis.

| State | Pill | Icon | Label |
|---|---|---|---|
| Inactive | none | `ink-muted` outline, no paint | `ink-muted` |
| Active (`aria-current="page"`) | `brand-soft` | `ink` outline with `brand` paint | `brand` at 600 |

- **Observe**: a 56px `brand` block (`radius-md`, not a circle) with the `observe-add` glyph at 28px in `on-brand`, raised half out of the bar (`margin-block-start: -24px`) by a 4px `ground` ring and `shadow-lip-brand`. "Observe" sits underneath in `caption` 600 `brand`. Hover `brand-strong`; pressed sinks 2px with a 1px lip.

## lg and up: side nav

- A 256px panel, sticky and full height, on `ground` with a 1px `line` inline-end edge, padding 12, gap 16.
- In order: the Brand; a full-width lg primary "Add observation" button; the nav list (44px rows, `radius-md`, a 24px icon and a `label`; hover `tray`; active `brand-soft` with a `brand` 600 label and the painted icon); a footer with a `line` top edge holding the user block, the language switch and a ghost Sign out with a mirrored LogOut glyph.

## Do and don't

- Do keep the Observe block reachable with one thumb on every teacher screen.
- Do mirror the whole shell under RTL with logical properties; the brand wordmark stays "KidSphere" in Latin.
- Don't blur or tint the top bar, or put more than four items beside Observe.
- Don't use lucide icons for nav; use the custom set (`children`, `observe-add`, `users`, `classes`, `account`, `parent-home`, `timeline`, `development`, `content`).

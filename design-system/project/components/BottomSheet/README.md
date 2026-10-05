# BottomSheet

The phone form of a Dialog: a full-width `surface-raised` panel that rises from the bottom edge, with rounded top corners and a grabber, used below md.

## When to use

- Every Dialog below md: confirms, small forms, the Edit profile sheet.
- The bottom bar's More menu, listing the same nav items as the side nav.
- Quick pickers on phone, such as "Who did you observe?" with recently observed children first.

## What the consumer provides

The same props as Dialog (`open`, `onClose`, `title`, `children`, `footer`); the component chooses sheet or centred dialog by breakpoint.

## Anatomy

- Panel: full width, `surface-raised`, `shadow-sheet`, padding 16 / 24 plus the bottom safe area, at most 90dvh tall with a scrolling body.
- Shape: top corners `radius-xl`, set with `border-start-start-radius` and `border-start-end-radius`.
- Grabber: 36 by 4, `radius-round`, `line-strong` (3.98:1 on the raised surface in light, 3.82:1 in dark).
- Header: the title in `title` `ink` and a ghost close IconButton at the inline end.
- Rows inside: at least 56px tall for list rows, 44px for nav items.
- Backdrop and behaviour: as Dialog (flat backdrop, native `<dialog>`, focus trapped and returned, Esc closes).

## Motion

The sheet rises from 100% to 0 in 220ms, cubic-bezier(.2,.8,.2,1). Under reduced motion it fades in within 120ms.

## Do and don't

- Do keep the primary action reachable at the bottom of the sheet, not hidden behind scrolling.
- Do keep the grabber visible; it signals the sheet can be dismissed.
- Don't nest sheets, or use a sheet on tablet and desktop widths.

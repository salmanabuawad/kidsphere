# Dialog

A centred panel on a flat backdrop for a short decision or a small form, from md up; below md the same content opens as a BottomSheet.

## When to use

- Confirming something that changes or removes work: delete a draft, archive a child, create a new baseline.
- Small focused forms: add a focus, create a new version.
- Not for messages that need no decision (use Toast or Alert), and not for long multi-step flows (use a page).

## What the consumer provides

- `open` and `onClose`.
- `title`: in the `title` style, `ink`. For a destructive confirm, the title names the object: "Delete this observation?".
- `children`: the body. For a destructive confirm, say what will be lost and whether it can be undone.
- `footer`: the actions, aligned to the inline end with the primary action last in reading order. A destructive confirm is a ghost "Cancel" and a danger "Delete".
- `size`: `sm` (at most 480 wide, default) or `md` (640).

## Anatomy

- Panel: `surface-raised`, `radius-lg`, `shadow-sheet`, padding 24.
- Header: the title with a ghost close IconButton at the inline end.
- Backdrop: flat `rgb(31 34 51 / 0.45)` in light and `rgb(0 0 0 / 0.60)` in dark, never blurred.
- Entry: scales from .97 with a fade in 180ms; a fade only under reduced motion.

## Behaviour

Use the native `<dialog>`: focus is trapped, Esc closes it, focus returns to the opener, and it is `aria-labelledby` its title.

## Do and don't

- Do use the danger fill only for the confirm inside a delete dialog.
- Do keep it short: one question, one or two sentences, two buttons.
- Don't stack dialogs, or open one without a user action.
- Don't use red for anything about a child; archiving a child is a neutral primary action, not danger.

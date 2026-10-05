# Avatar

A child's or adult's photo or initials in a neutral rounded-square block, the same for everyone.

## When to use

- Child cards (48), the profile hero (80), pick lists and timeline mentions (40), the shell's user block (36) and avatar menu (32).

## What the consumer provides

- `name`: used for the initials and the accessible name.
- `src` (optional): a photo URL. The photo fills the same block with `object-fit: cover`.
- `size`: 32 (`radius-sm`), 40, 48 or 56 (`radius-md`), or 80 (`radius-lg`).

Without a photo: `tray` fill, a 1px `line` edge, and one or two initials in the display face at 600 in `ink` (13, 16, 18, 20 and 28px by size). Arabic initials fall through to Baloo Bhaijaan 2 by `unicode-range` and `:lang(ar)`.

## Do and don't

- Do keep every avatar neutral, so it can never be mistaken for a meaning.
- Do mark it decorative (`aria-hidden`) when the name is written right beside it.
- Don't hash a colour from the name, use the meaning tints or paints, or draw a face or character.
- Don't use circles; avatars are blocks like everything else in KidSphere.

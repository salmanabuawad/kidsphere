# KidHeading

The centred title and one-line intro at the top of a present-mode story page or game, in the rounded display face.

## When to use

- Above every game and story section in present mode: "What happens next?", "Let's talk about it", a game's own title.
- For story page text itself, use the `kid-story` style (28/42, at most 30ch a line).

## What the consumer provides

The API is unchanged from the app: `title` and optional `intro`.

- `title`: `display-lg` on phone and `display-xl` on tablet, centred, `ink`, `dir="auto"`. In Arabic the stage's `lang="ar"` swaps in Baloo Bhaijaan 2 at the Arabic sizes.
- `intro` (optional): Rubik 20/30 in `ink-muted`, centred, at most 40ch.

The stage that holds it carries the content's `lang` and `dir`, not the UI's.

## Do and don't

- Do keep titles to a short question or phrase a teacher can read aloud.
- Do use the game's existing strings (`player.game.*`, `player.story.*`) in the content language.
- Don't use uppercase, letter-spacing or italics, or decorate the title with emoji.

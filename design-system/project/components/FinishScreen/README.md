# FinishScreen

The last screen of a present-mode game: a three-piece block tower stacks itself, a gold star sticker stamps beside it, and the child is invited to play again.

## When to use

- When a child reaches the end of a game or story in present mode, whatever they picked along the way. Every child gets the same tower.

## What the consumer provides

- `message` (optional): replaces the default body (`player.finish.body`: "We played together all the way to the end.").
- `onPlayAgain`: the brand KidButton "Play again" with a 28px RotateCcw glyph.
- The stage's `lang` and `dir`, from the content language.

## Anatomy

- A centred column, gap 24, padding-block 40.
- The tower, 160px tall, built from the brand mark's primitives, each with a 3px `ink` outline:
  1. an arch block, 120 by 56, corner 14, with a half-round cut-out, in `brand`;
  2. a cube, 56 by 56, corner 10, in `paint-berry`;
  3. a ball, 48px, in `paint-sun`.
- A 56px star sticker (the `strengths` icon) at the inline end of the tower.
- Title in `display-xl` `ink` (`player.finish.title`: "Well done!" / "أحسنت!" / "כל הכבוד!"); body 20/30 in `ink-muted`.

## Motion

Each piece drops 24px into place with `bounce-place`, 120ms apart, then the sticker stamps in (320ms). It plays once. Under reduced motion the tower and sticker render already in place, with a fade of 120ms or less.

## Do and don't

- Do keep `data-testid="finish-screen"` on the root and `data-testid="play-again"` on the button.
- Don't show points, counts of stars, scores, results or a list of right and wrong picks.
- Don't use emoji, confetti or a looping animation here.

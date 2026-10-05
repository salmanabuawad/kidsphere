# KidFeedback

A soft, rounded speech bubble that answers a child's pick in present mode: warm when it fits, think when we try again, calm for everything else.

## When to use

- Right after a child taps in a game: a preferred pick (warm), an other pick (think), an open choice with every answer welcome (calm).
- Story questions and game intros use KidHeading; finishing a game uses FinishScreen.

## What the consumer provides

The API is unchanged from the app (`Feedback`): `tone`, `title`, `children`.

- `tone`:
  - `warm`: `helps-soft`, with a 40px gold star sticker (the `strengths` icon) above the title. In present mode only; never a system success.
  - `think`: `attention-soft`. Tangerine, never red.
  - `calm`: `brand-soft`.
- `title`: the existing game strings, such as "Yes! They go together!", "Let's try another one", "Thank you for choosing!". Set in `kid-label` 600 `ink`.
- `children` (optional): one short line in the display face, 500 at 20/30, `ink`, `dir="auto"`.

Box: `radius-xl`, padding 20 / 24, at most 640 wide, centred, no border. It is `role="status"` with `aria-live="polite"`, and enters with `bounce-place` (a fade only, under reduced motion).

## Do and don't

- Do describe the activity and invite the next try: "Let's try another one", "Hmm, what comes first?".
- Do keep the text `ink` on every tone (10.17:1 or better).
- Don't say "wrong", show an X, shake the screen or play a buzz.
- Don't add points, stars earned or counts.

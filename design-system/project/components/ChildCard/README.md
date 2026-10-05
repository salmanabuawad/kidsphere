# ChildCard

One child in the teacher's Children list, as a single tappable card that opens the profile: who they are, what they are good at, and whether it is worth looking in on them.

## When to use

- The Children list and class views, in a grid of one column on phone, two at md and three at xl, with a `space-3` gap.
- For a compact pick list (Who did you observe?), use a 56px list row with the same Avatar and name instead.

## What the consumer provides

- `name`: the preferred name, shown in the `name` style (Rubik 600 18/26) in `ink`, `dir="auto"`, one line with an ellipsis.
- `age`: pre-formatted, such as "4 years 2 months", "5 سنوات وشهر" or "בת 4 שנים ו־6 חודשים", in `caption` `ink-muted` with tabular numerals.
- `avatar`: a photo URL or initials (one or two letters). The avatar is a 48px `tray` block with a 1px `line` edge and `ink` initials in the display face; Arabic initials fall through to Baloo Bhaijaan 2.
- `strengths`: up to two strength Chips on one line; any more become a neutral "+N" chip.
- `lastObserved`: "2 days ago" at the top inline end, `caption` `ink-muted`, with a 14px Calendar glyph.
- `notObservedDays` (optional): when the child counts as not observed recently, an `attention-soft` strip spans the card bottom with the `attention` eye and "Not observed for 9 days" in `caption` 500 `ink`.
- `href`: the profile link. The whole card is the link.

Layout: a grid of avatar, text and meta; min-height 72; padding 12 / 16; behaves as a tappable Card (lip, rise on hover, sink on press, `ring` on focus).

## Do and don't

- Do lead with strengths; the strip is the only "worth a look" signal and it is tangerine, never red.
- Do keep the avatar neutral. Never hash a colour from the meaning tints, because a coloured avatar would read as a meaning.
- Don't show counts of observations, scores, levels or comparisons between children.
- Don't put buttons inside the card; the Observe action lives in the bottom bar and the profile.

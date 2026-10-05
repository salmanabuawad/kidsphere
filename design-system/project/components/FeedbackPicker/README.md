# FeedbackPicker

The teacher's "How did it go?" after using content with a child: three tiles drawn as block towers (finished, half built, tumbled), with one neutral selection for every outcome, then optional details.

## When to use

- On a content item after it was presented or done together, and in the feedback sheet that follows present mode.
- The outcome is about the activity, never the child.

## What the consumer provides

- `value` and `onChange` for the outcome: `worked_well`, `partly`, `did_not_work`, with labels from `content.results` (Worked well / Partly / Did not work).
- The follow-up fields, shown once an outcome is picked, entering with `placed`:
  - support needed: a SupportScale with No / Some / Significant (`content.support`);
  - what helped: helps-tone ToggleChips from the `what_helps` list;
  - an optional note: Textarea, "What did you observe?".
- `onSave`: the primary Save button.

## Anatomy

- A `role="radiogroup"` of three equal tiles in one row, min 96 by 96, 8px gap.
- Tile: `surface`, 1.5px `line-strong` border, `radius-lg`, padding 12; a 40px icon (`worked-well`, `partly`, `did-not-work`: `ink` outline with the same `paint-sun` ball) above a `body-strong` `ink` label.
- Selected, the same for all three: `brand-soft` fill, 2px `brand` border, a 24px `brand` check block at the top inline end, `shadow-lip`.
- `partly` and `did-not-work` mirror under RTL; `worked-well` does not.

## Do and don't

- Do give every outcome identical colour and selection, so none reads as a grade.
- Do let one tap be enough; everything after the outcome is optional.
- Don't colour outcomes green, orange or grey, or celebrate any of them.
- Don't use an X, a sad face or red for "Did not work".

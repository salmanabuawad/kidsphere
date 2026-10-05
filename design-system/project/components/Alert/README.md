# Alert

An inline message that stays on the page beside the thing it is about: a note on a draft, a gentle warning, a confirmed approval, or an error to fix.

## When to use

- Info: guidance about the current state ("This is a draft. Check it, edit it if needed, then approve it before using it with the child.").
- Warning: something worth a look before continuing ("Some choices rest on only a few observations").
- Success: a lasting confirmation on the page ("Approved. It is ready to use.").
- Error: a system problem the teacher must fix ("Some wording needs to change").
- For a passing confirmation, use Toast.

## What the consumer provides

- `tone`: `info`, `warning`, `success` or `error` (the app's `tip` maps to info).
- `title` (optional), in `body-strong`.
- `children`: one or two sentences in `body` `ink`.

| Tone | Fill | Border | Glyph |
|---|---|---|---|
| Info | `brand-soft` | none | Info, in `brand` |
| Warning | `attention-soft` | none | the `attention` eye |
| Success | `surface` | 1.5px `success` | Check, in `success` |
| Error | `surface` | 1.5px `danger` | CircleAlert, in `danger`; the title is also `danger` |

Box: `radius-md`, padding 12 / 16, gap 12, a 20px leading glyph.

## Do and don't

- Do keep success off `helps-soft`: it is `surface` with a `success` border, a check and a word.
- Do use the warning tone, tangerine, for anything about a child that needs a closer look; never the error tone.
- Don't add a coloured side border, a gradient or an emoji.
- Don't use alerts for marketing or tips that are not about the current task.

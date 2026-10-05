# EmptyState

A friendly placeholder for a list or page with nothing in it yet: a small block scene, a kind and slightly playful heading, one sentence, and one clear next step.

## When to use

- No children in a class, no observations for a child, no content yet, nothing on the timeline, no search results.
- Not for errors (use Alert) or loading (use a spinner in place).

## What the consumer provides

- `scene`: `children`, `observations`, `content`, `timeline` or `search`.
- `title`: the playful heading, in `title` `ink`.
- `description`: one sentence in `body` `ink-muted`, at most 40ch.
- `action`: one primary Button in plain spec words ("Add child", "Add observation", "Create content"), plus an optional ghost Button.

Layout: a centred column, padding 32 / 24, at most 420 wide, gap 12.

## Scenes

A 120 by 96 block scene with 3px `ink` outlines and round joins, standing on a 3px `line-strong` floor at y88 (the timeline scene's string, also `line-strong`, replaces the floor). Each scene uses at most two paints.

| Context | Scene | en / ar / he heading |
|---|---|---|
| No children | A big `paint-sky` arch block with a `paint-sun` ball waiting beside it | The block corner is empty. / ركن المكعّبات فارغ. / פינת הקוביות ריקה. |
| No observations | The `observe-add` lens in `paint-sky` resting beside a `paint-sun` ball | Nothing noticed yet. / لم نلاحظ شيئاً بعد. / עוד לא תיעדנו כלום. |
| No content | An open toy box in `paint-sky` with a `paint-sun` ball outside it | The toy box is waiting. / صندوق الألعاب بانتظارك. / ארגז הצעצועים מחכה. |
| No timeline | A string with one `paint-sun` baseline bead and dashed empty beads | The string is ready for its first bead. / الخيط جاهز لأول خرزة. / החוט מוכן לחרוז הראשון. |
| Nothing found | A puzzle-block outline with its knob in `paint-sky` | plain: "No children match your search" |

## Do and don't

- Do keep the heading kind and a little playful, and the button plain.
- Do name the child where it helps: "What did Adam do today that made you smile?"
- Don't use emoji, mascots, faces or characters; the scene is blocks only.
- Don't blame or nag ("You haven't added anything"), and don't show more than one decorative scene per screen.

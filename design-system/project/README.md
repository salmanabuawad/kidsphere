KidSphere is the kindergarten app where teachers get to know each child aged 3 to 6, families see what their child loves, and children play stories and tap games on a tablet. The system is **the block corner, painted**: a calm birch ground and graphite ink for the grown-ups' work, pastel tints that carry meaning, and a small, bounded set of saturated paints that make it unmistakably a children's product. Build every screen from four primitives: the rounded square (block), the circle (ball), the rounded triangle (roof) and the arch (bridge).

It must feel like a kids' app and still work for a teacher in the middle of a busy morning: playful, never chaotic; a toy box, not a toy store. Arabic is the default language, Hebrew is fully right-to-left, and English is left-to-right.

## Content fundamentals

### Who we are talking to

| Reader | Where | How it sounds | en / ar / he |
|---|---|---|---|
| Teachers | Everything outside present mode | Plain spec words. Verb plus object. One idea per sentence. | "Add observation" / "إضافة ملاحظة" / "הוספת תצפית" |
| Parents | Parent home, shared activities | Warm and specific about their own child. Never evaluative. | "Stories, games and activities the teacher shared with you." / "قصص وألعاب وأنشطة شاركتها المعلمة معكم." / "סיפורים, משחקים ופעילויות שהגננת שיתפה איתכם." |
| Children | Present mode: stories and games | Very short, warm and playful. Read aloud by the teacher or by text-to-speech. Never "wrong". | "Let's try another one" / "لنجرّب واحدة أخرى" / "בואו ננסה עוד אחד" |

### Strengths first

- Open every child with who they are: **Strengths**, **Interests** and **What helps** come before anything else on the profile.
- Name support needs as **What helps** and **Current focus** (at most three at a time). Never call them deficits, problems, delays or weaknesses.
- Describe what was seen, not what the child is: "Built a tall tower with Lina and asked her to add the roof", not a label.
- Feedback describes the activity, never the child: "Did not work" is about the game.

### Never clinical, never scored

- Never write "wrong", "fail", "behind", "below level", "score", percentages, ranks, stars earned, or comparisons between children.
- No diagnostic or clinical vocabulary anywhere, including in generated content.
- Progress is shown as words ("Improving", "Some improvement", "Needs more observation"), never as numbers, bars or levels.

### The teacher's words

Use these exact words for actions and statuses, in every language the app ships:

| Kind | en | ar | he |
|---|---|---|---|
| Profile actions | Add observation · Create content · View development · Edit profile | إضافة ملاحظة · إنشاء محتوى · عرض التطور · تعديل الملف | הוספת תצפית · יצירת תוכן · צפייה בהתפתחות · עריכת הפרופיל |
| Feedback | Worked well · Partly · Did not work | نجح جيداً · جزئياً · لم ينجح | עבד טוב · חלקית · לא עבד |
| Support scale | Independent · With support · Difficult | مستقل · بمساعدة · يجد صعوبة | עצמאי/ת · בתיווך · מתקשה |
| Content status | Draft · Ready · Approved | مسودة · جاهز · معتمد | טיוטה · מוכן · מאושר |

### Playful, in two places only

Playful copy belongs to empty states and present mode; everywhere else stays plain.

- Empty state: "The toy box is waiting. Create something made just for Adam." / "صندوق الألعاب بانتظارك. اصنعوا شيئاً خاصاً بآدم." / "ארגז הצעצועים מחכה. צרו משהו שנעשה במיוחד בשביל אדם."
- Present mode: "Well done!" / "أحسنت!" / "כל הכבוד!", and after a missed pick, "Let's try another one", never an X.

### Mechanics

- Write Arabic and Hebrew natively, never word for word from English. Hebrew uses the inclusive forms already in the app (עצמאי/ת, ילד/ה). Arabic teacher copy keeps the app's existing direct address ("اكتبي ما رأيتِ").
- Ages read "4 years 2 months" / "4 سنوات وشهران" / "בן 4 שנים וחודשיים". Dates, ages, times and counts use tabular numerals.
- Sentence case. No uppercase, no letter-spacing and no italics: they break Arabic joining, and Hebrew and Arabic have no italics. Emphasise with weight.
- No exclamation marks on teacher screens. A child-facing line may carry one.
- Emoji are the child's own world, never our chrome. They appear only as option content (an interest, a game answer) inside a `surface` pod. Never put emoji in nav, headings, buttons, badges, statuses, feedback, empty states, the finish screen or documentation.

## Colour

Colour works on three layers, and each layer has one job.

### 1. Ground and ink: calm

About 80% of every teacher screen is ground, surface and ink, so a long list reads like plain text.

- Set the page on `ground`. Put cards, inputs and the bottom bar on `surface`, always with a 1px `line` border. Put dialogs, sheets and menus on `surface-raised`. Recess wells, tracks, the search field and avatars into `tray`.
- Set primary text and every icon outline in `ink`; secondary text (ages, dates, helper text, counts, inactive nav) in `ink-muted`. Both read on `ground`, `surface`, `surface-raised`, `tray`, `brand-soft` and every `-soft` tint in both themes (lowest 5.02:1).
- Use `line` only as decoration (card edges, dividers). Every control boundary is `line-strong`, which holds at least 3:1 on every ground.

### 2. Tints: meaning

Each profile meaning has a pastel `-soft` fill and a dark `-ink`, and is always paired with its icon and its word. Learn the map once; it is the same on every screen.

| Meaning | Tint / ink | Paint in its icon | Icon | Word always shown |
|---|---|---|---|---|
| Act, "you are here" | `brand-soft` / `brand` | `brand` | the active nav icon | the button or nav label |
| Strengths | `strength-soft` / `strength-ink` | `paint-sun` | `strengths` (gold star) | Strengths |
| Interests | `interest-soft` / `interest-ink` | `paint-berry` | `interests` (heart) or the option emoji | Interests |
| What helps | `helps-soft` / `helps-ink` | `paint-leaf` | `what-helps` (ticked block) | What helps |
| Current focus, at most 3 | `focus-soft` / `focus-ink` | `paint-grape` | `current-focus`, then numeral blocks 1 to 3 | Current focus |
| Worth a look, never red | `attention-soft` / `attention-ink` | `paint-tangerine` | `attention` (eye) | e.g. "Not observed for 9 days" |
| Content, play, everyday | `tray` | `paint-sky` | the content-type icons | the type name |
| System error only | `surface` + `danger` border | none | the lucide CircleAlert glyph | the error sentence |

- Keep labels on tints in `ink`. Tone inks are for 2px selected borders, single-select fills (with `on-brand`), numeral blocks and short tone words. The one coloured-text-on-tint pair is `brand` on `brand-soft` (5.16:1 light, 5.89:1 dark).
- Use attention (tangerine) for "keep an eye on", needs and sensitivities. Never use red, or an X, for anything about a child. `danger` is only for system errors and delete confirms, and there is no `danger-soft`: an error alert is `surface` with a `danger` border.
- `success` is an alias of `helps-ink` and `warning` an alias of `attention-ink`. Show success as text or a border on `surface`, always with a check and a word, never on a `helps-soft` fill.
- Never colour-code the support scale or feedback outcomes by level. Every option gets the same neutral selection.

### 3. Paint: the kid layer

`paint-sun`, `paint-berry`, `paint-leaf`, `paint-grape`, `paint-tangerine` and `paint-sky` are what make KidSphere read as a kids' app, and they are fills only.

- Use paint only as the one painted primitive inside an `ink`-outlined icon, the picture blocks of the child's game board, stickers, the brand mark and empty-state scenes.
- Put any glyph or label on paint in `on-paint` (graphite in both themes, 4.56:1 or better on every paint).
- Never use paint as text, as a large background, or as a chip fill on teacher screens.
- `paint-sky` is the non-meaning paint for everyday things: content types, the observation bead, the info toast.
- In present mode, paints are pure play colours with no meaning, because no meaning chip, icon or word appears there.

### Action and focus

- Fill the one primary action per view with `brand` and label it `on-brand`; hover and press go to `brand-strong`.
- `on-brand` is white in light and near-black in dark: never hard-code white on `brand`.
- Use `brand-soft` for the active nav pill, soft buttons, info alerts, and the selected fill of neutral choices.
- Keyboard focus is always `ring` (see States).

### Dark theme

The dark theme is a warm walnut night playroom, not a navy-grey. The token names are the same; the tints darken, the inks lighten, and the paints stay saturated (5.42 to 9.87:1 against dark `surface`), so the kid colour survives at night. Depth comes from the 1px `line` border (2.05:1 on `ground`) and the surface steps, not from shadows.

Fills are flat in both themes: no gradients, glows, glassmorphism or backdrop blur. The top bar is solid `ground`.

## Type

Three families, all on Google Fonts and as `@fontsource-variable` packages:

- `display`: Fredoka, rounded like a toy block, for Latin and Hebrew. Arabic inside a Latin or Hebrew heading falls through to Baloo Bhaijaan 2.
- `display-ar`: Baloo Bhaijaan 2 first. Swap it in under `:lang(ar)` so the digits, Latin letters and spaces inside an Arabic heading stay in one face.
- `body`: Rubik, for every script and every teacher control.

```css
/* The nearest lang decides, so an English wordmark inside an Arabic subtree gets Fredoka back. */
:root, :lang(en), :lang(he) { --ks-display: var(--font-display); }
:lang(ar) { --ks-display: var(--font-display-ar); }
html:lang(ar) body, html:lang(he) body { line-height: 1.65; }
```

Set display text with `font-family: var(--ks-display)`. Never override `--font-display` itself under `:lang(ar)`: custom properties inherit, so a `lang="en"` element inside Arabic would keep the Arabic stack.

| Style | Family | Size / line (en, he) | Arabic style | Use |
|---|---|---|---|---|
| `display-xl` | display | 40/48, 32/40 below 600px | `display-xl-ar` 42/60 | Present-mode titles, the FinishScreen title |
| `display-lg` | display | 28/36 | `display-lg-ar` 30/44 | Page titles, the child's name in the profile hero |
| `title` | display | 20/28 | `title-ar` 22/32 | Card and section heads, dialog titles, empty-state headings, the wordmark |
| `kid-label` | display | 24/32 | `kid-label-ar` 26/38 | ChoiceCard labels (500), KidButton and bubble titles (600) |
| `kid-story` | display | 28/42 | `kid-story-ar` 30/46 | Story pages in present mode, at most 30ch a line |
| `name` | body | 18/26 | `name-ar` 18/30 | Child names in lists and cards |
| `body` | body | 16/24, he 16/26 | `body-ar` 16/26 | Paragraphs, inputs, observation text, quotes |
| `body-strong` | body | 16/24, he 16/26 | `body-strong-ar` 16/26 | Buttons, emphasis, timeline titles, toasts |
| `label` | body | 14/20 | `label-ar` 14/22 | Chips, field labels, side-nav items, tabs and segments |
| `caption` | body | 13/18 | `caption-ar` 14/22 | Dates, ages, helper text, badges, bottom-bar labels |

- Use the display face only on titles, child-facing text, numeral blocks, avatar initials and the wordmark. Never in buttons, form fields, tables, chips, nav labels, or child names in lists: Baloo's tall box must never sit inside a 44px control.
- `caption` is the floor. Nothing is smaller than 13px, or 14px in Arabic.
- Headings are always `ink`, never tone-coloured.
- Links inside running text are always underlined (`text-decoration: underline; text-underline-offset: 3px`, the `.ks-link` class): `brand` is too close to `ink` and `ink-muted` to mark a link by colour alone. Standalone links with an icon or a button shape do not need it.

## Spacing and size

Spacing is a 4px base in eight steps: `space-1` (4), `space-2` (8), `space-3` (12), `space-4` (16), `space-5` (20), `space-6` (24), `space-8` (32), `space-12` (48).

- Pad cards with `space-4` on phone and `space-5` from md up. Gap cards with `space-3` in grids and `space-6` between sections.
- Use `space-4` as the phone page gutter and `space-8` from md up.
- Gap icons and labels inside buttons and chips with `space-2`.

| Target | Minimum |
|---|---|
| Teacher controls | 44px (primary actions 48px when any pointer is coarse, `@media (any-pointer: coarse)`) |
| List rows | 56px (ChildCard 72px) |
| Child targets | 64px, never below 56px |

## Shape

- `radius-sm` (8): chips, badges, section tiles, numeral and check blocks, small avatars.
- `radius-md` (14): buttons, inputs, tracks, nav items, alerts, toasts, the Observe block.
- `radius-lg` (20): cards, dialogs, feedback and picker tiles, picture blocks.
- `radius-xl` (28): kid ChoiceCards, KidButton, kid bubbles, the top corners of bottom sheets.
- `radius-round`: true circles only: the RoundButton, emoji pods, circle beads, the sheet grabber.

Chips and avatars are blocks, never pills or circles.

## Depth

Depth is a hard, unblurred **block lip** under anything you can press. It sinks when pressed, like a wooden block pushed into sand.

- `shadow-lip`: tappable cards, secondary and danger buttons, selected segments and tiles.
- `shadow-lip-lg`: card hover, kid ChoiceCards, the RoundButton, the plain KidButton.
- `shadow-lip-brand`: primary buttons, the brand KidButton and the centre Observe block. Pressed, they sink 2px onto `shadow-lip-brand-pressed`, a 1px lip.
- `shadow-sheet`: dialogs, bottom sheets, toasts and menus. This is the only blurred shadow.
- Static cards have no lip. Dim behind dialogs with a flat backdrop (`rgb(31 34 51 / 0.45)` light, `rgb(0 0 0 / 0.60)` dark), never blurred.

## Motion

Teacher screens are calm: 180ms or less, no overshoot, no idle or looping animation.

| Name | Applies to | Motion |
|---|---|---|
| placed | Entering cards, chips, toasts, a saved observation | translateY(6px) to 0 with a fade, 180ms, cubic-bezier(.2,.8,.2,1) |
| pressed | Buttons, tappable cards, chips | Sinks 2px and the lip shrinks, 90ms ease-out; release in 120ms |
| hover | Any control | Colour and lip change in 120ms; tappable cards rise to `shadow-lip-lg` |
| sheet | Bottom sheet, dialog | The sheet rises in 220ms; the dialog scales from .97 with a fade in 180ms |
| timeline string | The development timeline | Draws once per session in 360ms; beads never wait for it |

Present mode, for children only: `bounce-place` (240ms, about 4% overshoot) for tiles and bubbles appearing, `stamp` for stickers, one `wiggle` for a hint, one `nudge` for a suggestion, and the finish tower that stacks itself. No loops, no idle bobbing, no confetti.

Under `prefers-reduced-motion: reduce`, remove every translate, scale and rotate, including the press-sink. State changes become instant colour, border or lip changes, or fades of 120ms or less. The timeline string and the finish tower render already in place.

## States

| State | Treatment |
|---|---|
| Hover | Fill or lip change in 120ms: `tray` behind ghost and secondary controls, `brand-strong` on primary |
| Pressed | Sinks 2px (1px for chips and soft buttons, 3 to 4px for kid tiles) and loses its lip |
| Focus | 3px solid `ring` outline at a 2px offset (3px on kid tiles), so it lands on the ground, never on the control's own fill |
| Selected | A 2px `brand` (or tone-ink) border plus a Check glyph or check block: never colour alone |
| Disabled | Opacity 0.5 (0.4 on kid buttons), no lip, no press motion, `aria-disabled` |
| Loading | A spinner replaces the icon, the label stays, `aria-busy` |
| Invalid | 2px `danger` border and a `caption` message in `danger` with a CircleAlert glyph |

`ring` measures 6.19:1 or better on every ground and on `brand-soft` in both themes. Never remove an outline. The one exception is the toast: its fill is `ink`, so the focus ring on its buttons is `ground` (14.60:1 light, 16.13:1 dark).

## Right-to-left

- Set `lang` and `dir` on the document. Present mode follows the content language, not the UI language: put `lang` and `dir` on the stage root.
- Use logical properties only: `margin-inline`, `padding-inline`, `inset-inline-start`, `border-inline-end`, `border-start-start-radius`. Never left, right, ml, mr, pl, pr or physical radii.
- Give user content (names, chips, observation text, kid labels) `dir="auto"`.
- Mirror these icons under RTL with `scaleX(-1)`, never `rotate(180deg)`: `timeline`, `development`, `story`, `current-focus`, `note-quote`, `partly`, `did-not-work`, `arrow-next`. Never mirror the others: the star, heart, check, play triangle and lens are conventions, not directions.
- Mirror lucide back and forward chevrons and LogOut too. The ChevronDown of a select is never mirrored.
- Present-mode Next and Back take their direction from the content's `dir`.

## Iconography

KidSphere draws its own icons: 27 painted block glyphs plus the brand mark, made only from blocks, balls, roofs and arches on a 24px grid. Each has a 2px `ink` outline with round caps and joins, and exactly one primitive painted in its meaning paint. The paint slips 1.5 units downward (1.5px at 24px, none at 16px), like a hand-painted block. The full set, its construction and per-icon notes are in the Iconography section and the Icons asset group (`assets/Icons/README.md`).

- **Meaning icons** (`strengths`, `interests`, `what-helps`, `current-focus`, `attention`, `strength-builder`, `growth-support`) always carry their meaning paint. Content and play icons carry `paint-sky`. The three feedback towers share one `paint-sun` ball.
- **Nav icons** are outline-only in `ink-muted` when inactive, and get their `brand` paint when active. At 48px and up (empty states) they take `paint-sky`.
- **On a solid fill** (the primary button, the Observe block, a single-select chip) draw the icon in one colour, `on-brand`; on a paint fill, `on-paint`.
- **Sizes:** 16 in chips and badges, 20 in buttons, tiles and alerts, 24 in nav, 28 in the Observe block and content tiles, 40 in feedback and picker tiles, 48 to 96 in empty states and present mode.
- **Files:** `assets/Icons/<name>.svg` are baked with the light values (outline `#1F2233`, light paints, nav icons in their active state) because `<img>` cannot inherit colour, and `assets/Icons/dark/<name>.svg` with the dark values (outline `#F3EEE6`, dark paints). Place both and let the theme show one; never filter a light file to fake the dark theme. In the app, render them inline with `stroke: var(--ink)` and `fill: var(--paint-…)` so they follow the theme, and mark them `aria-hidden`: the word next to them is the label.
- **Utility glyphs** stay lucide at stroke 2 with round caps and joins: chevrons, X, Search, More, Pencil, Trash2, Check, Calendar, Mic, Menu, LogOut, RotateCcw, CircleAlert, Info, Languages and Loader2. Never use lucide for a concept the custom set covers.
- **Emoji** are content. They sit in a 24px `surface` pod on chips, and in a 64 to 88px pod on kid picture blocks. An emoji and a custom icon never share a slot.

## Layout

KidSphere is phone-first: teachers carry it around the room.

- **Below lg:** a 56px top bar (`ground`, a 1px `line` bottom edge, the brand mark and wordmark at the start, the language switch and avatar menu at the end) and a 64px bottom bar on `surface` with up to four items split around the raised Observe block. Overflow goes under More.
- **The Observe block** is a 56px `brand` block, not a circle, raised half out of the bar by a 4px `ground` ring and `shadow-lip-brand`, labelled "Observe" in `brand` underneath. It is the one thing a teacher reaches for all day.
- **From lg:** a 256px side nav on `ground` with a `line` inline-end edge: the brand, a full-width "Add observation" primary button, the nav list, and a footer with the user, the language switch and Sign out.
- **Main content** is at most 1152px wide, padded 16px on phone and 32px from md, with 128px at the bottom while the bottom bar is visible.
- **Grids:** child cards run one column on phone, two at md and three at xl.
- **Dialogs** are centred from md and become bottom sheets below md. Toasts sit centred above the bottom bar on phone and at the bottom inline-end from lg.
- **Present mode** is a full-screen `ground` stage padded `space-6` on phone and `space-12` on tablet, with content at most 960px wide.
- Show at most one decorative block cluster per screen.

## Accessibility

- Every text pair in the system holds 4.5:1 or better in both themes; the lowest is `on-paint` on `paint-berry` in light, at 4.56. Control borders, icons and the focus ring hold 3:1 or better.
- Meet the target sizes above in both themes and on every pointer type.
- Never use colour alone for meaning, selection or status: pair every tone with its icon and word, and every selection with a border and a check.
- Respect `prefers-reduced-motion` everywhere, as described under Motion.
- Use real semantics: `role="radiogroup"` for the support scale and feedback, `aria-pressed` for multi-select chips, `aria-current="page"` for nav, `role="status"` for toasts and kid bubbles, native `<dialog>` with focus return, and both `aria-label` and `title` on icon-only buttons.
- Set `lang` on every block of text, so the right face, line-height and screen-reader voice apply.

## Do and don't

| Do | Don't |
|---|---|
| Pair every tone with its icon and its word | Use colour alone for meaning, selection or status |
| Keep labels on tints in `ink` | Put tone-coloured text on tints (only `brand` on `brand-soft` is allowed) |
| Use attention (tangerine) for needs and sensitivities | Use red, or an X, for anything about a child |
| Keep the support scale and feedback neutral | Colour-code levels or outcomes like a traffic light |
| Keep paint inside outlined icons, picture blocks, stickers, the brand mark and empty-state scenes | Use paint as text, as a large background, or as a chip fill on teacher screens |
| Use one primary button per view, with Rubik inside every teacher button | Use the display face in buttons, forms, tables, chips or nav labels |
| Put option emoji in a `surface` pod | Use emoji in nav, headings, buttons, statuses, feedback or the finish screen |
| Use logical properties and `scaleX(-1)` for mirrored icons | Use physical margins, padding or radii, or `rotate(180deg)` to mirror |
| Give every control the 3px `ring` at a 2px offset | Remove outlines, or let the ring sit on the control's own fill |
| Keep avatars neutral: `tray` with `ink` initials, or a photo | Hash avatar colours from the meaning tints |
| Use one decorative block cluster per screen at most | Use gradients, glows, glassmorphism, backdrop blur, accent side borders, or Inter or Roboto |
| Keep motion short, once-only, and static under reduced motion | Use idle, looping or bouncing animation on teacher screens |
| Celebrate the child with a tower and a sticker | Show points, counts of stars, scores, percentages or progress bars |

The Sharnaqa logo (شرنقة / שרנקה): a smiling child wrapped in a lavender, cream and teal egg like a cocoon, with a butterfly above it, and the wordmark "Sharnaqa" in plum with a small teal leaf over the second "a". Five PNGs, cut from the original artwork (`design-system/sharnaqa-logo-source.jpg`, which also carries the Hebrew and Arabic names and the tagline "A Safe World to Grow.") by `design-system/make_logo.py` (Pillow, run on the server). The rules for using them (clear space, minimum sizes, misuse) are in the Logo section of the brand book (`README.md`).

## The files

| File | Pixels | What it is | Use it for |
|---|---|---|---|
| `sharnaqa-mark.png` | 470 × 470 | The egg and the butterfly on the artwork's cream, an opaque tile with rounded corners (22% radius), transparent outside them | The app icon and favicon source, small square slots, and the start of the inline lockup in the top bar and side nav |
| `sharnaqa-logo.png` | 639 × 657 | The full lockup: the mark centred above the wordmark, plum lettering | Light grounds: the sign-in page, covers, documents, print |
| `sharnaqa-logo-dark.png` | 639 × 657 | The same lockup with the lettering in chalk | Dark grounds: walnut `ground` and `surface` |
| `sharnaqa-wordmark.png` | 639 × 173 | The wordmark alone, with the leaf above and the "q" descender below, and a 6px transparent margin | Beside the mark in the inline lockup, on light grounds |
| `sharnaqa-wordmark-dark.png` | 639 × 173 | The wordmark with the lettering in chalk | Beside the mark in the inline lockup, on dark grounds |

The mark has no dark file: it is an opaque cream tile, so the same mark serves both themes. Only the wordmark changes.

These PNGs are the masters. The app does not ship them: the same script also writes compressed WebP copies (`quality=90`) of the mark (scaled to 288 × 288) and the two wordmarks, and only those three are in `frontend/src/assets/brand`, about 10 kB for the mark and 17–18 kB for each wordmark. The app builds the stacked lockup from the mark and a wordmark, so it has no copy of the two `sharnaqa-logo` files. The PDF reports use a 160px PNG of the mark, `backend/app/reports/static/sharnaqa-mark.png`.

## Inks

These are the artwork's own colours, sampled from the files. They are not tokens: never rebuild the logo from tokens, and never reuse these inks in the interface.

| Ink | About | Where |
|---|---|---|
| Plum | `#190B40` | The lettering in the light files; the wordmark the PDF reports set in text |
| Teal | `#559B9B`, easing to a pale mint | The leaf over the "a", in both versions |
| Egg | lavender into cream into teal | The cocoon around the child. Its soft blend belongs to the logo alone |
| Cream | `#F9F5EE` | The mark's tile, the artwork's own ground |
| Chalk | `#F3EEE6`, the dark-theme `ink` | The lettering in the two `-dark` files |

Plum holds well on birch `ground` but disappears on walnut `ground`, so the `-dark` files repaint it in chalk. The teal leaf is never changed.

## Light and dark

Place both inks and let the theme show one, as with the icons: never filter, invert or tint a light file to fake the dark one. In the app, `Logo` (`frontend/src/components/brand/Logo.tsx`) places both wordmark files and `.ks-logo-light` / `.ks-logo-dark` in `index.css` show one, by the same rule as the tokens: `prefers-color-scheme`, unless `<html data-theme>` overrides it. The wordmark images load lazily, so the browser never fetches the ink the theme hides (`display: none`). The mark is the same image in both themes, and it carries the alt text "Sharnaqa" once; the wordmark images are decorative (`alt=""`, `aria-hidden`).

## App icons

The favicon and the installed-app icons are the mark alone, resized by the same script, in `frontend/public`: `favicon.ico` (16, 32 and 48), `icons/icon-32.png`, `icon-192.png` and `icon-512.png` (the rounded tile, transparent in the corners), and `icons/apple-touch-icon.png` (180, the square tile with no rounding, because iOS rounds it and fills transparency with black). `index.html` links the ico, the 32 and 192 PNGs and the touch icon; `site.webmanifest` lists the 192 and 512 icons.

The KidSphere logo: a round globe with a child reaching up for an orange star, and the "KidSphere" wordmark, navy "Kid" and teal "Sphere". Five transparent PNGs, cut from the original artwork (`design-system/logo-source.png`) by `design-system/make_logo.py` (Pillow). The rules for using them (clear space, minimum sizes, misuse) are in the Logo section of the brand book (`README.md`).

## The files

| File | Pixels | What it is | Use it for |
|---|---|---|---|
| `kidsphere-mark.png` | 322 × 322 | The round mark alone: opaque inside the circle, transparent outside | The app icon and favicon source, small square slots, and the start of the inline lockup in the top bar and side nav |
| `kidsphere-logo.png` | 527 × 473 | The full lockup as drawn: the mark above the wordmark, navy "Kid" | Light grounds: the sign-in page, covers, documents, print |
| `kidsphere-logo-dark.png` | 527 × 473 | The same lockup with "Kid" in chalk | Dark grounds: walnut `ground` and `surface` |
| `kidsphere-wordmark.png` | 527 × 131 | The wordmark alone, navy "Kid" and teal "Sphere", with a 6px transparent margin | Beside the mark in the inline lockup, on light grounds |
| `kidsphere-wordmark-dark.png` | 527 × 131 | The wordmark with "Kid" in chalk | Beside the mark in the inline lockup, on dark grounds |

The mark has no dark file: its white sea makes it a light disc that holds on the walnut ground as well as on birch, so the same mark serves both themes. Only the wordmark changes.

These PNGs are the masters. The app does not ship them: the same script also writes compressed WebP copies of the mark and the two wordmarks (`quality=90`, same pixel sizes), and only those three are in `frontend/src/assets/brand`, about 14 kB for the mark and 33 kB for each wordmark against 110 kB and 62–71 kB here. The app builds the stacked lockup from the mark and a wordmark, so it has no copy of the two `kidsphere-logo` files.

## Inks

These are the artwork's own colours, sampled from the files. They are not tokens: never rebuild the logo from tokens, and never reuse these inks in the interface.

| Ink | About | Where |
|---|---|---|
| Navy | `#003769` (lettering), `#124478` (child) | "Kid" in the light files; the child's silhouette in every file |
| Teal | `#009B9F` | "Sphere", in both versions |
| Globe | sky blue easing into sea green, on a white sea | The continents. This soft blend is the one gradient in the system, and it belongs to the logo alone |
| Orange | `#FAA242` | The star the child reaches for |
| Chalk | `#F3EEE6`, the dark-theme `ink` | "Kid" in the two `-dark` files |

Navy "Kid" holds about 11:1 on birch `ground`, but only 1.6:1 on walnut `ground`, so the `-dark` files repaint it in chalk (about 16:1). Teal "Sphere" reads on both, at about 3.1:1 on birch and 5.5:1 on walnut, and is never changed.

## Light and dark

Place both inks and let the theme show one, as with the icons: never filter, invert or tint a light file to fake the dark one. In the app, `Logo` (`frontend/src/components/brand/Logo.tsx`) places both wordmark files and `.ks-logo-light` / `.ks-logo-dark` in `index.css` show one, by the same rule as the tokens: `prefers-color-scheme`, unless `<html data-theme>` overrides it. The wordmark images load lazily, so the browser never fetches the ink the theme hides (`display: none`). The mark is the same image in both themes, and it carries the alt text "KidSphere" once; the wordmark images are decorative (`alt=""`, `aria-hidden`).

## App icons

The favicon and the installed-app icons are the mark alone, resized by the same script, in `frontend/public`: `favicon.ico` (16, 32 and 48), `icons/icon-32.png`, `icon-192.png` and `icon-512.png` (transparent outside the circle), and `icons/apple-touch-icon.png` (180, the mark on a white tile, because iOS fills transparency with black). `index.html` links the ico, the 32 and 192 PNGs and the touch icon; `site.webmanifest` lists the 192 and 512 icons. There are no separate 16 and 48px PNGs: `favicon.ico` already holds those sizes, so the script no longer writes them.

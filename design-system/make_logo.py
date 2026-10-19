"""Cut the Sharnaqa logo out of the artwork (design-system/sharnaqa-logo-source.jpg, 850 x 810)
and produce the masters, the app's compressed copies and the app icons.
Run with Pillow on the server: argv[1] = source jpg, argv[2] = out dir.

The artwork is one fixed drawing on a warm cream ground, so the regions are fixed boxes
(measured on a 50px grid), not detected:
- the mark: the egg wrapping the child, with the butterfly, as an opaque rounded tile;
- the wordmark: "Sharnaqa" in plum with the teal leaf over the a, cream turned to alpha.
The Hebrew and Arabic names and the tagline under the wordmark stay in the source only.

Where the outputs go:
- the five sharnaqa-*.png files are the masters: design-system/project/assets/Logos;
- the three sharnaqa-{mark,wordmark,wordmark-dark}.webp files are the compressed copies
  the app ships: frontend/src/assets/brand (components/brand/Logo.tsx);
- sharnaqa-mark-report.png goes to backend/app/reports/static (the PDF header);
- favicon.ico goes to frontend/public, and icon-32/192/512.png and
  apple-touch-icon.png to frontend/public/icons."""
import os
import sys

from PIL import Image, ImageDraw

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
im = Image.open(src).convert("RGB")
BG = (249, 245, 238)  # the cream ground, sampled at the corners

# 1. Mark: the egg and the butterfly. The tops of "S" and "h" reach into the bottom-left
# corner of the box, so that corner is painted back to the ground first.
MARK_BOX = (220, 33, 690, 503)
art = im.copy()
ImageDraw.Draw(art).rectangle((0, 482, 262, 810), fill=BG)
side = MARK_BOX[2] - MARK_BOX[0]


def rounded_mask(size, radius, scale=4):
    big = Image.new("L", (size * scale, size * scale), 0)
    ImageDraw.Draw(big).rounded_rectangle((0, 0, size * scale - 1, size * scale - 1), radius * scale, fill=255)
    return big.resize((size, size), Image.LANCZOS)


mark = art.crop(MARK_BOX).convert("RGBA")
mark.putalpha(rounded_mask(side, round(side * 0.22)))
mark.save(f"{out}/sharnaqa-mark.png")
print("mark size", mark.size)


# 2. Wordmark. The ground around the letters is not flat (the egg's warm glow), so alpha comes
# from darkness, not from the distance to one cream: the lettering is one plum ink, anti-aliased
# against something lighter than LIGHT.
PLUM = (25, 11, 64)  # the median of the lettering's dark pixels
LIGHT = 228


def lum(p):
    return (p[0] * 299 + p[1] * 587 + p[2] * 114) / 1000


def ink_to_alpha(img):
    data = []
    for p in pixels(img):
        if p[1] > p[0] + 30:
            # The leaf runs from teal to a pale mint, so it keeps its own colours: opaque inside,
            # un-mixed from the cream only along its anti-aliased edge.
            a = min(1.0, max(abs(c - b) for c, b in zip(p, BG)) / 60)
            data.append(tuple(max(0, min(255, round(b + (c - b) / a))) for c, b in zip(p, BG)) + (round(a * 255),))
            continue
        a = (LIGHT - lum(p)) / (LIGHT - lum(PLUM))
        data.append(PLUM + (round(max(0.0, min(1.0, a)) * 255),) if a > 0.04 else (0, 0, 0, 0))
    o = Image.new("RGBA", img.size)
    o.putdata(data)
    return o


def pixels(img):
    return img.get_flattened_data() if hasattr(img, "get_flattened_data") else img.getdata()


WORD_BOX = (120, 486, 762, 652)
word_src = im.copy()
d = ImageDraw.Draw(word_src)
# Above the letters' x-height, between the "h" and the leaf, there is only the egg's foot;
# under the baseline, left of the "q" descender, the dots of the Arabic name begin.
d.rectangle((256, 486, 578, 531), fill=BG)
d.rectangle((120, 641, 630, 652), fill=BG)
word = ink_to_alpha(word_src.crop(WORD_BOX))
word = word.crop(word.getbbox())
pad = 6
framed = Image.new("RGBA", (word.width + 2 * pad, word.height + 2 * pad), (0, 0, 0, 0))
framed.alpha_composite(word, (pad, pad))
word = framed
word.save(f"{out}/sharnaqa-wordmark.png")
print("wordmark size", word.size)

# 3. Dark-ground wordmark: plum lettering -> chalk (plum is 1.1:1 on walnut), the teal leaf kept.
CHALK = (243, 238, 230)


def darkify(img):
    px = []
    for (r, g, b, a) in pixels(img):
        px.append((CHALK + (a,)) if (r, g, b) == PLUM else (r, g, b, a))
    o = Image.new("RGBA", img.size)
    o.putdata(px)
    return o


word_dark = darkify(word)
word_dark.save(f"{out}/sharnaqa-wordmark-dark.png")

# 4. Stacked lockups: the mark centred above the wordmark, as in the artwork.
gap = 14
for name, w in (("sharnaqa-logo", word), ("sharnaqa-logo-dark", word_dark)):
    width = max(mark.width, w.width)
    lock = Image.new("RGBA", (width, mark.height + gap + w.height), (0, 0, 0, 0))
    lock.alpha_composite(mark, ((width - mark.width) // 2, 0))
    lock.alpha_composite(w, ((width - w.width) // 2, mark.height + gap))
    lock.save(f"{out}/{name}.png")
    print(name, lock.size)

# 5. Compressed copies for the app (the bars show the mark at 36-40px, the sign-in page at 72).
for n, a in (("sharnaqa-mark", mark.resize((288, 288), Image.LANCZOS)), ("sharnaqa-wordmark", word),
             ("sharnaqa-wordmark-dark", word_dark)):
    a.save(f"{out}/{n}.webp", "WEBP", quality=90, method=6)
mark.resize((160, 160), Image.LANCZOS).save(f"{out}/sharnaqa-mark-report.png", optimize=True)

# 6. App icons from the mark (the tile is opaque, so no white backing is needed).
for s in (32, 192, 512):
    mark.resize((s, s), Image.LANCZOS).save(f"{out}/icon-{s}.png", optimize=True)
t = Image.new("RGB", (180, 180), BG)  # iOS: square and opaque, it rounds the corners itself
t.paste(art.crop(MARK_BOX).resize((180, 180), Image.LANCZOS))
t.save(f"{out}/apple-touch-icon.png", optimize=True)
mark.resize((48, 48), Image.LANCZOS).save(f"{out}/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

# 7. Preview on birch and walnut grounds.
lock = Image.open(f"{out}/sharnaqa-logo.png")
lock_dark = Image.open(f"{out}/sharnaqa-logo-dark.png")
prev = Image.new("RGBA", (lock.width * 2 + 60, lock.height + 40), (251, 246, 236, 255))
prev.alpha_composite(Image.new("RGBA", (lock.width + 30, lock.height + 40), (22, 18, 14, 255)), (lock.width + 30, 0))
prev.alpha_composite(lock, (20, 20))
prev.alpha_composite(lock_dark, (lock.width + 40, 20))
prev.save(f"{out}/preview.png")
print("done")

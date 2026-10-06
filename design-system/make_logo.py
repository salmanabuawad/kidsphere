"""Cut the KidSphere logo out of the concept image (drop the "2. LITTLE EXPLORER"
caption) and produce transparent PNGs: the round mark, the wordmark, the full
lockup, and app icons. Run with Pillow; argv[1] = source png, argv[2] = out dir.

Where the outputs go:
- the five kidsphere-*.png files are the masters: design-system/project/assets/Logos;
- the three kidsphere-{mark,wordmark,wordmark-dark}.webp files are the compressed
  copies the app ships: frontend/src/assets/brand (components/brand/Logo.tsx);
- favicon.ico goes to frontend/public, and icon-32/192/512.png and
  apple-touch-icon.png to frontend/public/icons."""
import os
import sys

from PIL import Image, ImageChops, ImageDraw

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
im = Image.open(src).convert("RGB")
W, H = im.size


def inked(px, thr=40):
    r, g, b = px
    return (255 - min(r, g, b)) > thr  # anything clearly not white


# Row profile: which rows contain ink.
rows = [any(inked(im.getpixel((x, y))) for x in range(0, W, 2)) for y in range(H)]
bands, start = [], None
for y, on in enumerate(rows + [False]):
    if on and start is None:
        start = y
    if not on and start is not None:
        bands.append((start, y - 1))
        start = None
# Merge bands separated by small gaps (letters, the star).
merged = []
for b in bands:
    if merged and b[0] - merged[-1][1] <= 12:
        merged[-1] = (merged[-1][0], b[1])
    else:
        merged.append(b)
print("ink bands:", merged)
# Expect: caption (small), globe (big), wordmark.
big = sorted(merged, key=lambda b: b[1] - b[0], reverse=True)
globe_band = big[0]
word_band = [b for b in merged if b[0] > globe_band[1]][0]
caption = [b for b in merged if b[1] < globe_band[0]]
print("caption:", caption, "globe:", globe_band, "word:", word_band)


def col_extent(y0, y1, thr=40):
    xs = [x for x in range(W) for y in range(y0, y1 + 1, 2) if inked(im.getpixel((x, y)), thr)]
    return min(xs), max(xs)


gx0, gx1 = col_extent(*globe_band)
gy0, gy1 = globe_band
cx, cy = (gx0 + gx1) / 2, (gy0 + gy1) / 2
r = max(gx1 - gx0, gy1 - gy0) / 2 - 2.5  # inside the source's light anti-aliased rim
print("globe bbox", (gx0, gy0, gx1, gy1), "center", (cx, cy), "r", r)
wx0, wx1 = col_extent(*word_band)
print("word bbox", (wx0, word_band[0], wx1, word_band[1]))


def white_to_alpha(img):
    """GIMP-style colour-to-alpha against white."""
    img = img.convert("RGB")
    data = []
    for (rr, gg, bb) in (img.get_flattened_data() if hasattr(img, "get_flattened_data") else img.getdata()):
        a = 255 - min(rr, gg, bb)
        if a < 10:
            data.append((255, 255, 255, 0))
            continue
        f = 255.0 / a
        data.append((
            max(0, min(255, round(255 - (255 - rr) * f))),
            max(0, min(255, round(255 - (255 - gg) * f))),
            max(0, min(255, round(255 - (255 - bb) * f))),
            a,
        ))
    o = Image.new("RGBA", img.size)
    o.putdata(data)
    return o


def circle_mask(size, scale=4):
    big = Image.new("L", (size * scale, size * scale), 0)
    ImageDraw.Draw(big).ellipse((0, 0, size * scale - 1, size * scale - 1), fill=255)
    return big.resize((size, size), Image.LANCZOS)


# 1. Round mark (opaque inside the circle, transparent outside).
d = int(round(2 * r))
box = (int(round(cx - r)), int(round(cy - r)), int(round(cx - r)) + d, int(round(cy - r)) + d)
mark = im.crop(box).convert("RGBA")
mark.putalpha(circle_mask(d))
mark.save(f"{out}/kidsphere-mark.png")
print("mark size", mark.size)

# 2. Wordmark (white -> alpha).
pad = 6
wbox = (max(0, wx0 - pad), word_band[0] - pad, min(W, wx1 + pad), word_band[1] + pad)
word = white_to_alpha(im.crop(wbox))
word.save(f"{out}/kidsphere-wordmark.png")
print("wordmark size", word.size)

# 3. Full lockup: mark above wordmark, layout as in the source, no caption.
top = box[1]
lx0, lx1 = min(box[0], wbox[0]), max(box[2], wbox[2])
lock = Image.new("RGBA", (lx1 - lx0, wbox[3] - top), (0, 0, 0, 0))
lock.alpha_composite(mark, (box[0] - lx0, 0))
lock.alpha_composite(word, (wbox[0] - lx0, wbox[1] - top))
lock.save(f"{out}/kidsphere-logo.png")
print("lockup size", lock.size)

# 4. App icons from the mark.
# Only the sizes the app links (index.html, site.webmanifest); favicon.ico holds 16, 32 and 48.
for s in (32, 192, 512):
    m = mark.resize((s, s), Image.LANCZOS)
    m.save(f"{out}/icon-{s}.png")
# apple-touch-icon: mark on a white rounded tile (iOS ignores transparency).
t = Image.new("RGBA", (180, 180), (255, 255, 255, 255))
inner = mark.resize((156, 156), Image.LANCZOS)
t.alpha_composite(inner, (12, 12))
t.convert("RGB").save(f"{out}/apple-touch-icon.png")
# favicon.ico with 16/32/48.
mark.resize((48, 48), Image.LANCZOS).save(f"{out}/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
# Preview on dark ground to judge contrast.
prev = Image.new("RGBA", (lock.width + 40, lock.height * 2 + 60), (250, 246, 238, 255))
prev.alpha_composite(lock, (20, 20))
dark = Image.new("RGBA", (lock.width + 40, lock.height + 20), (33, 29, 26, 255))
prev.alpha_composite(dark, (0, lock.height + 40))
prev.alpha_composite(lock, (20, lock.height + 50))
prev.save(f"{out}/preview.png")
print("done")


# 5. Dark-theme variants: navy "Kid" -> chalk, teal "Sphere" kept.
CHALK = (243, 238, 230)


def darkify(img):
    px = []
    for (rr, gg, bb, a) in (img.get_flattened_data() if hasattr(img, "get_flattened_data") else img.getdata()):
        if a and gg < 120 and bb > gg:  # navy ink (teal has a high green channel)
            px.append(CHALK + (a,))
        else:
            px.append((rr, gg, bb, a))
    o = Image.new("RGBA", img.size)
    o.putdata(px)
    return o


word_dark = darkify(word)
word_dark.save(f"{out}/kidsphere-wordmark-dark.png")
# Compressed copies for the app (the PNGs stay the masters): the bars show the mark at
# 36-40px and the wordmark 22-24px tall, so the source-size RGBA PNGs are far heavier than needed.
for n, art in (("kidsphere-mark", mark), ("kidsphere-wordmark", word), ("kidsphere-wordmark-dark", word_dark)):
    art.save(f"{out}/{n}.webp", "WEBP", quality=90, method=6)
lock_dark = Image.new("RGBA", lock.size, (0, 0, 0, 0))
lock_dark.alpha_composite(mark, (box[0] - lx0, 0))
lock_dark.alpha_composite(word_dark, (wbox[0] - lx0, wbox[1] - top))
lock_dark.save(f"{out}/kidsphere-logo-dark.png")
prev2 = Image.new("RGBA", (lock.width * 2 + 60, lock.height + 40), (250, 246, 238, 255))
prev2.alpha_composite(lock, (20, 20))
dk = Image.new("RGBA", (lock.width + 30, lock.height + 40), (33, 29, 26, 255))
prev2.alpha_composite(dk, (lock.width + 30, 0))
prev2.alpha_composite(lock_dark, (lock.width + 40, 20))
prev2.save(f"{out}/preview.png")
print("dark variants done")

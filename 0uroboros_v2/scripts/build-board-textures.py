"""Original deterministic surface maps. No reference image pixels are used.

Roughness/height are packed into G/B; R provides subtle albedo variation.
Run with Python + Pillow + NumPy. The seed keeps material revisions reviewable.
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parents[1] / 'assets' / 'materials'
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(3101)
size = 1024
y, x = np.mgrid[0:size, 0:size]

# Machined titanium: long grain, tiny pits, sparse shallow tooling scratches.
grain = rng.normal(0, 1, (size, 1)) * 2.3 + rng.normal(0, 1, (size, size)) * 1.7
grain += np.sin(y * .56) * .9
wear = Image.new('L', (size, size), 0)
draw = ImageDraw.Draw(wear)
for _ in range(115):
    sx, sy = rng.integers(0, size, 2)
    length = int(rng.integers(9, 135))
    draw.line((int(sx), int(sy), int(sx + length), int(sy + rng.integers(-1, 2))), fill=int(rng.integers(12, 40)), width=1)
scratch = np.asarray(wear.filter(ImageFilter.GaussianBlur(.4)))
packed = np.stack((185 + grain - scratch * .2, 185 + grain * 2 + scratch, 128 + grain + scratch * .45), axis=-1)
Image.fromarray(np.uint8(np.clip(packed, 0, 255))).save(OUT / 'titanium-surface.png', optimize=True)

# Floor composite: gently mottled mineral resin, with no high-frequency grid.
cloud = Image.fromarray(np.uint8(rng.uniform(70, 170, (32, 32)))).resize((size, size), Image.Resampling.BICUBIC)
cloud = np.asarray(cloud).astype(float)
fine = rng.normal(0, 2.4, (size, size))
resin = np.stack((168 + (cloud - 128) * .45 + fine, 224 + fine, 128 + (cloud - 128) * .18 + fine), axis=-1)
Image.fromarray(np.uint8(np.clip(resin, 0, 255))).save(OUT / 'resin-surface.png', optimize=True)

# Field glass engraving: architectural routing and an understated orbital seal.
# Alpha is physical etching strength, not a full luminous overlay.
etch = Image.new('RGBA', (768, 1024), (0, 0, 0, 0))
d = ImageDraw.Draw(etch)
ink = (125, 115, 145, 104)
faint = (116, 104, 131, 68)
for inset in (19, 28):
    d.rounded_rectangle((inset, inset, 767-inset, 1023-inset), radius=22, outline=ink, width=5)
for side in (-1, 1):
    for i in range(7):
        xx = 384 + side * (220 + i * 12)
        y0 = 120 + i * 17
        d.line([(xx, 50), (xx, y0), (xx-side*32, y0+32), (xx-side*32, 410-i*14)], fill=faint, width=5)
        d.line([(xx, 974), (xx, 1024-y0), (xx-side*32, 992-y0), (xx-side*32, 614+i*14)], fill=faint, width=5)
for radius in (138, 152, 170):
    d.arc((384-radius, 512-radius, 384+radius, 512+radius), 18, 160, fill=faint, width=5)
    d.arc((384-radius, 512-radius, 384+radius, 512+radius), 198, 340, fill=faint, width=5)
for i in range(48):
    a = i * np.pi / 24
    r = 178
    d.line((384+np.cos(a)*r, 512+np.sin(a)*r, 384+np.cos(a)*(r+5), 512+np.sin(a)*(r+5)), fill=faint, width=3)
for yy in (68, 944):
    for xx in (55, 617):
        for j in range(9):
            d.rectangle((xx+j*9, yy, xx+j*9+3, yy+8+(j%3)*3), fill=ink)
etch.save(OUT / 'field-engraving.png', optimize=True)
print('Wrote three original surface maps to', OUT)

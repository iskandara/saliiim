"""Build the web versions of the Saliiim logo from design/saliiim-logo-source.webp.
Run `python3 scripts/make-logo.py` (needs Pillow). Writes public/brand/."""
import sys
from PIL import Image

src = sys.argv[1] if len(sys.argv) > 1 else "design/saliiim-logo-source.webp"
out = sys.argv[2] if len(sys.argv) > 2 else "public/brand"
im = Image.open(src)
if im.mode == 'RGBA':
    # The file already has transparency: keep it as is.
    rgba = im
else:
    im = im.convert('RGB')
    w, h = im.size
    px = im.load()
    rgba = Image.new('RGBA', (w, h))
    dst = rgba.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            # Colour-to-alpha against white: the least alpha that explains the pixel over a white page.
            a = max((255 - r), (255 - g), (255 - b)) / 255
            if a < 0.08:
                dst[x, y] = (0, 0, 0, 0)
                continue
            c = [round((v - (1 - a) * 255) / a) for v in (r, g, b)]
            dst[x, y] = (*[max(0, min(255, v)) for v in c], round(a * 255))
bbox = rgba.getbbox()
logo = rgba.crop(bbox)
pad = 8
canvas = Image.new('RGBA', (logo.width + 2 * pad, logo.height + 2 * pad), (0, 0, 0, 0))
canvas.paste(logo, (pad, pad))
logo = canvas

# Header version: the deep green letters turn cream; lime ball, swoosh and sparks keep their colour.
rev = logo.copy()
p = rev.load()
for y in range(rev.height):
    for x in range(rev.width):
        r, g, b, a = p[x, y]
        if not a:
            continue
        if r < 110:
            p[x, y] = (253, 253, 248, a)
        elif r > 200 and g > 200 and b > 170 and y > rev.height * 0.42:
            # The cream court line becomes a cut-out, so the green header shows through it.
            p[x, y] = (0, 0, 0, 0)

for name, img in (('logo', logo), ('logo-reverse', rev)):
    for width in (360, 720):
        small = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
        small.save(f'{out}/{name}-{width}.webp', 'WEBP', quality=90, method=6)
    img.resize((720, round(img.height * 720 / img.width)), Image.LANCZOS).save(f'{out}/{name}-720.png', optimize=True)
print('size', logo.size)

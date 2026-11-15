"""Pixel-art tennis ball on clay: the app icon. Run `python3 scripts/make-icons.py` to rebuild public/ icons."""
import math, sys
from PIL import Image

CLAY, CLAY_DARK, GROUT = (122, 45, 27), (108, 38, 22), (171, 98, 74)
SHADOW = (82, 28, 15)
OUTLINE = (44, 70, 14)
LIME, LIME_DARK, LIME_LIGHT = (215, 241, 59), (166, 196, 36), (240, 252, 160)
SEAM = (253, 253, 248)

def grid(n):
    s = n / 32  # scale everything from the 32px design
    cx = cy = n / 2 - 0.5
    r = 11.2 * s
    px = [[None] * n for _ in range(n)]
    for y in range(n):
        for x in range(n):
            # Clay tiles: grout on a 16px (or 8px) rhythm, a darker tile in a checker pattern.
            tile = max(4, n // 2)
            c = CLAY_DARK if ((x // tile) + (y // tile)) % 2 else CLAY
            if x % tile == 0 or y % tile == 0:
                c = GROUT
            # Cast shadow down-right of the ball.
            if math.hypot(x - cx - 2 * s, y - cy - 2.2 * s) <= r:
                c = SHADOW
            d = math.hypot(x - cx, y - cy)
            if d <= r:
                c = LIME
                if (x - cx) + (y - cy) > r * 0.55:
                    c = LIME_DARK
                if math.hypot(x - cx + r * 0.42, y - cy + r * 0.42) < r * 0.28:
                    c = LIME_LIGHT
                # Two seams: arcs of circles centred just outside the ball, left and right.
                for side in (-1, 1):
                    sx = cx + side * r * 1.18
                    if abs(math.hypot(x - sx, y - cy) - r * 0.86) < (0.9 * s if n >= 32 else 0.5):
                        c = SEAM
                if d > r - max(1.0, 1.15 * s):
                    c = OUTLINE
            px[y][x] = c
    return px

def image(px, size):
    n = len(px)
    im = Image.new('RGB', (n, n))
    for y in range(n):
        for x in range(n):
            im.putpixel((x, y), px[y][x])
    return im.resize((size, size), Image.NEAREST)

def svg(px):
    n = len(px)
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {n} {n}" shape-rendering="crispEdges">']
    for y in range(n):
        x = 0
        while x < n:
            c = px[y][x]; run = 1
            while x + run < n and px[y][x + run] == c:
                run += 1
            out.append(f'<rect x="{x}" y="{y}" width="{run}" height="1" fill="#{c[0]:02x}{c[1]:02x}{c[2]:02x}"/>')
            x += run
    out.append('</svg>')
    return ''.join(out)

# Hand-drawn 12x12 ball for the 16px favicon: generated circles break up at this size.
SPRITE = [
    '....oooo....',
    '..ooLLLLoo..',
    '.oWLHHLLLWo.',
    '.oLWLLLLWLo.',
    'oLLWLLLLWLDo',
    'oLLLWLLWLLDo',
    'oLLLWLLWLDDo',
    'oLLWLLLLWDDo',
    '.oLWLLLLWDo.',
    '.oWLLLLDDWo.',
    '..ooDDDDoo..',
    '....oooo....',
]
KEY = {'o': OUTLINE, 'L': LIME, 'D': LIME_DARK, 'H': LIME_LIGHT, 'W': SEAM}

def small_grid():
    n = 16
    px = [[CLAY_DARK if ((x // 8) + (y // 8)) % 2 else CLAY for x in range(n)] for y in range(n)]
    for y in range(n):
        for x in range(n):
            if x % 8 == 0 or y % 8 == 0:
                px[y][x] = GROUT
    for r, row in enumerate(SPRITE):
        for c, ch in enumerate(row):
            if ch != '.' and r + 3 < n and c + 3 < n:
                px[r + 3][c + 3] = SHADOW
    for r, row in enumerate(SPRITE):
        for c, ch in enumerate(row):
            if ch != '.':
                px[r + 2][c + 2] = KEY[ch]
    return px

out = sys.argv[1] if len(sys.argv) > 1 else "public"
big, small = grid(32), small_grid()
for size in (192, 512):
    image(big, size).save(f'{out}/icon-{size}.png')
image(big, 512).save(f'{out}/icon-maskable-512.png')
image(big, 180).save(f'{out}/apple-touch-icon.png')
image(small, 32).save(f'{out}/favicon-32.png')
image(small, 16).save(f'{out}/favicon.ico', sizes=[(16, 16), (32, 32)])
open(f'{out}/favicon.svg', 'w').write(svg(small))

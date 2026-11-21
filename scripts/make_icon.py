"""The app icon: 32x32 pixel art, scaled with hard pixels (owner approved 2026-11-20).

Run from apps/mobile: uv run --no-project --with pillow python scripts/make_icon.py assets
Writes assets/icon.png (1024x1024, iOS) and assets/adaptive-icon.png (the art at 640x640 in the
middle of a 1024x1024 canvas of the background colour, without the dithered floor: Android crops the outer third).
"""

import sys

from PIL import Image

N = 32
BG, BG2 = (27, 16, 53), (44, 26, 82)
OUT = (13, 7, 24)
BONE, SHADE = (244, 240, 216), (188, 178, 150)
CAP, CAP_DARK = (255, 61, 127), (176, 30, 92)
GOLD, TEAL = (255, 210, 63), (45, 226, 200)

px = [[None] * N for _ in range(N)]


def put(x: int, y: int, colour: tuple[int, int, int]) -> None:
    if 0 <= x < N and 0 <= y < N:
        px[y][x] = colour


# Skull: a round cranium and a narrower jaw.
for y in range(9, 24):
    for x in range(N):
        if ((x - 15.5) / 9.2) ** 2 + ((y - 16.5) / 7.6) ** 2 <= 1:
            put(x, y, BONE if x < 21 else SHADE)
for y in range(23, 28):
    for x in range(11, 21):
        put(x, y, BONE if x < 19 else SHADE)
# Eyes with a glowing pupil, nose, teeth.
for ex in (10, 18):
    for y in range(16, 20):
        for x in range(ex, ex + 4):
            put(x, y, OUT)
    put(ex + 1, 17, TEAL)
    put(ex + 2, 17, TEAL)
    put(ex + 1, 18, TEAL)
for x, y in ((15, 21), (16, 21), (15, 22), (16, 22)):
    put(x, y, OUT)
for x in (13, 15, 17):
    for y in (25, 26, 27):
        put(x, y, OUT)

# Graduation cap: a band on the head, a flat board over it, a tassel.
for y in range(8, 12):
    for x in range(9, 23):
        put(x, y, CAP_DARK)
for i, half in enumerate((4, 9, 13, 9, 4)):
    y = 4 + i
    for x in range(16 - half, 16 + half):
        put(x, y, CAP if i < 3 else CAP_DARK)
put(15, 6, GOLD)
put(16, 6, GOLD)
for x in range(17, 27):
    put(x, 6, GOLD)
for y in range(7, 14):
    put(26, y, GOLD)
for y in range(14, 17):
    put(25, y, GOLD)
    put(26, y, GOLD)
    put(27, y, GOLD)

# A dark outline around everything drawn, then the dithered background.
drawn = [[cell is not None for cell in row] for row in px]
for y in range(N):
    for x in range(N):
        if drawn[y][x]:
            continue
        near = any(
            0 <= x + dx < N and 0 <= y + dy < N and drawn[y + dy][x + dx]
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
        )
        if near:
            px[y][x] = OUT
        else:
            px[y][x] = BG2 if (y > 17 and (x + y) % 2 == 0) or y > 26 else BG

image = Image.new("RGB", (N, N))
image.putdata([cell for row in px for cell in row])
out = sys.argv[1]
image.resize((1024, 1024), Image.NEAREST).save(f"{out}/icon.png")
adaptive = Image.new("RGB", (1024, 1024), BG)
plain = Image.new("RGB", (N, N))  # no dithered floor: it would end at a visible edge
plain.putdata([BG if cell == BG2 else cell for row in px for cell in row])
adaptive.paste(plain.resize((640, 640), Image.NEAREST), (192, 192))
adaptive.save(f"{out}/adaptive-icon.png")

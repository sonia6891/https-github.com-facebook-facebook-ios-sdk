from pathlib import Path
from PIL import Image, ImageDraw

SRC = Path("app-icon-v115-512.png")
OUT_SIZES = (180, 192, 512)
RADIUS_RATIO = 0.12

img = Image.open(SRC).convert("RGB")
w, h = img.size
if (w, h) != (512, 512):
    raise SystemExit(f"unexpected source size: {(w,h)}")

# Preserve the original cat and composition exactly. Only replace the white
# outer corners with a full-bleed background that matches the source scene.
top = img.getpixel((w // 2, 4))
bottom = img.getpixel((w // 2, h - 4))

bg = Image.new("RGB", (w, h))
px = bg.load()
for y in range(h):
    t = y / (h - 1)
    c = tuple(round(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
    for x in range(w):
        px[x, y] = c

mask = Image.new("L", (w, h), 0)
draw = ImageDraw.Draw(mask)
radius = round(w * RADIUS_RATIO)
draw.rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=255)

full_bleed = Image.composite(img, bg, mask)

for size in OUT_SIZES:
    out = full_bleed.resize((size, size), Image.Resampling.LANCZOS)
    out.save(f"app-icon-v155-{size}.png", format="PNG", optimize=True)

print("Generated v155 full-bleed icons while preserving the original cat.")

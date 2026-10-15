"""Draw the wall Town Map (32x16, 2 tiles wide). Same 1px #404040 outline + flat shading as draw-objects.py."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent.parent / "public" / "assets" / "objects" / "townmap.png"
OUTLINE = (0x40, 0x40, 0x40, 255)
WOOD = (0xb8, 0x80, 0x50, 255)
WOOD_HI = (0xd8, 0xa8, 0x70, 255)
WOOD_DK = (0x80, 0x48, 0x28, 255)
LAND = (0xd4, 0xe4, 0xa4, 255)
LAND_DK = (0xb4, 0xc9, 0x8a, 255)
WATER = (0x9c, 0xc8, 0xe0, 255)
WHITE = (0xf8, 0xf8, 0xf8, 255)
TECH = (0x2c, 0x3f, 0x9c, 255)
FOOD = (0xee, 0x7a, 0x2c, 255)
TRADE = (0xd8, 0x9a, 0x10, 255)
PIANO = (0x8a, 0x52, 0xc8, 255)
PIN = (0xe0, 0x30, 0x30, 255)
SHADOW = (0, 0, 0, 70)

im = Image.new("RGBA", (32, 16), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
d.rectangle([2, 15, 31, 15], fill=SHADOW)  # shadow on the wall below
d.rectangle([0, 0, 30, 14], fill=OUTLINE)  # frame outline
d.rectangle([1, 1, 29, 13], fill=WOOD)  # frame
d.rectangle([1, 1, 29, 1], fill=WOOD_HI)
d.rectangle([1, 1, 1, 13], fill=WOOD_HI)
d.rectangle([1, 13, 29, 13], fill=WOOD_DK)
d.rectangle([29, 1, 29, 13], fill=WOOD_DK)
d.rectangle([3, 3, 27, 11], fill=OUTLINE)  # map inset outline
d.rectangle([4, 4, 26, 10], fill=LAND)
d.rectangle([4, 9, 9, 10], fill=WATER)  # a pond
d.rectangle([21, 4, 26, 5], fill=LAND_DK)  # hills
for x, y in ((6, 5), (12, 9), (23, 9)):
    d.point((x, y), fill=LAND_DK)
# metro lines: tech trunk with food / trading / piano branches
d.rectangle([6, 7, 24, 7], fill=TECH)
d.rectangle([12, 4, 12, 7], fill=FOOD)
d.rectangle([18, 7, 18, 10], fill=TRADE)
d.rectangle([22, 4, 22, 7], fill=PIANO)
for x, y in ((6, 7), (24, 7), (12, 4), (18, 10), (22, 4)):
    d.point((x, y), fill=WHITE)
for x, y in ((12, 7), (18, 7), (22, 7)):  # interchanges read bigger
    d.rectangle([x - 1, y - 1, x + 1, y + 1], fill=OUTLINE)
    d.point((x, y), fill=WHITE)
d.point((15, 2), fill=PIN)  # pushpin on the frame
im.save(OUT)
print("ok", OUT)

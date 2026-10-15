"""Draw the gym corner: 3 frames of a 48x32 strip (144x32). Frame 0 = bar resting on the uprights,
1 = bar lifted 2px, 2 = lifted 4px. Same outline/palette family as scripts/draw-objects.py."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent.parent / "public" / "assets" / "objects"
W, H, FRAMES = 48, 32, 3

# Art direction: 1px outline in the darkest shade of the piece's own hue (neutral #404040 only on metal),
# light from the top-left (lit top face + left edge, dark right edge + front), 3 tones per material.
OUT_C = (0x40, 0x40, 0x40, 255)  # metal only (uprights, bar, plates, dumbbells)
OUT_MAT = (0x24, 0x3c, 0x68, 255)
OUT_PAD = (0x5c, 0x20, 0x2c, 255)
OUT_WOOD = (0x50, 0x2c, 0x1c, 255)
MAT = (0x4a, 0x78, 0xb8, 255)
MAT_HI = (0x68, 0x98, 0xd8, 255)
MAT_LO = (0x38, 0x5c, 0x98, 255)
PAD = (0xc8, 0x48, 0x48, 255)
PAD_HI = (0xe8, 0x78, 0x70, 255)
PAD_LO = (0x90, 0x30, 0x38, 255)
STEEL = (0xb8, 0xbc, 0xc8, 255)
STEEL_HI = (0xe8, 0xec, 0xf0, 255)
STEEL_LO = (0x78, 0x7c, 0x90, 255)
IRON = (0x38, 0x3c, 0x4c, 255)
IRON_HI = (0x58, 0x5c, 0x70, 255)
WOOD = (0xb8, 0x80, 0x50, 255)
WOOD_HI = (0xd8, 0xa8, 0x70, 255)
WOOD_LO = (0x80, 0x48, 0x28, 255)
SHADOW = (0, 0, 0, 70)


def box(d, x0, y0, x1, y1, fill, hi=None, lo=None, outl=OUT_C):
    """outlined box: hi on the top row and left column (lit), lo on the bottom row and right column (shade)"""
    d.rectangle([x0, y0, x1, y1], fill=outl)
    d.rectangle([x0 + 1, y0 + 1, x1 - 1, y1 - 1], fill=fill)
    if hi:
        d.line([x0 + 1, y0 + 1, x1 - 1, y0 + 1], fill=hi)
        d.line([x0 + 1, y0 + 1, x0 + 1, y1 - 1], fill=hi)
    if lo:
        d.line([x0 + 1, y1 - 1, x1 - 1, y1 - 1], fill=lo)
        d.line([x1 - 1, y0 + 2, x1 - 1, y1 - 1], fill=lo)


def dumbbell(d, x, y):
    """small dumbbell lying on a shelf, 7px wide, 3px tall at (x,y)"""
    d.rectangle([x, y, x + 1, y + 2], fill=IRON)
    d.rectangle([x + 5, y, x + 6, y + 2], fill=IRON)
    d.point((x, y), fill=IRON_HI)
    d.point((x + 5, y), fill=IRON_HI)
    d.line([x + 2, y + 1, x + 4, y + 1], fill=STEEL)


def frame(lift):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([2, H - 1, W - 1, H - 1], fill=SHADOW)
    # mat
    box(d, 0, 14, 31, 30, MAT, MAT_HI, MAT_LO, OUT_MAT)
    for x in range(4, 30, 6):
        d.line([x, 25, x + 2, 25], fill=MAT_LO)
    # bench legs + pad
    box(d, 6, 22, 8, 27, IRON, IRON_HI)
    box(d, 22, 22, 24, 27, IRON, IRON_HI)
    box(d, 4, 16, 26, 22, PAD, PAD_HI, PAD_LO, OUT_PAD)
    # uprights with hooks (behind the bench head)
    box(d, 5, 6, 7, 16, IRON, IRON_HI)
    box(d, 23, 6, 25, 16, IRON, IRON_HI)
    d.rectangle([5, 9, 8, 10], fill=OUT_C)
    d.rectangle([22, 9, 25, 10], fill=OUT_C)
    # barbell: bar y=8 at rest, minus lift
    by = 8 - lift
    d.rectangle([1, by - 3, 3, by + 3], fill=OUT_C)
    d.rectangle([29, by - 3, 31, by + 3], fill=OUT_C)
    d.rectangle([2, by - 2, 2, by + 2], fill=IRON)
    d.rectangle([30, by - 2, 30, by + 2], fill=IRON)
    d.line([3, by - 1, 29, by - 1], fill=OUT_C)
    d.line([3, by + 1, 29, by + 1], fill=OUT_C)
    d.line([3, by, 29, by], fill=STEEL)
    d.line([9, by, 11, by], fill=STEEL_HI)
    d.rectangle([4, by - 4, 5, by + 4], fill=OUT_C)
    d.rectangle([27, by - 4, 28, by + 4], fill=OUT_C)
    d.line([4, by - 3, 4, by + 3], fill=IRON_HI)
    d.line([27, by - 3, 27, by + 3], fill=IRON_HI)
    d.point((5, by), fill=IRON)
    d.point((28, by), fill=IRON)
    # dumbbell rack (right)
    box(d, 34, 12, 36, 30, WOOD, WOOD_HI, WOOD_LO, OUT_WOOD)
    box(d, 45, 12, 47, 30, WOOD, WOOD_HI, WOOD_LO, OUT_WOOD)
    box(d, 34, 15, 47, 18, WOOD, WOOD_HI, WOOD_LO, OUT_WOOD)
    box(d, 34, 23, 47, 26, WOOD, WOOD_HI, WOOD_LO, OUT_WOOD)
    dumbbell(d, 38, 12)
    dumbbell(d, 38, 20)
    dumbbell(d, 38, 27)
    return im


if __name__ == "__main__":
    strip = Image.new("RGBA", (W * FRAMES, H), (0, 0, 0, 0))
    for i, lift in enumerate((0, 2, 4)):
        strip.paste(frame(lift), (i * W, 0))
    strip.save(OUT / "gym.png")
    bg = Image.new("RGBA", strip.size, (0xc9, 0xa8, 0x7c, 255))
    bg.alpha_composite(strip)
    bg.resize((strip.width * 6, strip.height * 6), Image.NEAREST).save(Path(__import__("os").environ.get("GYM_PREVIEW", "gym-preview.png")))

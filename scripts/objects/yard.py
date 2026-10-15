"""Art for the front yard and the recruiter battle (no raw-pack source: drawn here, like draw-objects.py).

Writes (all native px, RGBA, 1px #404040-family outlines, flat 2-3 tone shading):
  public/assets/decor/path.png        16x112  dirt path (1x7 tiles)
  public/assets/decor/tree.png        16x32   a tree (ThatsSoWitty outdoor crop; 1x1 footprint, canopy overhangs upward)
  public/assets/decor/door.png        16x32   the front door, on the house wall (rows 0-1)
  public/assets/objects/mailbox.png   16x24   the mailbox (1x1 footprint)
  public/assets/objects/sign.png      16x20   the wooden sign (1x1 footprint)
  public/assets/icons/mailbox.png     16x16   bag chip
  public/assets/icons/sign.png        16x16   bag chip
  public/assets/battle/recruiter.png  32x40   the wild RECRUITER (shown at 2x in the battle)
  public/assets/battle/platform.png   96x24   battle platform (both sides)
Run: python3 scripts/objects/yard.py
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from raw_assets import raw_dir

ROOT = Path(__file__).resolve().parent.parent.parent / "public" / "assets"
DECOR = ROOT / "decor"
OBJECTS = ROOT / "objects"
ICONS = ROOT / "icons"
BATTLE = ROOT / "battle"

OUTLINE = (0x40, 0x40, 0x40, 255)
SHADOW = (0, 0, 0, 70)
# grass / plants
GRASS = (0x58, 0xa8, 0x48, 255)
GRASS_DK = (0x3c, 0x84, 0x34, 255)
GRASS_DD = (0x28, 0x60, 0x24, 255)
GRASS_HI = (0x80, 0xc8, 0x60, 255)
LEAF = (0x3c, 0x8c, 0x38, 255)
LEAF_HI = (0x60, 0xb0, 0x50, 255)
LEAF_DK = (0x24, 0x60, 0x28, 255)
# wood / dirt
WOOD = (0xb8, 0x80, 0x50, 255)
WOOD_HI = (0xd8, 0xa8, 0x70, 255)
WOOD_DK = (0x80, 0x48, 0x28, 255)
DIRT = (0xc8, 0xa8, 0x70, 255)
DIRT_DK = (0xb0, 0x90, 0x58, 255)
PEBBLE = (0xe0, 0xc8, 0x98, 255)
# metal / paper
STEEL = (0x98, 0xa0, 0xb0, 255)
STEEL_HI = (0xc8, 0xd0, 0xdc, 255)
STEEL_DK = (0x60, 0x68, 0x78, 255)
RED = (0xd8, 0x40, 0x38, 255)
PAPER = (0xf8, 0xf4, 0xe0, 255)
INK = (0x60, 0x60, 0x70, 255)
GLASS = (0x90, 0xb4, 0xd8, 255)
GLASS_HI = (0xc8, 0xe0, 0xf4, 255)
BRASS = (0xe8, 0xc0, 0x40, 255)


def new(w, h):
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def path(rows=7):
    im, d = new(16, 16 * rows)
    d.rectangle([0, 0, 15, 16 * rows - 1], fill=DIRT)
    d.rectangle([0, 0, 0, 16 * rows - 1], fill=DIRT_DK)
    d.rectangle([15, 0, 15, 16 * rows - 1], fill=DIRT_DK)
    for i in range(rows):
        y = i * 16
        for (x, dy) in ((3, 4), (11, 9), (7, 13)):
            d.rectangle([x, y + dy, x + 1, y + dy], fill=PEBBLE)
            d.point((x, y + dy + 1), fill=DIRT_DK)
    return im


def tree():
    """TSW outdoor tree (sheet rows 1834-1865, x 0-15: canopy + trunk, exactly the 16x32 slot, no scaling); the sheet's key
    colours and the ground / shadow greens around the trunk are keyed out so the lawn shows through."""
    sheet = Image.open(raw_dir() / "tiles" / "thatssowitty-public-outdoor.png").convert("RGBA")
    im = sheet.crop((0, 1834, 16, 1866))
    px = im.load()
    drop = {(255, 242, 0), (0, 183, 239), (0, 174, 239), (0x84, 0xc7, 0x7b), (0x63, 0xa6, 0x73), (0x5a, 0x8e, 0x63), (0x4a, 0x71, 0x52)}
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y][:3] in drop:
                px[x, y] = (0, 0, 0, 0)
    return im


def door():
    im, d = new(16, 32)
    # frame
    d.rectangle([1, 2, 14, 31], fill=OUTLINE)
    d.rectangle([2, 3, 13, 30], fill=WOOD)
    d.rectangle([2, 3, 13, 3], fill=WOOD_HI)
    d.rectangle([2, 3, 2, 30], fill=WOOD_HI)
    d.rectangle([13, 3, 13, 30], fill=WOOD_DK)
    # two panels
    d.rectangle([4, 6, 11, 14], fill=OUTLINE)
    d.rectangle([5, 7, 10, 13], fill=WOOD_DK)
    d.rectangle([4, 18, 11, 27], fill=OUTLINE)
    d.rectangle([5, 19, 10, 26], fill=WOOD_DK)
    # small window + knob
    d.rectangle([6, 8, 9, 11], fill=GLASS)
    d.point((6, 8), fill=GLASS_HI)
    d.rectangle([11, 16, 12, 17], fill=BRASS)
    # step
    d.rectangle([0, 30, 15, 31], fill=STEEL_DK)
    return im


def mailbox():
    im, d = new(16, 24)
    d.rectangle([2, 23, 15, 23], fill=SHADOW)
    # post
    d.rectangle([6, 12, 9, 22], fill=OUTLINE)
    d.rectangle([7, 13, 8, 21], fill=WOOD_DK)
    d.rectangle([7, 13, 7, 21], fill=WOOD)
    # box: rounded top
    d.rectangle([1, 3, 14, 12], fill=OUTLINE)
    d.rectangle([2, 4, 13, 11], fill=STEEL)
    d.rectangle([2, 4, 13, 4], fill=STEEL_HI)
    d.rectangle([2, 10, 13, 11], fill=STEEL_DK)
    d.point((1, 3), fill=(0, 0, 0, 0))
    d.point((14, 3), fill=(0, 0, 0, 0))
    # door line and latch
    d.rectangle([11, 5, 11, 10], fill=STEEL_DK)
    d.point((12, 7), fill=BRASS)
    # red flag, raised
    d.rectangle([3, 0, 4, 6], fill=OUTLINE)
    d.rectangle([3, 1, 3, 5], fill=RED)
    d.rectangle([0, 0, 4, 1], fill=OUTLINE)
    d.rectangle([1, 0, 3, 0], fill=RED)
    return im


def sign():
    im, d = new(16, 20)
    d.rectangle([2, 19, 15, 19], fill=SHADOW)
    d.rectangle([6, 11, 9, 18], fill=OUTLINE)
    d.rectangle([7, 12, 8, 17], fill=WOOD_DK)
    d.rectangle([0, 0, 15, 11], fill=OUTLINE)
    d.rectangle([1, 1, 14, 10], fill=WOOD)
    d.rectangle([1, 1, 14, 1], fill=WOOD_HI)
    d.rectangle([1, 10, 14, 10], fill=WOOD_DK)
    for y in (4, 7):  # two lines of "writing"
        d.rectangle([3, y, 12, y], fill=INK)
    d.point((4, 7), fill=WOOD)
    return im


def icon_mailbox():
    im, d = new(16, 16)
    d.rectangle([6, 9, 9, 15], fill=OUTLINE)
    d.rectangle([7, 10, 8, 14], fill=WOOD_DK)
    d.rectangle([1, 2, 14, 9], fill=OUTLINE)
    d.rectangle([2, 3, 13, 8], fill=STEEL)
    d.rectangle([2, 3, 13, 3], fill=STEEL_HI)
    d.rectangle([11, 4, 11, 7], fill=STEEL_DK)
    d.rectangle([3, 0, 3, 4], fill=RED)
    d.rectangle([1, 0, 3, 0], fill=RED)
    return im


def icon_sign():
    im, d = new(16, 16)
    d.rectangle([6, 10, 9, 15], fill=OUTLINE)
    d.rectangle([7, 11, 8, 14], fill=WOOD_DK)
    d.rectangle([0, 1, 15, 10], fill=OUTLINE)
    d.rectangle([1, 2, 14, 9], fill=WOOD)
    d.rectangle([1, 2, 14, 2], fill=WOOD_HI)
    for y in (4, 7):
        d.rectangle([3, y, 12, y], fill=INK)
    return im


def recruiter():
    """A front-facing trainer in a suit holding a clipboard. 32x40, shown at 2x on the battle screen."""
    HAIR = (0x38, 0x28, 0x20, 255)
    SKIN = (0xf8, 0xd8, 0xb0, 255)
    SKIN_DK = (0xd8, 0xb0, 0x88, 255)
    SUIT = (0x34, 0x3c, 0x58, 255)
    SUIT_HI = (0x50, 0x5c, 0x80, 255)
    SHIRT = (0xf8, 0xf8, 0xf8, 255)
    TIE = (0xd8, 0x40, 0x38, 255)
    LANYARD = (0x48, 0xa0, 0xe8, 255)
    SHOE = (0x24, 0x24, 0x2c, 255)
    im, d = new(32, 40)
    d.ellipse([4, 36, 27, 39], fill=SHADOW)
    # legs + shoes
    d.rectangle([10, 28, 21, 37], fill=OUTLINE)
    d.rectangle([11, 29, 14, 35], fill=SUIT)
    d.rectangle([17, 29, 20, 35], fill=SUIT)
    d.rectangle([15, 29, 16, 35], fill=OUTLINE)
    d.rectangle([9, 35, 14, 37], fill=SHOE)
    d.rectangle([17, 35, 22, 37], fill=SHOE)
    d.rectangle([9, 34, 22, 34], fill=OUTLINE)
    # jacket
    d.rectangle([6, 16, 25, 29], fill=OUTLINE)
    d.rectangle([7, 17, 24, 28], fill=SUIT)
    d.rectangle([7, 17, 7, 28], fill=SUIT_HI)
    # shirt V and tie
    d.polygon([(13, 17), (18, 17), (16, 24), (15, 24)], fill=SHIRT)
    d.rectangle([15, 18, 16, 25], fill=TIE)
    d.point((15, 18), fill=OUTLINE)
    # lanyard + badge
    d.line([12, 17, 14, 24], fill=LANYARD)
    d.line([19, 17, 17, 24], fill=LANYARD)
    d.rectangle([13, 24, 18, 27], fill=OUTLINE)
    d.rectangle([14, 25, 17, 26], fill=PAPER)
    # arms
    d.rectangle([4, 18, 7, 27], fill=OUTLINE)
    d.rectangle([5, 19, 6, 26], fill=SUIT)
    d.rectangle([24, 18, 27, 27], fill=OUTLINE)
    d.rectangle([25, 19, 26, 26], fill=SUIT)
    # clipboard in the right hand (viewer's right)
    d.rectangle([23, 21, 31, 32], fill=OUTLINE)
    d.rectangle([24, 22, 30, 31], fill=WOOD_DK)
    d.rectangle([25, 23, 29, 30], fill=PAPER)
    d.rectangle([26, 25, 28, 25], fill=INK)
    d.rectangle([26, 27, 28, 27], fill=INK)
    d.rectangle([26, 21, 28, 22], fill=STEEL_DK)
    d.rectangle([25, 31, 27, 33], fill=SKIN)  # hand
    d.rectangle([4, 26, 7, 29], fill=OUTLINE)
    d.rectangle([5, 27, 6, 28], fill=SKIN)  # other hand
    # head
    d.rectangle([9, 2, 22, 16], fill=OUTLINE)
    d.rectangle([10, 3, 21, 15], fill=SKIN)
    d.rectangle([10, 3, 21, 6], fill=HAIR)
    d.rectangle([10, 7, 11, 9], fill=HAIR)
    d.rectangle([20, 7, 21, 8], fill=HAIR)
    d.rectangle([12, 2, 19, 2], fill=HAIR)
    d.rectangle([10, 14, 21, 15], fill=SKIN_DK)
    d.rectangle([13, 9, 14, 10], fill=OUTLINE)  # eyes
    d.rectangle([18, 9, 19, 10], fill=OUTLINE)
    d.rectangle([15, 13, 17, 13], fill=SKIN_DK)  # mouth
    d.rectangle([14, 16, 17, 16], fill=SKIN)  # neck
    return im


def platform():
    im, d = new(96, 24)
    d.ellipse([0, 4, 95, 23], fill=OUTLINE)
    d.ellipse([1, 5, 94, 22], fill=GRASS_DK)
    d.ellipse([2, 6, 93, 19], fill=GRASS)
    d.ellipse([10, 7, 60, 12], fill=GRASS_HI)
    for x in (18, 40, 66, 80):
        d.line([x, 15, x, 11], fill=GRASS_DK)
        d.line([x + 2, 16, x + 2, 12], fill=GRASS_DK)
    return im


if __name__ == "__main__":
    for p in (DECOR, OBJECTS, ICONS, BATTLE):
        p.mkdir(parents=True, exist_ok=True)
    path().save(DECOR / "path.png")
    tree().save(DECOR / "tree.png")
    door().save(DECOR / "door.png")
    mailbox().save(OBJECTS / "mailbox.png")
    sign().save(OBJECTS / "sign.png")
    icon_mailbox().save(ICONS / "mailbox.png")
    icon_sign().save(ICONS / "sign.png")
    recruiter().save(BATTLE / "recruiter.png")
    platform().save(BATTLE / "platform.png")
    print("ok")

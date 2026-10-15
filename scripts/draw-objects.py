"""Draw objects that have no art in the raw pack. Palette/outline match the bed and desk crops
(1px outline, flat 2-3 tone shading, translucent drop shadow; the piano uses the darkest tone of its own wood)."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance, ImageOps

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets" / "objects"

WOOD_OUTLINE = (0x3c, 0x1e, 0x12, 255)  # darkest tone of the wood hue (WOOD_DARK is already a panel fill)
WOOD_LIGHT = (0xb8, 0x80, 0x50, 255)
WOOD_HI = (0xd8, 0xa8, 0x70, 255)
WOOD = (0x80, 0x48, 0x28, 255)
WOOD_DARK = (0x5c, 0x30, 0x1c, 255)
KEY_W = (0xf8, 0xf8, 0xf8, 255)
KEY_SEP = (0xa8, 0xa8, 0xb0, 255)
KEY_B = (0x28, 0x28, 0x30, 255)
PAPER = (0xf0, 0xe8, 0xd0, 255)
INK = (0x60, 0x60, 0x70, 255)
GOLD = (0xe8, 0xc0, 0x40, 255)
SHADOW = (0, 0, 0, 70)


def piano():
    W, H = 32, 32
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # drop shadow under the case (like the bed/desk art)
    d.rectangle([2, H - 2, W - 1, H - 1], fill=SHADOW)
    # case outline + body (x 0..30, y 0..30)
    # coloured outline (pixel review #8: pack pieces outline in the darkest tone of their hue, not grey); light from the top-left
    d.rectangle([0, 0, 30, 30], fill=WOOD_OUTLINE)
    # top surface (seen from above): light wood with a highlight edge
    d.rectangle([1, 1, 29, 6], fill=WOOD_LIGHT)
    d.rectangle([1, 1, 29, 1], fill=WOOD_HI)
    d.rectangle([1, 6, 29, 6], fill=WOOD)
    # upper front panel with the sheet music
    d.rectangle([1, 7, 29, 14], fill=WOOD_DARK)
    d.rectangle([1, 7, 1, 14], fill=WOOD)
    d.rectangle([9, 8, 21, 13], fill=KEY_B)
    d.rectangle([10, 9, 20, 12], fill=PAPER)
    for x in (12, 15, 18):  # tiny notes
        d.point((x, 10), fill=INK)
        d.point((x + 1, 11), fill=INK)
    # key bed ledge
    d.rectangle([1, 15, 29, 15], fill=WOOD_HI)
    # keyboard: 7 white keys (pitch 4) with the 2-3 black key pattern
    d.rectangle([2, 16, 28, 23], fill=KEY_SEP)
    for k in range(7):
        x0 = 2 + k * 4
        d.rectangle([x0, 16, x0 + 2, 23], fill=KEY_W)
    for boundary in (1, 2, 4, 5, 6):
        x = 2 + boundary * 4 - 2
        d.rectangle([x, 16, x + 1, 20], fill=KEY_B)
    d.rectangle([1, 24, 29, 25], fill=WOOD)  # keyboard lip
    d.rectangle([1, 24, 29, 24], fill=WOOD_LIGHT)
    # lower front panel + legs + pedals
    d.rectangle([1, 26, 29, 29], fill=WOOD_DARK)
    d.rectangle([13, 28, 14, 29], fill=GOLD)
    d.rectangle([16, 28, 17, 29], fill=GOLD)
    d.rectangle([1, 26, 3, 29], fill=WOOD)
    d.rectangle([27, 26, 29, 29], fill=WOOD)
    # side light: lit left side (x 1), darker right side (x 29); the lit top edge is row 1 above
    d.rectangle([1, 1, 1, 6], fill=WOOD_HI)
    d.rectangle([1, 7, 1, 29], fill=WOOD_LIGHT)
    d.rectangle([29, 2, 29, 29], fill=WOOD_DARK)
    d.point((29, 1), fill=WOOD_LIGHT)
    im.save(OUT / "piano.png")


def _polaroid_photo(src):
    """11x10 pixel-art version of a published photo: crop-fit, box-shrink, punch up, 10 colours."""
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    im = ImageOps.fit(im, (88, 80), Image.LANCZOS)
    im = im.resize((11, 10), Image.BOX)
    im = ImageEnhance.Contrast(ImageEnhance.Color(im).enhance(1.6)).enhance(1.3)
    return im.quantize(10, Image.MEDIANCUT, dither=Image.NONE).convert("RGBA")


def corkboard():
    """Wall art for the Photos object: three equal pixel polaroids on a 3-tile footprint (48x24).
    Reads the three `wall: true` photos from src/content/photos.json (published JPEGs in public/assets/photos)."""
    edge = (120, 112, 104, 255)
    cream = (248, 248, 240, 255)
    shade = (210, 206, 196, 255)
    pins = [(216, 56, 48, 255), (64, 104, 200, 255), (216, 56, 48, 255)]
    photos = json.loads((ROOT / "src" / "content" / "photos.json").read_text(encoding="utf8"))["photos"]
    wall = [p for p in photos if p.get("wall")]
    assert len(wall) == 3, "photos.json must have exactly 3 wall photos"
    assets = json.loads((ROOT / "src" / "assets" / "assets.json").read_text(encoding="utf8"))
    im = Image.new("RGBA", (48, 24), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for p, x, pin in zip(wall, (1, 17, 33), pins):
        y = 6
        d.rectangle([x, y, x + 14, y + 16], fill=edge)               # 15 x 17 with a 1px dark edge
        d.rectangle([x + 1, y + 1, x + 13, y + 15], fill=cream)       # cream border and 3px lip
        d.line([(x + 1, y + 15), (x + 13, y + 15)], fill=shade)       # shade line under the lip
        path = ROOT / "public" / assets[p["slot"]]["path"].lstrip("/")
        im.paste(_polaroid_photo(path), (x + 2, y + 2))
        d.rectangle([x + 7, y - 1, x + 8, y], fill=pin)               # 2px pin centred on the top edge
    im.save(OUT / "corkboard.png")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    piano()
    corkboard()
    print("ok")

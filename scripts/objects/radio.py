"""The bedroom radio: a portable cassette radio cut from the ThatsSoWitty interior sheet (native 16 px tiles, no scaling).

Writes:
  public/assets/objects/radio.png   16x20   the radio (1x1 footprint; the antenna overhangs 4 px above the tile)
  public/assets/icons/radio.png     16x16   bag chip: a 1:1 crop of the same art (the bottom 16 rows; only the antenna tip is cut)
Run: python3 scripts/objects/radio.py
"""
import sys
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from raw_assets import raw_dir

ROOT = Path(__file__).resolve().parent.parent.parent / "public" / "assets"
KEYS = {(0, 183, 239), (255, 242, 0)}  # the sheet's checker background
BOX = (0, 2684, 16, 2704)  # radio + its 1 px drop shadow, found by connected-component scan


def radio():
    img = Image.open(raw_dir() / "tiles" / "thatssowitty-public-interior.png").convert("RGBA").crop(BOX)
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            if px[x, y][:3] in KEYS:
                px[x, y] = (0, 0, 0, 0)
    return img


def icon(art):
    im = art.crop((0, art.height - 16, 16, art.height))
    allowed = {p for p in art.getdata() if p[3] == 255}
    for p in im.getdata():
        assert p[3] in (0, 255), f"alpha {p[3]}"
        assert p[3] == 0 or p in allowed
    assert im.size == (16, 16) and im.getbbox()
    return im


if __name__ == "__main__":
    art = radio()
    art.save(ROOT / "objects" / "radio.png")
    icon(art).save(ROOT / "icons" / "radio.png")
    print("wrote radio")

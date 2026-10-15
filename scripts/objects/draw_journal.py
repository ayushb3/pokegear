"""Draw the desk journal (open notebook, 16x16, top-down). Same 1px #404040 outline / flat shading /
translucent shadow as the bed, desk and piano art. Run: python scripts/objects/draw_journal.py"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[2] / "public" / "assets" / "objects" / "journal.png"
OUTLINE = (0x40, 0x40, 0x40, 255)
COVER = (0x2f, 0x6f, 0x8f, 255)
COVER_HI = (0x4a, 0x90, 0xb0, 255)
PAPER = (0xf0, 0xe8, 0xd0, 255)
PAPER_SH = (0xd8, 0xcc, 0xa8, 255)
PAPER_MID = (0xe4, 0xdc, 0xc0, 255)
INK = (0x60, 0x60, 0x70, 255)
GOLD = (0xe8, 0xc0, 0x40, 255)
SHADOW = (0, 0, 0, 70)

im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
d.rectangle([2, 13, 15, 15], fill=SHADOW)
d.rectangle([0, 3, 14, 13], fill=OUTLINE)
d.rectangle([1, 4, 13, 12], fill=COVER)
d.rectangle([1, 4, 13, 4], fill=COVER_HI)
d.rectangle([2, 5, 12, 11], fill=PAPER)
d.rectangle([6, 5, 6, 11], fill=PAPER_MID)
d.rectangle([7, 5, 7, 11], fill=PAPER_SH)
for y in (6, 8, 10):
    d.rectangle([3, y, 5, y], fill=INK)
    d.rectangle([9, y, 11, y], fill=INK)
d.rectangle([10, 10, 11, 10], fill=PAPER)
d.rectangle([2, 1, 4, 3], fill=OUTLINE)
d.rectangle([3, 1, 3, 3], fill=GOLD)
im.save(OUT)
print("ok")

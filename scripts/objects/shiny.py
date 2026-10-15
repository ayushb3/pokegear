"""Shiny Oshawott: a palette swap of the follower sheet (public/assets/sprites/oshawott.png -> oshawott-shiny.png).
The blues go paler and greener, the way the shiny form reads in HGSS's successors; outlines, whites and the shell keep
their colours. Run: python3 scripts/objects/shiny.py
"""
from pathlib import Path
from PIL import Image

SPRITES = Path(__file__).resolve().parent.parent.parent / "public" / "assets" / "sprites"
SWAP = {
    (33, 182, 191): (150, 230, 215),  # body light
    (25, 138, 147): (88, 190, 180),  # body mid
    (25, 79, 87): (48, 128, 128),  # body dark
    (63, 95, 164): (110, 150, 205),  # feet / tail light
    (40, 55, 95): (62, 92, 140),  # feet / tail dark
    (46, 54, 93): (66, 86, 130),
    (33, 55, 71): (50, 90, 100),
}

src = Image.open(SPRITES / "oshawott.png").convert("RGBA")
out = Image.new("RGBA", src.size)
w, h = src.size
sp = src.load()
op = out.load()
changed = 0
for y in range(h):
    for x in range(w):
        r, g, b, a = sp[x, y]
        key = (r, g, b)
        if a and key in SWAP:
            op[x, y] = (*SWAP[key], a)
            changed += 1
        else:
            op[x, y] = (r, g, b, a)
out.save(SPRITES / "oshawott-shiny.png")
print("ok", changed, "px swapped")

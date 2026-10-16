"""Draw the wall-mounted trading monitor: a 32x28 cell, F frames side by side (strip), a tiny price line ticking.
It hangs on the bedroom's back wall (footprint x10-11, y1, non-solid) beside the PC desk, on a short bracket arm
into a wall plate, like a mounted screen. Art is bottom-anchored on the footprint: the bottom 4 rows are left
clear so the screen never covers the baseboard (only its soft shadow falls there).
Art direction: bezel in the PC desk's blue-grey (7090b0 / 90b0c8 sampled from pc-desk.png) with a dark outline,
light from the top-left (lit top + left bezel edge, one glint pixel), dark screen, shadow alpha 70.
Screen face: a yellow 3x5 "SIM" tag top-left (the data is simulated) and a green price line that scrolls left
SHIFT px per frame over a cyclic series of length F*SHIFT, so the strip loops seamlessly; the newest point blinks.
Output: public/assets/objects/monitor.png (+ an 8x preview on the wall colours with --preview <path>, not committed)."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "public" / "assets" / "objects"
W, H, F, SHIFT = 32, 28, 8, 3

OUTLINE = (0x38, 0x4c, 0x68, 255)  # darkest shade of the bezel's blue-grey
CASE = (0x70, 0x90, 0xb0, 255)  # PC desk blue-grey
CASE_HI = (0x90, 0xb0, 0xc8, 255)  # PC desk light blue-grey
CASE_LO = (0x50, 0x6c, 0x8c, 255)
GLINT = (0xe0, 0xee, 0xf6, 255)
SCREEN = (0x14, 0x1c, 0x28, 255)
GRID = (0x22, 0x2e, 0x40, 255)
LINE = (0x58, 0xb8, 0x60, 255)  # HGSS green
LINE_LO = (0x2e, 0x6a, 0x3c, 255)  # fill under the line
HEAD = (0xe0, 0xee, 0xf6, 255)
TAG = (0xf0, 0xc8, 0x40, 255)  # yellow SIM tag
LED = (0x58, 0xb8, 0x60, 255)
SHADOW = (0, 0, 0, 70)

# screen interior (inside the bezel)
SX0, SY0, SW, SH = 4, 3, 24, 13
# cyclic price heights above the screen's bottom row (0..6), period F*SHIFT = 24
SERIES = [2, 3, 3, 4, 3, 2, 2, 3, 4, 5, 5, 4, 5, 6, 5, 4, 3, 3, 2, 1, 1, 2, 2, 1]
assert len(SERIES) == F * SHIFT

# 3x5 glyphs for the tag
GLYPHS = {
    "S": ["###", "#..", "###", "..#", "###"],
    "I": ["###", ".#.", ".#.", ".#.", "###"],
    "M": ["#.#", "###", "#.#", "#.#", "#.#"],
}


def text(d, x, y, s, col):
    for ch in s:
        for gy, row in enumerate(GLYPHS[ch]):
            for gx, c in enumerate(row):
                if c == "#":
                    d.point((x + gx, y + gy), fill=col)
        x += 4


def frame(f):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # soft shadow on the wall: right of and below the case, and under the plate
    d.rectangle([4, 19, 29, 19], fill=SHADOW)
    d.rectangle([30, 2, 30, 19], fill=SHADOW)
    d.rectangle([13, 26, 20, 26], fill=SHADOW)
    # case (outline, blue-grey bezel lit from the top-left)
    d.rectangle([1, 0, 30, 18], fill=OUTLINE)
    d.rectangle([2, 1, 29, 17], fill=CASE)
    d.line([2, 1, 29, 1], fill=CASE_HI)
    d.line([2, 1, 2, 16], fill=CASE_HI)
    d.line([29, 2, 29, 17], fill=CASE_LO)
    d.line([3, 17, 29, 17], fill=CASE_LO)
    d.point((3, 1), fill=GLINT)
    # screen
    d.rectangle([SX0 - 1, SY0 - 1, SX0 + SW, SY0 + SH], fill=OUTLINE)
    d.rectangle([SX0, SY0, SX0 + SW - 1, SY0 + SH - 1], fill=SCREEN)
    base = SY0 + SH - 1  # bottom screen row
    for gy in (base - 2, base - 5):
        for gx in range(SX0, SX0 + SW, 2):
            d.point((gx, gy), fill=GRID)
    text(d, SX0 + 1, SY0 + 1, "SIM", TAG)
    # price line: column i shows SERIES[(f*SHIFT + i) % 24]; vertical joins keep it a continuous 1px line
    prev = None
    for i in range(SW):
        h = SERIES[(f * SHIFT + i) % len(SERIES)]
        x, y = SX0 + i, base - h
        for fy in range(y + 1, base + 1):
            d.point((x, fy), fill=LINE_LO)
        if prev is not None and abs(prev - y) > 1:
            lo, hi = sorted((prev, y))
            d.line([x, lo, x, hi], fill=LINE)
        d.point((x, y), fill=LINE)
        prev = y
    if f % 2 == 0:  # the newest point blinks
        d.point((SX0 + SW - 1, prev), fill=HEAD)
    # power LED on the bottom bezel
    d.point((26, 17), fill=LED)
    # bracket arm out of the wall + a square wall plate with two bolts (reads as mounted, not a desk stand)
    d.rectangle([14, 19, 17, 20], fill=OUTLINE)
    d.line([15, 19, 16, 19], fill=CASE_LO)
    d.rectangle([12, 20, 19, 25], fill=OUTLINE)
    d.rectangle([13, 21, 18, 24], fill=CASE)
    d.line([13, 21, 18, 21], fill=CASE_HI)
    d.line([18, 22, 18, 24], fill=CASE_LO)
    d.point((14, 23), fill=OUTLINE)
    d.point((17, 23), fill=OUTLINE)
    return im


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    strip = Image.new("RGBA", (W * F, H), (0, 0, 0, 0))
    for f in range(F):
        strip.paste(frame(f), (f * W, 0))
    strip.save(OUT / "monitor.png")
    if "--preview" in sys.argv:
        # on the bedroom back wall: top band (row 0), body, 4 px baseboard; the cell bottom = the wall's bottom
        bg = Image.new("RGBA", (strip.width, 32), (0x7a, 0x8c, 0xb8, 255))
        dd = ImageDraw.Draw(bg)
        dd.rectangle([0, 0, strip.width, 15], fill=(0x65, 0x76, 0x9f, 255))
        dd.rectangle([0, 28, strip.width, 31], fill=(0x4a, 0x58, 0x78, 255))
        bg.alpha_composite(strip, (0, 32 - H))
        bg.resize((bg.width * 8, bg.height * 8), Image.NEAREST).save(Path(sys.argv[sys.argv.index("--preview") + 1]))
    print("ok")


if __name__ == "__main__":
    main()

"""Draw the trading monitor: a 32x24 frame, F frames side by side (strip), candle chart ticking.
Art direction: bezel in the PC desk's blue-grey (7090b0 / 90b0c8 sampled from pc-desk.png) with a coloured
outline, light from the top-left (lit top + left bezel edge, one glint pixel), dimmed candles, shadow alpha 70.
Frame f shows candles series[f..f+5] of a cyclic series, so the strip loops seamlessly.
Output: public/assets/objects/monitor.png (+ monitor-preview.png, 8x zoom, not committed)."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent.parent / "public" / "assets" / "objects"
W, H, F = 32, 24, 8

OUTLINE = (0x38, 0x4c, 0x68, 255)  # darkest shade of the bezel's blue-grey
CASE = (0x70, 0x90, 0xb0, 255)  # PC desk blue-grey
CASE_HI = (0x90, 0xb0, 0xc8, 255)  # PC desk light blue-grey
CASE_LO = (0x50, 0x6c, 0x8c, 255)
GLINT = (0xe0, 0xee, 0xf6, 255)
SCREEN = (0x14, 0x1c, 0x28, 255)
GRID = (0x22, 0x2e, 0x40, 255)
UP = (0x58, 0xb8, 0x60, 255)
DOWN = (0xd0, 0x58, 0x48, 255)
LED = (0x58, 0xb8, 0x60, 255)
SHADOW = (0, 0, 0, 70)

# cyclic closes (screen-pixel height above the screen bottom, 1..9); open[i] = close[i-1]
CLOSES = [4, 6, 5, 8, 7, 5, 3, 4]
SX0, SY0, SW, SH = 4, 2, 24, 12  # screen interior


def frame(f):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([2, H - 2, W - 1, H - 1], fill=SHADOW)
    # case (outline, blue-grey fill) with the bezel frame lit from the top-left
    d.rectangle([2, 0, 29, 16], fill=OUTLINE)
    d.rectangle([3, 1, 28, 15], fill=CASE)
    d.line([3, 1, 28, 1], fill=CASE_HI)
    d.line([3, 1, 3, 14], fill=CASE_HI)
    d.line([28, 2, 28, 15], fill=CASE_LO)
    d.line([4, 15, 28, 15], fill=CASE_LO)
    d.point((4, 1), fill=GLINT)
    # screen
    d.rectangle([SX0, SY0, SX0 + SW - 1, SY0 + SH - 1], fill=SCREEN)
    for gy in (SY0 + 3, SY0 + 7):
        d.line([SX0, gy, SX0 + SW - 1, gy], fill=GRID)
    base_y = SY0 + SH - 2
    for i in range(6):
        idx = (f + i) % F
        c = CLOSES[idx]
        o = CLOSES[(idx - 1) % F]
        x = SX0 + 1 + i * 4
        top, bot = max(c, o), min(c, o)
        col = UP if c >= o else DOWN
        wick_hi, wick_lo = top + 1 + (idx * 3) % 2, max(1, bot - 1 - (idx * 5) % 2)
        d.line([x + 1, base_y - wick_hi, x + 1, base_y - wick_lo], fill=col)
        d.rectangle([x, base_y - top, x + 2, base_y - bot], fill=col)
    # power LED
    d.point((16, 15), fill=LED)
    # neck + base
    d.rectangle([13, 17, 18, 19], fill=OUTLINE)
    d.rectangle([14, 17, 17, 18], fill=CASE_LO)
    d.rectangle([8, 19, 23, 22], fill=OUTLINE)
    d.rectangle([9, 20, 22, 21], fill=CASE)
    d.line([9, 20, 22, 20], fill=CASE_HI)
    d.line([9, 21, 22, 21], fill=CASE_LO)
    return im


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    strip = Image.new("RGBA", (W * F, H), (0, 0, 0, 0))
    for f in range(F):
        strip.paste(frame(f), (f * W, 0))
    strip.save(OUT / "monitor.png")
    if "--preview" in sys.argv:
        bg = Image.new("RGBA", strip.size, (0xc9, 0xa8, 0x7c, 255))
        bg.alpha_composite(strip)
        bg.resize((strip.width * 4, strip.height * 4), Image.NEAREST).save(Path(sys.argv[sys.argv.index("--preview") + 1]))
    print("ok")


if __name__ == "__main__":
    main()

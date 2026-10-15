"""
Generate animated sprite strips for ambient objects.

Each output is a horizontal strip: frame 0 = the original art (unchanged),
subsequent frames = small pixel edits that give a subtle animation loop.

Objects animated:
  - object.pc:    PC screen flicker (2 frames: 32x30 each, 64x30 output)
  - object.tv:    TV static / picture flicker (3 frames: 30x28 each, 90x28 output)
  - decor.plant:  plant swaying (4 frames: 16x34 each, 64x34 output; idempotent)

Run from the repo root: python scripts/objects/anim_frames.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent.parent
PUB  = ROOT / "public" / "assets"


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def shift_pixels(img: Image.Image, dx: int, dy: int,
                 mask: tuple[int,int,int,int] | None = None) -> Image.Image:
    """Return a copy of `img` with non-transparent pixels shifted by (dx, dy).
    If `mask` (x,y,w,h) is given, only pixels inside that box are shifted."""
    out = img.copy()
    src = img.copy()
    if mask:
        x0, y0, w, h = mask
        region = img.crop((x0, y0, x0 + w, y0 + h))
        # clear the region, paste shifted
        out.paste((0, 0, 0, 0), (x0, y0, x0 + w, y0 + h))
        out.alpha_composite(region, (x0 + dx, y0 + dy))
    else:
        out = Image.new("RGBA", img.size, (0, 0, 0, 0))
        out.alpha_composite(src, (dx, dy))
    return out


def lighten_region(img: Image.Image,
                   x0: int, y0: int, w: int, h: int,
                   amount: int) -> Image.Image:
    """Return a copy with the given rectangle of pixels brightened."""
    out = img.copy()
    pix = out.load()
    assert pix is not None
    for py in range(y0, y0 + h):
        for px in range(x0, x0 + w):
            r, g, b, a = pix[px, py]
            if a > 0:
                pix[px, py] = (min(255, r + amount), min(255, g + amount), min(255, b + amount), a)
    return out


def darken_region(img: Image.Image,
                  x0: int, y0: int, w: int, h: int,
                  amount: int) -> Image.Image:
    """Return a copy with the given rectangle of pixels darkened."""
    out = img.copy()
    pix = out.load()
    assert pix is not None
    for py in range(y0, y0 + h):
        for px in range(x0, x0 + w):
            r, g, b, a = pix[px, py]
            if a > 0:
                pix[px, py] = (max(0, r - amount), max(0, g - amount), max(0, b - amount), a)
    return out


def build_strip(frames: list[Image.Image]) -> Image.Image:
    w = frames[0].width * len(frames)
    h = frames[0].height
    strip = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        strip.paste(f, (i * frames[0].width, 0))
    return strip


# ---------------------------------------------------------------------------
# PC screen flicker: 2 frames  (32 x 30  ->  64 x 30)
# Frame 0: original art unchanged.
# Frame 1: the screen area (roughly the top 16px, full width) is slightly
#           shifted in hue – a gentle blue-white flicker, 2px scan-line shimmer.
# ---------------------------------------------------------------------------

def make_pc_anim():
    src = Image.open(PUB / "objects" / "pc-desk.png").convert("RGBA")
    W, H = src.size  # 32 x 30
    f0 = src.copy()

    # screen area: top 18 rows, x 2..29 (roughly where the monitor display sits)
    # frame 1: brighten slightly and add a 1px horizontal shimmer line
    f1 = lighten_region(src, 2, 1, W - 4, 16, 18)
    # add a subtle 1-px lighter scan line near row 6
    pix = f1.load()
    assert pix is not None
    for px in range(3, W - 3):
        r, g, b, a = pix[px, 6]
        if a > 0:
            pix[px, 6] = (min(255, r + 30), min(255, g + 30), min(255, b + 40), a)

    strip = build_strip([f0, f1])
    out = PUB / "objects" / "pc-desk.png"  # overwrite in-place (strip is now wider)
    strip.save(out)
    print(f"pc-desk  {W}x{H} -> {strip.size[0]}x{strip.size[1]}  ({len([f0, f1])} frames) -> {out}")


# ---------------------------------------------------------------------------
# CRT TV screen flicker: 4 frames  (32 x 30  ->  128 x 30)
# Art: HGSS wood-cabinet CRT (cut by slice-sprites.py from the interior sheet).
# Structure (after checker key-out, trimmed to content):
#   Row  0      : top bezel (dark grey 64,64,64)
#   Rows 1-21   : CRT screen (dark navy bezel + lit blue-grey screen face)
#   Rows 22-27  : wood cabinet (brown/gold tones)
#   Rows 28-29  : shadow
# Screen FACE (the lit glass pixels): roughly x=3-28, y=4-21 after trimming.
#
# Frames 0-2 = ON (night loop): cycled at frameMs=800 ms when nightOnly=true and night=true.
# Frame 3 = OFF (dayFrame): dark glass, shown by day or under reduced motion by day.
#   The screen pixels are replaced by near-black (30,30,40) with a 1-2px highlight (48,48,64)
#   near the top-left, mimicking a dark CRT with no phosphor glow.
#
# Frame 0: original art (base ON pose, screen at rest brightness)
# Frame 1: screen dims slightly — de-sync / refresh band crossing + scan-line noise
# Frame 2: screen brightens (+18) with cool-blue phosphor shimmer
# Frame 3: screen OFF — dark grey/near-black glass, 1-2px subtle highlight (dayFrame)
# ---------------------------------------------------------------------------

def make_tv_anim():
    src = Image.open(PUB / "objects" / "tv.png").convert("RGBA")
    W, H = src.size  # 32 x 30 (CRT cabinet, HGSS)

    f0 = src.copy()

    # Screen face bounding box (the lit glass area, excluding the outer bezel):
    SX, SY, SW, SH = 3, 4, 26, 18  # x=3-28, y=4-21

    # Frame 1: screen dims slightly — a dark refresh band sweeps through.
    f1 = darken_region(src, SX, SY, SW, SH, 22)
    pix1 = f1.load()
    assert pix1 is not None
    # Lighter scan-line at row SY+6 (mid-screen), alternating pixels for CRT texture.
    for px_x in range(SX, SX + SW, 2):
        r, g, b, a = pix1[px_x, SY + 6]
        if a > 0:
            pix1[px_x, SY + 6] = (min(255, r + 35), min(255, g + 35), min(255, b + 45), a)
    # A second faint lighter band at row SY+12
    for px_x in range(SX + 1, SX + SW, 3):
        r, g, b, a = pix1[px_x, SY + 12]
        if a > 0:
            pix1[px_x, SY + 12] = (min(255, r + 18), min(255, g + 18), min(255, b + 24), a)

    # Frame 2: screen brightens — picture fully on, cool-blue shimmer.
    f2 = lighten_region(src, SX, SY, SW, SH, 18)
    pix2 = f2.load()
    assert pix2 is not None
    for py in range(SY, SY + SH):
        for px_x in range(SX, SX + SW):
            r, g, b, a = pix2[px_x, py]
            if a > 0:
                pix2[px_x, py] = (max(0, r - 4), g, min(255, b + 10), a)

    # Frame 3: screen OFF (dayFrame) — unmistakably dark.
    # ALL screen-face pixels are replaced with flat #2a2a33 (dark grey, no navy, no dots).
    # A single 1-px diagonal highlight (top-left to top-left+1) at #44444f simulates
    # ambient light catch on the unpowered CRT glass — clearly distinguishable from the
    # lit blue screen at a glance.  Nothing else is drawn on the screen area.
    f3 = src.copy()
    pix3 = f3.load()
    assert pix3 is not None
    SCREEN_OFF = (42, 42, 51)    # flat dark grey — #2a2a33 (no blue, no dots)
    HIGHLIGHT  = (68, 68, 79)    # single 1-px diagonal: softer reflection on dark glass
    for py in range(SY, SY + SH):
        for px_x in range(SX, SX + SW):
            r, g, b, a = pix3[px_x, py]
            if a > 0:
                pix3[px_x, py] = (*SCREEN_OFF, a)
    # 1-px diagonal highlight: (SX, SY) and (SX+1, SY+1)
    for diag in range(2):
        px_x, py = SX + diag, SY + diag
        r, g, b, a = pix3[px_x, py]
        if a > 0:
            pix3[px_x, py] = (*HIGHLIGHT, a)

    strip = build_strip([f0, f1, f2, f3])
    out = PUB / "objects" / "tv.png"
    strip.save(out)
    print(f"tv       {W}x{H} -> {strip.size[0]}x{strip.size[1]}  ({len([f0, f1, f2, f3])} frames) -> {out}")


# ---------------------------------------------------------------------------
# Plant sway: 4 frames  (16 x 34  ->  64 x 34)
# Frame 0: original art unchanged (rest).
# Frame 1: the leaves (rows above the pot, the bottom 14px stay fixed) shifted 1px right.
# Frame 2: rest again (identical to frame 0).
# Frame 3: the leaves shifted 1px left.
# Ambient: a slow forward loop 0 -> 1 -> 2 -> 3 (frameMs): rest, right, rest, left. Reactive decor (Water Gun) plays the
# strip as a ping-pong 0,1,2,3,2,1 one-shot (6 steps), which reads as a shake.
# plant.png is already the strip once this has run, so the SOURCE is always the left 16 px cell (frame 0):
# re-running is idempotent.
# ---------------------------------------------------------------------------

PLANT_W = 16


def _shift_leaves(src: Image.Image, dx: int) -> Image.Image:
    """Copy of `src` with the leaf rows (all but the bottom 14 px: the pot) shifted dx px, clipped at the edges."""
    W, H = src.size
    out = src.copy()
    pix_src = src.load()
    pix_out = out.load()
    assert pix_src is not None and pix_out is not None
    LEAF_TOP = 0
    LEAF_BOT = H - 14  # bottom of leaves / top of pot stem
    # clear the leaf area, then repaint shifted
    for py in range(LEAF_TOP, LEAF_BOT):
        for px_x in range(W):
            pix_out[px_x, py] = (0, 0, 0, 0)
    for py in range(LEAF_TOP, LEAF_BOT):
        for px_x in range(W):
            r, g, b, a = pix_src[px_x, py]
            if a > 0:
                nx = px_x + dx
                if 0 <= nx < W:
                    # only write if target is currently transparent (no overlap bleed)
                    if pix_out[nx, py][3] == 0:
                        pix_out[nx, py] = (r, g, b, a)
    return out


def make_plant_anim():
    sheet = Image.open(PUB / "decor" / "plant.png").convert("RGBA")
    H = sheet.size[1]
    src = sheet.crop((0, 0, PLANT_W, H))  # frame 0 = the rest pose (works on the raw 16 px art or an existing strip)
    W = PLANT_W

    frames = [src.copy(), _shift_leaves(src, 1), src.copy(), _shift_leaves(src, -1)]

    strip = build_strip(frames)
    out = PUB / "decor" / "plant.png"
    strip.save(out)
    print(f"plant    {W}x{H} -> {strip.size[0]}x{strip.size[1]}  ({len(frames)} frames) -> {out}")


if __name__ == "__main__":
    make_pc_anim()
    make_tv_anim()
    make_plant_anim()
    print("done.")

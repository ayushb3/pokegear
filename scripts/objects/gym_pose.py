"""Ethan lying on the gym bench, pressing the barbell: 3 frames of a 48x32 overlay (144x32) in the gym
object's own coordinates, so it is drawn exactly over the object art (public/assets/objects/gym.png).
The lying figure is DRAWN at native size, pixel by pixel (no resize or rotation of the sheet, which
squashed him into a blob): 6x6 head with the cap seen from the side, 8 px torso, legs and white shoes,
in the colours sampled from the Ethan sheet (like the HGSS bed-sleep frames). Arms are raised to the bar;
bar height per frame matches scripts/objects/gym.py (lift 0 / 2 / 4).
Preview: GYM_PREVIEW=out.png python scripts/objects/gym_pose.py"""
import os
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent.parent
PUB = ROOT / "public" / "assets"
W, H, FRAMES = 48, 32, 3
OUTL = (0, 0, 0, 255)
SKIN = (216, 160, 120, 255)
SKIN_HI = (248, 208, 184, 255)
SLEEVE = (192, 56, 56, 255)
SLEEVE_HI = (240, 104, 72, 255)

# Ethan sheet palette (ethan.png, right-facing frame)
KEY = {
    "K": OUTL,
    "Y": (0xf8, 0xb0, 0x20, 255),  # cap crown
    "y": (0xb8, 0x70, 0x20, 255),  # cap crown shade
    "T": (0x48, 0x60, 0x60, 255),  # cap brim / band
    "t": (0x38, 0x40, 0x40, 255),
    "B": (0x78, 0x40, 0x40, 255),  # hair
    "S": SKIN,
    "H": SKIN_HI,
    "R": SLEEVE,
    "r": SLEEVE_HI,
    "D": (0x90, 0x30, 0x38, 255),  # jacket shade
    "P": (0x38, 0x40, 0x40, 255),  # trousers
    "p": (0x28, 0x28, 0x38, 255),
    "W": (0xe8, 0xe8, 0xf8, 255),  # shoes
    "w": (0xb8, 0xb0, 0xd0, 255),
}
# 23 x 6 native px, face up, head at the left, light from the top-left. Drawn by hand.
BODY = [
    ".KKKK.KKKKKKKK.........",
    "KYYYTKrrrRRRDPP........",
    "KYyTTKrRRRRRDPPKKKKKKKK",
    "KBBHSKRRRRRRDPPPPPPPWWK",
    "KBSSHKRRRRRRDPPpppppwWK",
    ".KKKK.KKKKKKKKKKKKKKKK.",
]
FIG_W, FIG_H = len(BODY[0]), len(BODY)
LEFT, TOP = 4, 11  # the figure's bottom row (y 16) sits on the pad's top edge
CHEST_X = (11, 15)  # raised arms (profile: two side by side), over the torso
SHOULDER_Y = TOP + 2


def lying_body():
    g = Image.new("RGBA", (FIG_W, FIG_H), (0, 0, 0, 0))
    for y, row in enumerate(BODY):
        for x, c in enumerate(row):
            if c != ".":
                g.putpixel((x, y), KEY[c])
    return g


def frame(lift):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    im.alpha_composite(lying_body(), (LEFT, TOP))
    by = 8 - lift  # bar height (matches gym.py)
    for ax in CHEST_X:
        for y in range(by, SHOULDER_Y + 2):
            im.putpixel((ax - 1, y), OUTL)
            im.putpixel((ax + 1, y), OUTL)
            im.putpixel((ax, y), SKIN_HI if y <= by + 3 else SLEEVE)  # forearm, then sleeve
        for y in range(by - 1, by + 2):  # fist on the bar
            for x in range(ax - 1, ax + 2):
                edge = y in (by - 1, by + 1) or x in (ax - 1, ax + 1)
                im.putpixel((x, y), OUTL if edge else SKIN)
        im.putpixel((ax, by), SKIN_HI)
    return im


if __name__ == "__main__":
    out = PUB / "sprites" / "ethan-bench.png"
    strip = Image.new("RGBA", (W * FRAMES, H), (0, 0, 0, 0))
    for i, lift in enumerate((0, 2, 4)):
        strip.paste(frame(lift), (i * W, 0))
    strip.save(out)
    prev = os.environ.get("GYM_PREVIEW")
    if prev:
        gym = Image.open(PUB / "objects" / "gym.png").convert("RGBA")
        bg = Image.new("RGBA", strip.size, (0xC9, 0xA8, 0x7C, 255))
        bg.alpha_composite(gym)
        bg.alpha_composite(strip)
        bg.resize((strip.width * 6, strip.height * 6), Image.NEAREST).save(prev)

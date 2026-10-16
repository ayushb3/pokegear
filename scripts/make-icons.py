"""Object chip icons (16x16, transparent) for the bag / dock, derived from the art already in public/assets.

Rule (pixel review #3): an icon is either
  - a 2:1 palette-preserving MAJORITY reduction of the object art (each output texel is the most common opaque
    colour of its 2x2 block; the translucent baked shadow is dropped first), or
  - a 1:1 crop of the art (tall pieces: the readable top 16 rows), or
  - hand-placed pixels in the object's own palette (monitor candles; journal, tv, corkboard, fridge, whose art does not reduce legibly).
Never a box / bilinear resample, so no colour appears that is not in the source art. Alpha is strictly 0 / 255.
`check()` runs on every generation and fails on a wrong size, a non-binary alpha or a colour that is not in the source.
Run: python scripts/make-icons.py  (writes public/assets/icons/<id>.png: the bedroom objects, the card, then the
downstairs four, which scripts/make-downstairs-icons.py can also regenerate on its own)."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public" / "assets"
OUT = PUB / "icons"
S = 16


def load(rel, frame=None, fw=None):
    im = Image.open(PUB / rel).convert("RGBA")
    if frame is not None:
        im = im.crop((frame * fw, 0, (frame + 1) * fw, im.height))
    return im


def clean(im):
    """drop the translucent baked shadow, then trim to the opaque pixels"""
    im = im.copy()
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y][3] < 255:
                px[x, y] = (0, 0, 0, 0)
    return im.crop(im.getbbox())


def majority_half(im):
    """2:1 reduce keeping the source palette: each output texel = most common opaque colour of its 2x2 block
    (an edge block with a single opaque pixel stays empty)."""
    w, h = (im.width + 1) // 2, (im.height + 1) // 2
    src = im.load()
    out = Image.new("RGBA", (w, h))
    o = out.load()
    for y in range(h):
        for x in range(w):
            cnt = {}
            for dy in (0, 1):
                for dx in (0, 1):
                    sx, sy = 2 * x + dx, 2 * y + dy
                    if sx < im.width and sy < im.height and src[sx, sy][3] == 255:
                        cnt[src[sx, sy]] = cnt.get(src[sx, sy], 0) + 1
            if sum(cnt.values()) >= 2:
                o[x, y] = max(cnt.items(), key=lambda kv: kv[1])[0]
    return out


def place(im):
    """centre on a transparent 16x16 (never scales; must already fit)"""
    im = im.crop(im.getbbox())
    assert im.width <= S and im.height <= S, im.size
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    out.paste(im, ((S - im.width) // 2, (S - im.height) // 2))
    return out


def reduce(im, box=None):
    """majority-reduce `box` (x0,y0,x1,y1 of the cleaned art) or all of it"""
    im = clean(im)
    if box:
        im = im.crop(box)
    return place(majority_half(im))


def top_rows(im, rows=S):
    """1:1 crop: the readable top `rows` rows, at most 16 columns (centred)"""
    im = clean(im)
    x0 = max(0, (im.width - S) // 2)
    return place(im.crop((x0, 0, min(im.width, x0 + S), min(im.height, rows))))


def monitor():
    """hand-placed (the 2:1 vote loses the light bezel, the SIM tag and the 1 px price line) in the art's own
    palette: the wall screen with its lit bezel, a yellow tag, the green price line over its fill, the wall plate."""
    pal = {
        "o": (56, 76, 104), "H": (144, 176, 200), "C": (112, 144, 176), "L": (80, 108, 140),
        "s": (20, 28, 40), "y": (240, 200, 64), "g": (88, 184, 96), "f": (46, 106, 60),
    }
    return hand([
        ".oooooooooooooo.",
        ".oHHHHHHHHHHHHo.",
        ".oHyyysssssssLo.",
        ".oHssssssssggLo.",
        ".oHsssgsssgffLo.",
        ".oHsggfgsgfffLo.",
        ".oHgffffgffffLo.",
        ".oHffffffffffLo.",
        ".oLLLLLLLLLLLLo.",
        ".oooooooooooooo.",
        "......oooo......",
        ".....oCCCCo.....",
        ".....oooooo.....",
    ], pal)


def hand(rows, pal):
    """hand-placed icon: one character per pixel ('.' = empty), colours sampled from the object's own art
    (check() fails on any colour that is not in it); rows are centred vertically on the 16x16"""
    assert all(len(r) == S for r in rows), [len(r) for r in rows]
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    px = im.load()
    oy = (S - len(rows)) // 2
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != ".":
                px[x, oy + y] = (*pal[ch], 255)
    return im


def journal():
    """an open book: the stand's own cover blue, page cream and ink olive, outline grey"""
    pal = {"k": (64, 64, 64), "b": (47, 111, 143), "w": (240, 232, 208), "g": (128, 136, 96)}
    return hand([
        ".kkkkkkkkkkkkkk.",
        ".kbbbbbbbbbbbbk.",
        ".kbwwwwbbwwwwbk.",
        ".kbggggbbggggbk.",
        ".kbwwwwbbwwwwbk.",
        ".kbggggbbggggbk.",
        ".kbwwwwbbwwwwbk.",
        ".kbggggbbggggbk.",
        ".kbwwwwbbwwwwbk.",
        ".kbbbbbbbbbbbbk.",
        ".kkkkkkkkkkkkkk.",
    ], pal)


def tv():
    """a set with rabbit ears and a lit screen, in the TV art's wood, screen blues and outline grey"""
    pal = {"k": (64, 64, 64), "o": (144, 96, 40), "s": (96, 120, 176), "h": (136, 152, 192),
           "d": (32, 48, 96), "r": (144, 56, 24)}
    return hand([
        ".....k....k.....",
        "......k..k......",
        ".......kk.......",
        "..kkkkkkkkkkkk..",
        "..kooooooooook..",
        "..kohhsssssssok.",
        "..kohssssssssok.",
        "..kossssssssdok.",
        "..kosssssssddok.",
        "..kodddddddddok.",
        "..kooooooooorok.",
        "..kkkkkkkkkkkk..",
        "...k........k...",
    ], pal)


def corkboard():
    """a framed board with pinned notes, in the art's frame browns, cork, paper cream and pin grey"""
    pal = {"k": (79, 64, 43), "f": (120, 96, 64), "c": (136, 112, 80), "w": (248, 232, 208),
           "v": (224, 200, 168), "p": (109, 109, 109)}
    return hand([
        "kkkkkkkkkkkkkkkk",
        "kffffffffffffffk",
        "kfccccccccccccfk",
        "kfcwwwwccvvvvcfk",
        "kfcwpwwccvvpvcfk",
        "kfcwwwwccvvvvcfk",
        "kfccccccccccccfk",
        "kfcvvvvcwwwwccfk",
        "kfcvpvvcwwpwccfk",
        "kfcvvvvcwwwwccfk",
        "kffffffffffffffk",
        "kkkkkkkkkkkkkkkk",
    ], pal)


def fridge():
    """a two-door fridge (freezer above, door below, handles at the split) in the fridge art's blues"""
    pal = {"k": (33, 54, 75), "a": (195, 215, 231), "b": (162, 183, 205), "c": (128, 157, 190),
           "d": (52, 85, 118)}
    return hand([
        "...kkkkkkkkkk...",
        "...kaaaaaaabk...",
        "...kaaaaaaabk...",
        "...kaaaaaadbk...",
        "...kaaaaaadbk...",
        "...kaaaaaaabk...",
        "...kddddddddk...",
        "...kbbbbbbdck...",
        "...kbbbbbbdck...",
        "...kbbbbbbbck...",
        "...kbbbbbbbck...",
        "...kbbbbbbbck...",
        "...kkkkkkkkkk...",
        "....kk....kk....",
    ], pal)


def card():
    """Ethan's face: the top 16 rows of the standing frame, 1:1 (drops the emptier edge column)"""
    stand = load("sprites/ethan.png").crop((32, 0, 64, 32))
    bb = stand.getbbox()
    head = stand.crop((bb[0], bb[1], bb[2], bb[1] + 16))
    if head.width > S:
        px = head.load()
        left = sum(px[0, y][3] > 0 for y in range(head.height))
        right = sum(px[head.width - 1, y][3] > 0 for y in range(head.height))
        head = head.crop((1, 0, head.width, head.height)) if left <= right else head.crop((0, 0, head.width - 1, head.height))
    return place(head)


# icon id -> (source art, frame, frame width): every icon colour must come from here
SOURCES = {
    "bed": ("objects/bed.png", None, None),
    "pc": ("objects/pc-desk.png", 0, 32),
    "piano": ("objects/piano.png", None, None),
    "journal": ("objects/journal.png", None, None),
    "monitor": ("objects/monitor.png", 0, 32),
    "townmap": ("objects/townmap.png", None, None),
    "gym": ("objects/gym.png", 0, 48),
    "card": ("sprites/ethan.png", None, None),
    "fridge": ("objects/fridge.png", None, None),
    "tv": ("objects/tv.png", 0, 32),
    "corkboard": ("objects/corkboard.png", None, None),
    "mom": ("objects/mom.png", None, None),
}


def check(name, im):
    """size, binary alpha, and every colour comes from the source art"""
    assert im.size == (S, S), f"{name}: {im.size}"
    rel, f, fw = SOURCES[name]
    src = load(rel, f, fw)
    allowed = {p for p in src.getdata() if p[3] == 255}
    for p in im.getdata():
        assert p[3] in (0, 255), f"{name}: alpha {p[3]}"
        assert p[3] == 0 or p in allowed, f"{name}: colour {p} is not in the art"
    assert im.getbbox(), f"{name}: empty"


def make_bedroom():
    return {
        # top 32 rows: pillow and blanket read; the footboard would push past 16 rows
        "bed": reduce(load("objects/bed.png"), (0, 0, 28, 32)),
        "pc": reduce(load("objects/pc-desk.png", 0, 32)),
        "piano": reduce(load("objects/piano.png")),
        "journal": journal(),
        "monitor": monitor(),
        "townmap": reduce(load("objects/townmap.png")),
        # the bench with its barbell (the rack on the right would not fit)
        "gym": reduce(load("objects/gym.png", 0, 48), (0, 0, 32, 27)),
        "card": card(),
    }


def make_downstairs():
    return {
        "fridge": fridge(),
        "tv": tv(),
        "corkboard": corkboard(),
        "mom": top_rows(load("objects/mom.png")),
    }


def write(icons):
    OUT.mkdir(parents=True, exist_ok=True)
    for k, im in icons.items():
        check(k, im)
        im.save(OUT / f"{k}.png")
        print("wrote", k)


if __name__ == "__main__":
    write({**make_bedroom(), **make_downstairs()})

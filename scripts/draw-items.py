"""Draw the plant drop items (item.* slots) into public/assets/items/.

The raw pack has no berry / medal / plush art (checked: bag-menu.png is pocket icons only, the tile sheets are
interiors), so every item is drawn here, in the same style as draw-objects.py: 1 px #404040 outline, flat 2-3 tone
shading, native pixels (never scaled). Each sprite is an ASCII map + palette, so the art is reviewable as text.
Run: python3 scripts/draw-items.py
"""
from pathlib import Path
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "public" / "assets" / "items"
O = (0x40, 0x40, 0x40, 255)  # outline, shared with the bed / desk crops


def rgb(h: str):
    return (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16), 255)


def sprite(name: str, rows: list[str], pal: dict[str, tuple]):
    w = len(rows[0])
    for i, r in enumerate(rows):
        assert len(r) == w, f"{name}: row {i} is {len(r)} wide, expected {w}"
    im = Image.new("RGBA", (w, len(rows)), (0, 0, 0, 0))
    px = im.load()
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c == ".":
                continue
            px[x, y] = O if c == "O" else pal[c]
    OUT.mkdir(parents=True, exist_ok=True)
    im.save(OUT / f"{name}.png")


# --- Berries (16 x 16): round fruit, 3 tones (b base, h highlight, d shade), green leaf + stem ----------------
BERRY = [
    "................",
    "......gg........",
    ".....gGGg.......",
    ".......s........",
    "....OOOsOOO.....",
    "...OhhbbbbbO....",
    "..OhhbbbbbbbO...",
    "..ObbbbbbbbbO...",
    "..ObbbbbbbbdO...",
    "..ObbbbbbbddO...",
    "..ObbbbbbbddO...",
    "...ObbbbbddO....",
    "...OdbbbddOO....",
    "....OddddOO.....",
    ".....OOOO.......",
    "................",
]
LEAF = {"g": rgb("#58b848"), "G": rgb("#2f8a3a"), "s": rgb("#7a5a30")}


def berry(name: str, base: str, hi: str, dark: str, rows=BERRY):
    sprite(name, rows, {**LEAF, "b": rgb(base), "h": rgb(hi), "d": rgb(dark)})


berry("oran-berry", "#4f7fd8", "#9cc0f8", "#2f55a0")
berry("cheri-berry", "#d83a3a", "#f89090", "#9c2020")
# Pecha: pinkish and a little heart-shaped (a dip at the top, a point at the bottom)
PECHA = list(BERRY)
PECHA[4] = "....OOsOOOOOO..."
PECHA[5] = "...OhhOObbbbO..."
PECHA[13] = ".....OdddOO....."
PECHA[14] = "......OOO......."
berry("pecha-berry", "#f8a8b8", "#ffe0e8", "#d06888", PECHA)

# --- Medal (16 x 16): red/blue ribbon, gold disc with a star ------------------------------------------------
MEDAL = [
    "...OOO....OOO...",
    "...ORrO..OBbO...",
    "....ORrOOBbO....",
    ".....ORrBbO.....",
    "......ORbO......",
    ".....OOOOOO.....",
    "....OhhYYYYO....",
    "...OhYYYYYYdO...",
    "...OYYYwYYYdO...",
    "...OYYwwwYYdO...",
    "...OYYYwYYddO...",
    "...OYYwYwYddO...",
    "....OYYYYddO....",
    "....OOddddOO....",
    ".....OOOOOO.....",
    "................",
]
sprite(
    "medal",
    MEDAL,
    {"R": rgb("#d84848"), "r": rgb("#f08080"), "B": rgb("#4870d8"), "b": rgb("#88a8f0"),
     "Y": rgb("#f0c030"), "h": rgb("#fff0a0"), "d": rgb("#b88818"), "w": rgb("#fff8d8")},
)

# --- Labubu (16 x 20): tan monster plush, tall pointed ears, big eyes, wide toothy grin -----------------------
LABUBU = [
    "..OO........OO..",
    ".OTTO......OTTO.",
    ".OTPO......OPTO.",
    ".OTPTO....OTPTO.",
    "..OTTOOOOOOTTO..",
    "..OTTTTTTTTTTO..",
    ".OTTTTTTTTTTTTO.",
    ".OTTWWTTTTWWTTO.",
    ".OTTWKTTTTWKTTO.",
    ".OTTTTTTTTTTTTO.",
    "..OTOOOOOOOOTO..",
    "..OTOWOWOWOWOO..",
    "..OTTOOOOOOOTO..",
    "...OTTTTTTTTO...",
    "..OTTTTTTTTTTO..",
    "..OTTtTTTTtTTO..",
    "..OTTtTTTTtTTO..",
    "...OTTTTTTTTO...",
    "..OOTTOOOOTTOO..",
    "..OOOO....OOOO..",
]
sprite(
    "labubu",
    LABUBU,
    {"T": rgb("#c8a070"), "t": rgb("#a07848"), "P": rgb("#f0a8b0"), "W": rgb("#ffffff"), "K": rgb("#303030")},
)

# --- Jellycat-style bunny (16 x 20): soft cream bunny, long rounded ears, tiny stitched face ------------------
BUNNY = [
    "...OOO....OOO...",
    "..OCCCO..OCCCO..",
    "..OCPCO..OCPCO..",
    "..OCPCO..OCPCO..",
    "..OCPCO..OCPCO..",
    "..OCCCOOOOCCCO..",
    "...OCCCCCCCCO...",
    "..OCCCCCCCCCCO..",
    "..OCCKCCCCKCCO..",
    "..OCCCCNNCCCCO..",
    "..OCCCCCCCCCCO..",
    "...OCCCCCCCCO...",
    "....OCCCCCCO....",
    "...OCCCCCCCCO...",
    "..OCCCCCCCCCCO..",
    "..OCCCCCCCCCcO..",
    "..OCCCCCCCCCcO..",
    "...OCCCCCCCcO...",
    "..OOCCOOOOCCOO..",
    "..OOOO....OOOO..",
]
sprite(
    "jellycat",
    BUNNY,
    {"C": rgb("#f4e4d0"), "c": rgb("#d8c0a8"), "P": rgb("#f0b8c0"), "K": rgb("#303030"), "N": rgb("#e08890")},
)
print("items ->", OUT)

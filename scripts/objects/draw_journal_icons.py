"""Hand-pixelled Pokegear tab icons for the Desk Journal (12x12) plus the pager arrow (5x9).
One icon per project tag in src/content/journal/*.md; `default` covers any other tag.
Output: public/assets/journal/. Slots: icon.journal.<project>, journal.arrow in src/assets/assets.json.
Run: python scripts/objects/draw_journal_icons.py"""
from pathlib import Path
from PIL import Image

OUT = Path(__file__).resolve().parents[2] / "public" / "assets" / "journal"
OUT.mkdir(parents=True, exist_ok=True)


def hexc(s):
    return (int(s[1:3], 16), int(s[3:5], 16), int(s[5:7], 16), 255)


def draw(name, palette, rows):
    w, h = len(rows[0]), len(rows)
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        assert len(row) == w, (name, y)
        for x, ch in enumerate(row):
            if ch in palette:
                im.putpixel((x, y), hexc(palette[ch]))
    im.save(OUT / f"{name}.png")


# BubblyChef: chef hat (white puffs, grey shade, orange band)
draw("icon-bubblychef", {"w": "#ffffff", "s": "#c9c9d2", "o": "#ffb347", "k": "#8a8a96"}, [
    "............",
    "...kkk.kkk..",
    "..kwwwkwwwk.",
    ".kwwwwwwwwwk",
    ".kwwwwwwwwsk",
    ".kwwwwwwwwsk",
    "..kwwwwwwsk.",
    "...kkkkkkk..",
    "...kooooosk.",
    "...kooooosk.",
    "...kkkkkkk..",
    "............",
])
# Portfolio: house (orange roof, white walls, blue door)
draw("icon-portfolio", {"r": "#ff6a3a", "d": "#a8381a", "w": "#ffffff", "b": "#6cc4ff", "k": "#8a8a96"}, [
    "............",
    ".....rr.....",
    "....rrrr....",
    "...rrrrrr...",
    "..rrrrrrrr..",
    ".rrrrrrrrrr.",
    "..dddddddd..",
    "..wwwwwwww..",
    "..wwwbbwww..",
    "..wwwbbwww..",
    "..kkkkkkkk..",
    "............",
])
# TradeDesk: candle chart (green up, red down, wicks)
draw("icon-tradedesk", {"g": "#6bd48a", "r": "#ff6a6a", "k": "#c9c9d2"}, [
    "............",
    "..k.....k...",
    "..k..k..k.g.",
    ".ggg.k.rrrg.",
    ".ggg.rrr.gg.",
    ".ggg.rrr....",
    ".ggg.rrr.k..",
    "..k..rrr.k..",
    "..k..rrr....",
    "..k...k.....",
    "............",
    "............",
])
# default: tiny notebook
draw("icon-default", {"c": "#6cc4ff", "w": "#ffffff", "k": "#8a8a96", "o": "#ff6a3a"}, [
    "............",
    "..kkkkkkkk..",
    "..kcccccck..",
    "..kcwwwwck..",
    "..kcwkkwck..",
    "..kcwwwwck..",
    "..kcwkkwck..",
    "..kcwwwwck..",
    "..kccccock..",
    "..kkkkkkkk..",
    "............",
    "............",
])
# pager arrow, points right (the left one is mirrored in CSS)
draw("arrow", {"w": "#ffffff"}, [
    "w....",
    "ww...",
    "www..",
    "wwww.",
    "wwwww",
    "wwww.",
    "www..",
    "ww...",
    "w....",
])
print("ok")
